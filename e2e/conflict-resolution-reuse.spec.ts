import { test, expect } from '@playwright/test'
import { deriveConflictRegions } from '../src/main/conflictRegions'
import { generateConflictCandidates } from '../src/main/conflictCandidates'
import type { ConflictDocument } from '../src/shared/conflicts'

const documentFor = (current: string, incoming: string): ConflictDocument => {
  const base = 'one\ntwo\n'
  const regions = deriveConflictRegions({ generation: 'e2e-generation', stageOids: { base: 'base', current: 'current', incoming: 'incoming' }, base, current, incoming })
  return { repoId: 'e2e', path: 'conflict.txt', generation: 'e2e-generation', conflictType: 'both-modified', base: { oid: 'base', bytes: base, hash: 'base', byteLength: base.length, eol: 'lf', hasFinalNewline: true, isBinary: false }, stage2: { oid: 'current', bytes: current, hash: current, byteLength: current.length, eol: 'lf', hasFinalNewline: true, isBinary: false }, stage3: { oid: 'incoming', bytes: incoming, hash: incoming, byteLength: incoming.length, eol: 'lf', hasFinalNewline: true, isBinary: false }, regions, isBinary: false, eol: 'lf', hasFinalNewline: true }
}

test('candidate preview and acceptance inputs are deterministic and non-mutating', async () => {
  const document = documentFor('one\ntwo\n', 'one\nthree\n')
  const before = JSON.stringify(document)
  const candidates = generateConflictCandidates(document)
  expect(candidates.some(candidate => candidate.ruleId === 'one-side-equals-base')).toBe(true)
  expect(candidates.every(candidate => candidate.beforePreview !== undefined && candidate.afterPreview !== undefined && candidate.proposedHash)).toBe(true)
  expect(JSON.stringify(document)).toBe(before)
  expect(generateConflictCandidates(document)).toEqual(candidates)
})

test('unsafe mixed EOL content offers no whitespace-only candidate', async () => {
  const document = documentFor('one\r\ntwo  \r\n', 'one\ntwo\n')
  document.eol = 'mixed'
  expect(generateConflictCandidates(document).some(candidate => candidate.ruleId === 'whitespace-only')).toBe(false)
})
