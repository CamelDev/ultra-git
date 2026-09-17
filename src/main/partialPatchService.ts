import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { PartialDiff, PartialHunk, PartialPatchTarget, PartialSelection, PartialTransactionResult } from '../shared/conflicts'

const MAX_SELECTIONS = 200
const MAX_PATCH_BYTES = 8 * 1024 * 1024
const locks = new Map<string, Promise<void>>()
type Entry = { mode: string; oid: string; stage: number; path: string }
type FileState = { path: string; exists: boolean; bytes?: Buffer; mode?: number; entry?: Entry }
type Snapshot = { files: FileState[] }
type Transaction = { repo: string; before: Snapshot; after: Snapshot; generation: string; undone: boolean }
const transactions = new Map<string, Transaction>()

export class PartialPatchError extends Error { constructor(public code: 'STALE_DIFF' | 'PREFLIGHT_FAILED' | 'PATH_CONTAINMENT' | 'UNSUPPORTED_CONFLICT' | 'UNDO_EXPIRED', message: string) { super(message) } }
const digest = (v: string | Buffer) => createHash('sha256').update(v).digest('hex')
async function git(repo: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-C', repo, ...args]); let stdout = ''; let stderr = ''
    child.stdout.on('data', value => { stdout += value; if (Buffer.byteLength(stdout) > 32 * 1024 * 1024) child.kill() })
    child.stderr.on('data', value => { stderr += value })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new PartialPatchError('PREFLIGHT_FAILED', stderr || `git exited with ${code}`)))
    if (input !== undefined) child.stdin.end(input); else child.stdin.end()
  }).catch((e: any) => { if (e instanceof PartialPatchError) throw e; throw new PartialPatchError('PREFLIGHT_FAILED', e.message || 'Git operation failed') })
}
function safePath(repo: string, file: string) {
  if (!file || path.isAbsolute(file) || file.includes('\0') || file.split('/').includes('..')) throw new PartialPatchError('PATH_CONTAINMENT', 'Invalid repository path')
  const root = fs.realpathSync(repo), candidate = path.resolve(root, file)
  if (candidate !== root && !candidate.startsWith(root + path.sep)) throw new PartialPatchError('PATH_CONTAINMENT', 'Path escapes repository')
  return candidate
}
async function exclusive<T>(repo: string, fn: () => Promise<T>) {
  const previous = locks.get(repo) || Promise.resolve(); let release!: () => void
  const current = new Promise<void>(resolve => { release = resolve }); const queued = previous.then(() => current); locks.set(repo, queued); await previous
  try { return await fn() } finally { release(); if (locks.get(repo) === queued) locks.delete(repo) }
}
function parseHunks(raw: string, file: string, generation: string): PartialHunk[] {
  const lines = raw.split('\n'), out: PartialHunk[] = []
  let header = '', body: string[] = []
  const flush = () => { if (!header) return; const m = header.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/) ; if (!m) return; const oldStart = Number(m[1]), oldCount = Number(m[2] || 1), newStart = Number(m[3]), newCount = Number(m[4] || 1); const id = digest(`${generation}:${file}:${out.length}:${header}:${body.join('\n')}`); out.push({ id, path: file, header, lines: body, lineIds: body.map((line, index) => digest(`${id}:${index}:${line}`)), oldStart, oldCount, newStart, newCount }); body = [] }
  for (const line of lines) { if (line.startsWith('@@ ')) { flush(); header = line } else if (header) body.push(line) }
  flush(); return out
}
function patchFor(raw: string, selected: Array<{ hunk: PartialHunk; lineIds?: string[] }>) {
  const first = raw.split('\n').findIndex(x => x.startsWith('diff --git ')); if (first < 0) throw new PartialPatchError('STALE_DIFF', 'Diff no longer exists')
  const prefix = raw.split('\n').slice(first).filter(x => x.startsWith('diff --git ') || x.startsWith('index ') || x.startsWith('--- ') || x.startsWith('+++ ')).slice(0, 4)
  const chunks = selected.map(({ hunk, lineIds }) => {
    if (!lineIds || lineIds.length === 0) return `${hunk.header}\n${hunk.lines.join('\n')}`
    const wanted = new Set(lineIds), ids = hunk.lineIds || []
    const chunks: string[] = []
    for (let index = 0, oldOffset = 0, newOffset = 0; index < hunk.lines.length;) {
      if (hunk.lines[index].startsWith(' ')) { oldOffset++; newOffset++; index++; continue }
      const start = index
      while (index < hunk.lines.length && !hunk.lines[index].startsWith(' ')) index++
      const group = hunk.lines.slice(start, index)
      const groupIds = ids.slice(start, index)
      if (groupIds.some(id => wanted.has(id))) {
        const before: string[] = []
        let cursor = start - 1
        while (cursor >= 0 && hunk.lines[cursor].startsWith(' ')) { before.unshift(hunk.lines[cursor]); cursor-- }
        const after: string[] = []
        cursor = index
        while (cursor < hunk.lines.length && hunk.lines[cursor].startsWith(' ')) { after.push(hunk.lines[cursor]); cursor++ }
        const lines = [...before, ...group, ...after]
        let oldCount = 0, newCount = 0
        for (const line of lines) { if (line[0] !== '+') oldCount++; if (line[0] !== '-') newCount++ }
        const oldStart = hunk.oldStart + oldOffset - before.length
        const newStart = hunk.newStart + newOffset - before.length
        chunks.push(`@@ -${Math.max(1, oldStart)},${oldCount} +${Math.max(1, newStart)},${newCount} @@\n${lines.join('\n')}`)
      }
      for (const line of group) { if (line[0] !== '+') oldOffset++; if (line[0] !== '-') newOffset++ }
    }
    if (chunks.length === 0) throw new PartialPatchError('PREFLIGHT_FAILED', 'Selection does not contain changed lines')
    return chunks.join('\n')
  })
  return `${prefix.join('\n')}\n${chunks.join('\n')}\n`
}
async function rawDiff(repo: string, file: string, target: PartialPatchTarget) {
  const args = ['diff', '--binary', '--full-index', '--no-ext-diff', '--unified=3']
  if (target === 'unstage') args.push('--cached')
  if (target === 'staged-discard') args.push('HEAD')
  args.push('--', file); return git(repo, args)
}
async function entries(repo: string, file: string): Promise<Entry | undefined> {
  const raw = await git(repo, ['ls-files', '-s', '--', file]); const m = raw.match(/^(\d+) ([0-9a-f]+) (\d)\t([\s\S]+)$/m)
  return m ? { mode: m[1], oid: m[2], stage: Number(m[3]), path: m[4] } : undefined
}
async function snapshot(repo: string, files: string[]): Promise<Snapshot> {
  const result: FileState[] = []
  for (const file of files) { const full = safePath(repo, file); const exists = fs.existsSync(full); result.push({ path: file, exists, bytes: exists ? fs.readFileSync(full) : undefined, mode: exists ? fs.statSync(full).mode & 0o777 : undefined, entry: await entries(repo, file) }) }
  return { files: result }
}
async function restore(repo: string, snap: Snapshot) {
  for (const state of snap.files) {
    const full = safePath(repo, state.path)
    if (state.exists) { fs.mkdirSync(path.dirname(full), { recursive: true }); fs.writeFileSync(full, state.bytes!); if (state.mode !== undefined) fs.chmodSync(full, state.mode) } else if (fs.existsSync(full)) fs.rmSync(full, { force: true })
    if (state.entry) await git(repo, ['update-index', '--add', '--cacheinfo', `${state.entry.mode},${state.entry.oid},${state.path}`])
    else await git(repo, ['update-index', '--remove', '--', state.path]).catch(() => '')
  }
}
async function currentGeneration(repo: string, file: string, target: PartialPatchTarget) { return digest(await rawDiff(repo, file, target)) }

export const partialPatchService = {
  getPartialDiff: async (repo: string, file: string, target: PartialPatchTarget): Promise<PartialDiff> => exclusive(repo, async () => {
    safePath(repo, file); const conflict = await git(repo, ['ls-files', '-u', '--', file]); if (conflict.trim()) throw new PartialPatchError('UNSUPPORTED_CONFLICT', 'Unmerged paths must use the conflict resolver')
    const raw = await rawDiff(repo, file, target), generation = digest(raw); return { repository: fs.realpathSync(repo), path: file, target, generation, hunks: parseHunks(raw, file, generation), binary: /Binary files/.test(raw) }
  }),
  apply: async (repo: string, target: PartialPatchTarget, selections: PartialSelection[], generation: string): Promise<PartialTransactionResult> => exclusive(repo, async () => {
    if (!Array.isArray(selections) || selections.length === 0 || selections.length > MAX_SELECTIONS) throw new PartialPatchError('PREFLIGHT_FAILED', 'Invalid selection count')
    if (typeof generation !== 'string' || generation.length === 0) throw new PartialPatchError('STALE_DIFF', 'Missing diff generation')
    const grouped = new Map<string, PartialSelection[]>(); for (const s of selections) { safePath(repo, s.path); grouped.set(s.path, [...(grouped.get(s.path) || []), s]) }
    const diffs: Array<{ diff: PartialDiff; raw: string; chosen: PartialHunk[] }> = []
    for (const [file, selected] of grouped) { const raw = await rawDiff(repo, file, target), actual = digest(raw); if (selected.some(x => x.generation !== actual)) throw new PartialPatchError('STALE_DIFF', 'The diff changed; refresh before applying'); const d = { repository: fs.realpathSync(repo), path: file, target, generation: actual, hunks: parseHunks(raw, file, actual), binary: /Binary files/.test(raw) }; const byId = new Map(d.hunks.map(x => [x.id, x])); const chosen = selected.map(x => { const hunk = byId.get(x.hunkId); if (!hunk) throw new PartialPatchError('STALE_DIFF', 'A selected hunk is stale or ambiguous'); return { hunk, lineIds: x.lineIds } }); if (d.binary) throw new PartialPatchError('PREFLIGHT_FAILED', 'Binary files do not support partial selection'); diffs.push({ diff: d, raw, chosen }) }
    const files = [...grouped.keys()], before = await snapshot(repo, files)
    try {
      for (const item of diffs) { const patch = patchFor(item.raw, item.chosen); if (Buffer.byteLength(patch) > MAX_PATCH_BYTES) throw new PartialPatchError('PREFLIGHT_FAILED', 'Patch is too large'); const args = ['apply', '--whitespace=nowarn', '--recount']; if (target === 'stage' || target === 'unstage') args.push('--cached'); if (target === 'unstage' || target === 'discard' || target === 'staged-discard') args.push('--reverse'); if (target === 'staged-discard') await git(repo, ['reset', 'HEAD', '--', item.diff.path]); await git(repo, [...args, '-'], patch) }
    } catch (e) { await restore(repo, before); throw e }
    const after = await snapshot(repo, files), id = randomUUID(); transactions.set(id, { repo: fs.realpathSync(repo), before, after, generation, undone: false }); return { transactionId: id, generation: digest(JSON.stringify(after)), undoAvailable: true, redoAvailable: false }
  }),
  undo: async (id: string): Promise<PartialTransactionResult> => { const tx = transactions.get(id); if (!tx || tx.undone) throw new PartialPatchError('UNDO_EXPIRED', 'Undo is no longer available'); return exclusive(tx.repo, async () => { const current = await snapshot(tx.repo, tx.before.files.map(x => x.path)); if (digest(JSON.stringify(current)) !== digest(JSON.stringify(tx.after))) throw new PartialPatchError('UNDO_EXPIRED', 'Repository changed externally'); await restore(tx.repo, tx.before); tx.undone = true; return { transactionId: id, generation: digest(JSON.stringify(tx.before)), undoAvailable: false, redoAvailable: true } }) },
  redo: async (id: string): Promise<PartialTransactionResult> => { const tx = transactions.get(id); if (!tx || !tx.undone) throw new PartialPatchError('UNDO_EXPIRED', 'Redo is no longer available'); return exclusive(tx.repo, async () => { const current = await snapshot(tx.repo, tx.before.files.map(x => x.path)); if (digest(JSON.stringify(current)) !== digest(JSON.stringify(tx.before))) throw new PartialPatchError('UNDO_EXPIRED', 'Repository changed externally'); await restore(tx.repo, tx.after); tx.undone = false; return { transactionId: id, generation: digest(JSON.stringify(tx.after)), undoAvailable: true, redoAvailable: false } }) }
}
