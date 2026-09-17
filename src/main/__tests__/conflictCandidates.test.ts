import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'
import { deriveConflictRegions } from '../conflictRegions'
import { conflictCandidateService, generateConflictCandidates } from '../conflictCandidates'
import type { ConflictDocument } from '../../shared/conflicts'

const repos = new Set<string>()
function doc(current: string, incoming: string, base = 'one\ntwo\n'): ConflictDocument {
  const baseView = { oid: 'base', bytes: base, hash: 'base', byteLength: base.length, eol: 'lf' as const, hasFinalNewline: true, isBinary: false }
  const currentView = { oid: 'current', bytes: current, hash: current, byteLength: current.length, eol: 'lf' as const, hasFinalNewline: true, isBinary: false }
  const incomingView = { oid: 'incoming', bytes: incoming, hash: incoming, byteLength: incoming.length, eol: 'lf' as const, hasFinalNewline: true, isBinary: false }
  const regions = deriveConflictRegions({ generation: 'generation', stageOids: { base: 'base', current: 'current', incoming: 'incoming' }, base, current, incoming })
  return { repoId: 'repo', path: 'file.txt', generation: 'generation', conflictType: 'both-modified', base: baseView, stage2: currentView, stage3: incomingView, regions, isBinary: false, eol: 'lf', hasFinalNewline: true }
}
afterEach(() => { for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true }); repos.clear() })

describe('deterministic conflict candidates', () => {
  test('proposes only the changed side when the other equals base', () => {
    const candidates = generateConflictCandidates(doc('one\ntwo\n', 'one\nthree\n'))
    expect(candidates.some(item => item.ruleId === 'one-side-equals-base' && item.proposedBytes === 'three')).toBe(true)
  })

  test('proposes normalized and whitespace-only results but rejects mixed EOL', () => {
    const normalized = generateConflictCandidates(doc('one\r\ncurrent\r\n', 'one\ncurrent\n', 'one\nbase\n'))
    expect(normalized.some(item => item.ruleId === 'identical-normalized-result')).toBe(true)
    const whitespace = generateConflictCandidates(doc('one\ntwo  \n', 'one\ntwo\n'))
    expect(whitespace.some(item => item.ruleId === 'whitespace-only')).toBe(true)
    const unsafe = doc('one\r\ntwo  \r\n', 'one\ntwo\n')
    unsafe.eol = 'mixed'
    expect(generateConflictCandidates(unsafe).some(item => item.ruleId === 'whitespace-only')).toBe(false)
  })

  test('candidate IDs and order are stable and generation is non-mutating', () => {
    const input = doc('one\ntwo\n', 'one\nthree\n')
    const before = JSON.stringify(input)
    const first = generateConflictCandidates(input)
    const second = generateConflictCandidates(input)
    expect(first).toEqual(second)
    expect(JSON.stringify(input)).toBe(before)
    expect(first.every(item => item.proposedHash && item.stageIdentities && item.beforePreview !== undefined && item.afterPreview !== undefined)).toBe(true)
  })

  test('store is opt-in and confirmed records survive service restart', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ultra-git-candidates-')); repos.add(repo)
    execFileSync('git', ['-C', repo, 'init'], { stdio: 'ignore' })
    const output = await conflictCandidateService.generate(repo, doc('one\ntwo\n', 'one\nthree\n'))
    expect(output).toEqual([])
    await conflictCandidateService.setEnabled(repo, true)
    const document = doc('one\ntwo\n', 'one\nthree\n')
    const region = document.regions[0]
    await conflictCandidateService.recordConfirmed(repo, document, region.id, region.current)
    const restarted = await conflictCandidateService.listRecords(repo)
    expect(restarted).toHaveLength(1)
    const candidates = await conflictCandidateService.generate(repo, document)
    expect(candidates.some(item => item.ruleId === 'confirmed-record')).toBe(true)
    const before = fs.readFileSync(path.join(repo, '.git', 'ultra-git', 'conflict-records.json'), 'utf8')
    await conflictCandidateService.preview(repo, document, candidates[0].id)
    expect(fs.readFileSync(path.join(repo, '.git', 'ultra-git', 'conflict-records.json'), 'utf8')).toBe(before)
  })
})
