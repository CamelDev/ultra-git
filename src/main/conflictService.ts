import { createHash, randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { gitService } from './git'
import { composeConflictResult, deriveConflictRegions, validateRegionSelection } from './conflictRegions'
import type { BlobView, ConflictDocument, ConflictErrorCode, ConflictRegion, ConflictType, OperationActionResult, OperationSnapshot, ResolutionSelection } from '../shared/conflicts'
import { conflictCandidateService } from './conflictCandidates'

const exec = promisify(execFile)
const MAX_BYTES = 8 * 1024 * 1024
const locks = new Map<string, Promise<unknown>>()
const undoEntries = new Map<string, { repo: string; generation: string; path: string; snapshot: any }>()

export class ConflictServiceError extends Error { constructor(public code: ConflictErrorCode, message: string) { super(message) } }
const hash = (v: Buffer | string) => createHash('sha256').update(v).digest('hex')
async function run(repo: string, args: string[], input?: string | Buffer) {
  try { return (await exec('git', ['-C', repo, ...args], { input, maxBuffer: 16 * 1024 * 1024 })).stdout }
  catch (e: any) { throw new ConflictServiceError('PREFLIGHT_FAILED', e.stderr || e.message || 'Git command failed') }
}
async function runIndexInfo(repo: string, input: string) {
  await new Promise<void>((resolve, reject) => { const child = spawn('git', ['-C', repo, 'update-index', '--index-info']); let stderr = ''; child.stderr.on('data', x => { stderr += x }); child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new ConflictServiceError('POSTCONDITION_FAILED', stderr || 'Unable to restore index'))); child.stdin.end(input) })
}
function safePath(repo: string, rel: string) {
  if (!rel || path.isAbsolute(rel) || rel.includes('\0')) throw new ConflictServiceError('PATH_CONTAINMENT', 'Invalid conflict path')
  const root = fs.realpathSync(repo), candidate = path.resolve(root, rel)
  if (candidate !== root && !candidate.startsWith(root + path.sep)) throw new ConflictServiceError('PATH_CONTAINMENT', 'Conflict path escapes repository')
  try { const real = fs.realpathSync(candidate); if (real !== root && !real.startsWith(root + path.sep)) throw new ConflictServiceError('PATH_CONTAINMENT', 'Conflict path escapes repository') } catch (e: any) { if (e instanceof ConflictServiceError) throw e }
  return candidate
}
async function withLock<T>(repo: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(repo) ?? Promise.resolve(); let release!: () => void
  const current = new Promise<void>(resolve => { release = resolve }); locks.set(repo, previous.then(() => current))
  await previous
  try { return await fn() } finally { release(); if (locks.get(repo) === current) locks.delete(repo) }
}
type Stage = { mode: string; oid: string; stage: number; file: string }
async function stages(repo: string): Promise<Stage[]> {
  const raw = await run(repo, ['ls-files', '-u', '-z']); const out: Stage[] = []
  for (const item of raw.split('\0').filter(Boolean)) { const m = item.match(/^(\d+) ([0-9a-f]+) (\d)\t([\s\S]+)$/); if (m) out.push({ mode: m[1], oid: m[2], stage: Number(m[3]), file: m[4] }) }
  return out
}
async function blob(repo: string, oid?: string, mode?: string): Promise<BlobView> {
  if (!oid) return { bytes: '', hash: hash(''), byteLength: 0, eol: 'none', hasFinalNewline: false, isBinary: false, mode }
  const value = Buffer.from(await run(repo, ['cat-file', 'blob', oid]), 'utf8'); if (value.length > MAX_BYTES) throw new ConflictServiceError('SIZE_LIMIT', 'Conflict file exceeds size limit')
  const text = value.toString('utf8'); const eols = [...text.matchAll(/\r\n|\n|\r/g)].map(m => m[0]); const eol = eols.length === 0 ? 'none' : eols.every(x => x === '\r\n') ? 'crlf' : eols.every(x => x === '\n') ? 'lf' : 'mixed'
  return { oid, mode, bytes: text, hash: hash(value), byteLength: value.length, eol, hasFinalNewline: /\r$|\n$/.test(text), isBinary: value.includes(0) }
}
function kindFor(entries: Stage[]): ConflictType { const s = new Set(entries.map(x => x.stage)); if (s.has(1)) return 'both-modified'; if (s.has(2) && !s.has(3)) return 'added-by-us'; if (s.has(3) && !s.has(2)) return 'added-by-them'; return 'other' }
async function document(repo: string, generation: string, file: string, entries: Stage[]): Promise<ConflictDocument> {
  const get = (n: number) => entries.find(x => x.stage === n)
  const base = await blob(repo, get(1)?.oid, get(1)?.mode), stage2 = await blob(repo, get(2)?.oid, get(2)?.mode), stage3 = await blob(repo, get(3)?.oid, get(3)?.mode)
  const binary = base.isBinary || stage2.isBinary || stage3.isBinary
  const regions: ConflictRegion[] = binary ? [] : deriveConflictRegions({ generation, stageOids: { base: base.oid, current: stage2.oid, incoming: stage3.oid }, modes: { base: base.mode, current: stage2.mode, incoming: stage3.mode }, base: base.bytes, current: stage2.bytes, incoming: stage3.bytes, eol: stage2.eol, hasFinalNewline: stage2.hasFinalNewline })
  return { repoId: fs.realpathSync(repo), path: file, generation, conflictType: kindFor(entries), base, stage2, stage3, regions, isBinary: binary, eol: stage2.eol, hasFinalNewline: stage2.hasFinalNewline }
}
async function snapshot(repo: string): Promise<OperationSnapshot> {
  const real = fs.realpathSync(repo), status = await gitService.getMergeStatus(real), entries = await stages(real), grouped = new Map<string, Stage[]>()
  for (const e of entries) grouped.set(e.file, [...(grouped.get(e.file) ?? []), e])
  const generation = hash(JSON.stringify({ status, entries }))
  const conflicts = [...grouped.entries()].map(([p, xs]) => ({ path: p, status: 'UNMERGED', conflictType: kindFor(xs) }))
  const kind = status.isRebase ? 'rebase' : status.isCherryPick ? 'cherry-pick' : 'merge'
  const phase = conflicts.length ? 'conflicted' : status.inProgress ? 'ready-to-continue' : 'completed'
  return { repoId: real, generation, kind, phase, roles: { current: status.branchName ?? 'current', incoming: status.currentCommitSubject ?? 'incoming', currentRole: status.isRebase ? 'onto' : 'current', incomingRole: status.isRebase ? 'replayed' : 'incoming' }, currentStep: status.currentStep, totalSteps: status.totalSteps, subject: status.currentCommitSubject, conflicts, nextConflict: conflicts[0]?.path }
}
async function mutate(repo: string, fn: () => Promise<void>) { return withLock(fs.realpathSync(repo), fn) }

export const conflictService = {
  getSnapshot: snapshot,
  getDocument: async (repo: string, file: string, expectedGeneration?: string) => { safePath(repo, file); const snap = await snapshot(repo); if (expectedGeneration && expectedGeneration !== snap.generation) throw new ConflictServiceError('STALE_GENERATION', 'Conflict operation has advanced'); const xs = (await stages(repo)).filter(x => x.file === file); if (!xs.length) throw new ConflictServiceError('STALE_OID', 'File is no longer conflicted'); return document(repo, snap.generation, file, xs) },
  apply: async (repo: string, file: string, selections: ResolutionSelection[], expectedGeneration: string) => mutate(repo, async () => {
    const snap = await snapshot(repo); if (snap.generation !== expectedGeneration) throw new ConflictServiceError('STALE_GENERATION', 'Conflict operation has advanced'); const doc = await conflictService.getDocument(repo, file, expectedGeneration); if (doc.isBinary) throw new ConflictServiceError('UNSUPPORTED_CONFLICT', 'Binary conflicts require file-level replacement');
    const choices: Record<string, any> = {}; for (const region of doc.regions) { const selected = selections.find(x => x.regionId === region.id); if (!selected) throw new ConflictServiceError('STALE_REGION', 'Every conflict region must be resolved'); validateRegionSelection(region, expectedGeneration, selected); choices[region.id] = selected }
    const result = composeConflictResult(doc, choices); const bytes = Buffer.from(result); if (bytes.length > MAX_BYTES) throw new ConflictServiceError('SIZE_LIMIT', 'Resolved file exceeds size limit'); const full = safePath(repo, file); const undo = path.join(repo, '.git', 'ultra-git-conflict-undo', randomUUID()); fs.mkdirSync(undo, { recursive: true }); const old = fs.existsSync(full) ? fs.readFileSync(full) : null; const oldStages = (await stages(repo)).filter(x => x.file === file); fs.writeFileSync(path.join(undo, 'worktree'), old ?? Buffer.alloc(0)); fs.writeFileSync(path.join(undo, 'metadata.json'), JSON.stringify({ existed: !!old, stages: oldStages }));
    const dir = path.dirname(full);
    fs.mkdirSync(dir, { recursive: true });
    const temp = path.join(dir, `.${path.basename(full)}.${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(temp, bytes);
      try {
        fs.renameSync(temp, full);
      } catch (err: any) {
        if (err?.code === 'EXDEV' || err?.code === 'EPERM') {
          fs.copyFileSync(temp, full);
          try { fs.unlinkSync(temp); } catch { /* ignore */ }
        } else {
          throw err;
        }
      }
      await run(repo, ['add', '--', file]);
      const remaining = (await stages(repo)).some(x => x.file === file);
      if (remaining) throw new ConflictServiceError('POSTCONDITION_FAILED', 'Git did not stage a complete resolution');
      const after = await snapshot(repo);
      const token = randomUUID();
      undoEntries.set(token, { repo: fs.realpathSync(repo), generation: after.generation, path: file, snapshot: { dir: undo, resultHash: hash(bytes) } });
      return { token, snapshot: after }
    }
    catch (e) {
      if (fs.existsSync(temp)) {
        try { fs.unlinkSync(temp); } catch { /* ignore */ }
      }
      await restore(repo, file, undo);
      throw e;
    }
  }),
  undo: async (token: string) => { const entry = undoEntries.get(token); if (!entry) throw new ConflictServiceError('UNDO_EXPIRED', 'Undo Resolution has expired'); return mutate(entry.repo, async () => { const snap = await snapshot(entry.repo); if (snap.generation !== entry.generation) throw new ConflictServiceError('UNDO_EXPIRED', 'Operation has advanced'); await restore(entry.repo, entry.path, entry.snapshot.dir); undoEntries.delete(token); return snapshot(entry.repo) }) },
  continue: async (repo: string) => mutate(repo, async () => { const s = await snapshot(repo); if (s.phase === 'conflicted') throw new ConflictServiceError('PREFLIGHT_FAILED', 'Resolve all conflicts before continuing'); await run(repo, ['-c', 'core.editor=true', s.kind === 'rebase' ? 'rebase' : s.kind === 'cherry-pick' ? 'cherry-pick' : 'merge', s.kind === 'rebase' ? '--continue' : '--continue']); return snapshot(repo) }),
  skip: async (repo: string) => mutate(repo, async () => { const s = await snapshot(repo); if (s.kind !== 'rebase') throw new ConflictServiceError('PREFLIGHT_FAILED', 'Skip is only available during rebase'); await run(repo, ['rebase', '--skip']); return snapshot(repo) }),
  abort: async (repo: string) => mutate(repo, async () => { const s = await snapshot(repo); const command = s.kind === 'rebase' ? ['rebase', '--abort'] : s.kind === 'cherry-pick' ? ['cherry-pick', '--abort'] : ['merge', '--abort']; await run(repo, command); return snapshot(repo) })
  , candidates: conflictCandidateService
}
async function restore(repo: string, file: string, dir: string) { const full = safePath(repo, file); const meta = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf8')); if (meta.existed) fs.copyFileSync(path.join(dir, 'worktree'), full); else if (fs.existsSync(full)) fs.rmSync(full); await run(repo, ['update-index', '--force-remove', '--', file]).catch(() => {}); if (meta.stages.length) { const info = meta.stages.map((x: Stage) => `${x.mode} ${x.oid} ${x.stage}\t${file}\n`).join(''); await runIndexInfo(repo, info) } }

export type ConflictServiceResult = OperationActionResult
