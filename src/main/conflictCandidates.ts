import { createHash, randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ConflictCandidate, ConflictCandidateSettings, ConflictDocument, ConflictRegion } from '../shared/conflicts'

const exec = promisify(execFile)
const MAX_RECORDS = 256
const MAX_RECORD_BYTES = 4 * 1024 * 1024
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

export interface ResolutionRecord {
  id: string
  path: string
  baseHash: string
  currentHash: string
  incomingHash: string
  proposedHash: string
  proposedBytes: string
  confirmedAt: string
}

interface Store { schema: 1; enabled: boolean; records: ResolutionRecord[] }

function normalized(value: string): string { return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n') }
function nonWhitespace(value: string): string { return value.replace(/\s/g, '') }
function stageIds(doc: ConflictDocument) { return { base: doc.base?.oid, current: doc.stage2?.oid, incoming: doc.stage3?.oid } }
function candidateId(ruleId: ConflictCandidate['ruleId'], doc: ConflictDocument, region: ConflictRegion, proposed: string, recordId?: string) {
  return hash(JSON.stringify({ ruleId, generation: doc.generation, stageIds: stageIds(doc), region: region.id, proposed: hash(proposed), recordId }))
}
function candidate(doc: ConflictDocument, region: ConflictRegion, ruleId: ConflictCandidate['ruleId'], proposed: string, rationale: string, safety: string, recordId?: string): ConflictCandidate {
  return { id: candidateId(ruleId, doc, region, proposed, recordId), ruleId, rationale, safety, generation: doc.generation, path: doc.path, affectedRegionIds: [region.id], stageIdentities: stageIds(doc), proposedBytes: proposed, proposedHash: hash(proposed), beforePreview: region.base, afterPreview: proposed, ...(recordId ? { recordId } : {}) }
}

/** Pure, conservative candidate discovery. It only reads the document. */
export function generateConflictCandidates(doc: ConflictDocument, records: ResolutionRecord[] = []): ConflictCandidate[] {
  if (doc.isBinary) return []
  const result: ConflictCandidate[] = []
  for (const region of doc.regions) {
    if (region.current === region.base && region.incoming !== region.base) {
      result.push(candidate(doc, region, 'one-side-equals-base', region.incoming, 'Current side exactly equals base; use the incoming change.', 'Exact byte equality proves the current side is unchanged.'))
    } else if (region.incoming === region.base && region.current !== region.base) {
      result.push(candidate(doc, region, 'one-side-equals-base', region.current, 'Incoming side exactly equals base; use the current change.', 'Exact byte equality proves the incoming side is unchanged.'))
    }
    const stageNormalizedMatch = doc.stage2 && doc.stage3 && normalized(doc.stage2.bytes) === normalized(doc.stage3.bytes) && doc.stage2.bytes !== doc.stage3.bytes
    if (normalized(region.current) === normalized(region.incoming) && region.current !== region.incoming || stageNormalizedMatch) {
      result.push(candidate(doc, region, 'identical-normalized-result', region.current, 'Both sides have the same declared normalized content; preserve current bytes deterministically.', 'Only line-ending normalization differs and the output policy preserves current bytes.'))
    }
    const sameEol = doc.eol !== 'mixed' && (!doc.stage2 || !doc.stage3 || doc.stage2.eol === doc.stage3.eol)
    const sameFinalNewline = !doc.stage2 || !doc.stage3 || doc.stage2.hasFinalNewline === doc.stage3.hasFinalNewline
    const safeWhitespace = sameEol && sameFinalNewline && doc.eol !== 'none' && doc.hasFinalNewline === (doc.stage2?.hasFinalNewline ?? doc.hasFinalNewline) && !region.current.includes('\0') && !region.incoming.includes('\0') && nonWhitespace(region.current) === nonWhitespace(region.incoming) && region.current !== region.incoming
    if (safeWhitespace) result.push(candidate(doc, region, 'whitespace-only', region.current, 'Both sides contain identical non-whitespace content; preserve current whitespace and EOL policy.', 'Non-whitespace tokens, encoding, EOL style, and final-newline policy are unchanged.'))
    for (const record of records) {
      if (record.baseHash === (doc.base?.hash ?? hash('')) && record.currentHash === hash(region.current) && record.incomingHash === hash(region.incoming)) {
        result.push(candidate(doc, region, 'confirmed-record', record.proposedBytes, 'Previously confirmed resolution for the same stage identities.', 'The record is repository-local and matches the current base/current/incoming content identities.', record.id))
      }
    }
  }
  const unique = new Map<string, ConflictCandidate>()
  for (const item of result) {
    const key = `${item.proposedHash}:${item.affectedRegionIds.join(',')}`
    const prior = unique.get(key)
    if (!prior) unique.set(key, { ...item, provenanceRules: [item.ruleId] })
    else {
      const rules = [...new Set([...(prior.provenanceRules ?? [prior.ruleId]), item.ruleId])]
      // Whitespace-only carries the stronger explicit byte-safety explanation
      // when it overlaps with the broader one-side rule.
      if (item.ruleId === 'whitespace-only') unique.set(key, { ...item, provenanceRules: rules })
      else unique.set(key, { ...prior, provenanceRules: rules })
    }
  }
  return [...unique.values()].sort((a, b) => a.id.localeCompare(b.id))
}

async function gitDir(repo: string): Promise<string> {
  const { stdout } = await exec('git', ['-C', repo, 'rev-parse', '--git-dir'])
  const value = stdout.trim()
  return path.resolve(repo, value)
}
async function storePath(repo: string): Promise<string> { return path.join(await gitDir(repo), 'ultra-git', 'conflict-records.json') }
function empty(): Store { return { schema: 1, enabled: false, records: [] } }
async function readStore(repo: string): Promise<Store> {
  const file = await storePath(repo)
  if (!fs.existsSync(file)) return empty()
  try {
    if (fs.statSync(file).size > MAX_RECORD_BYTES) return empty()
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (parsed?.schema !== 1 || typeof parsed.enabled !== 'boolean' || !Array.isArray(parsed.records) || parsed.records.length > MAX_RECORDS) return empty()
    return parsed
  } catch { return empty() }
}
async function writeStore(repo: string, store: Store): Promise<void> {
  const file = await storePath(repo); fs.mkdirSync(path.dirname(file), { recursive: true }); const temp = `${file}.${randomUUID()}.tmp`; const value = JSON.stringify(store)
  if (Buffer.byteLength(value) > MAX_RECORD_BYTES) throw new Error('Resolution record store exceeds size limit')
  fs.writeFileSync(temp, value, { mode: 0o600 }); fs.renameSync(temp, file)
}

export const conflictCandidateService = {
  getSettings: async (repo: string): Promise<ConflictCandidateSettings> => { const store = await readStore(repo); return { enabled: store.enabled } },
  setEnabled: async (repo: string, enabled: boolean) => { const store = await readStore(repo); store.enabled = enabled; await writeStore(repo, store); return { enabled } },
  listRecords: async (repo: string) => (await readStore(repo)).records,
  generate: async (repo: string, document: ConflictDocument) => { const store = await readStore(repo); return store.enabled ? generateConflictCandidates(document, store.records) : [] },
  preview: async (repo: string, document: ConflictDocument, candidateId: string) => { const found = (await conflictCandidateService.generate(repo, document)).find(item => item.id === candidateId); if (!found) throw new Error('STALE_CANDIDATE'); return found },
  recordConfirmed: async (repo: string, document: ConflictDocument, regionId: string, proposedBytes: string) => {
    const region = document.regions.find(item => item.id === regionId); if (!region) throw new Error('STALE_REGION')
    const store = await readStore(repo); store.records = [{ id: randomUUID(), path: document.path, baseHash: document.base?.hash ?? hash(''), currentHash: hash(region.current), incomingHash: hash(region.incoming), proposedHash: hash(proposedBytes), proposedBytes, confirmedAt: new Date().toISOString() }, ...store.records].slice(0, MAX_RECORDS); await writeStore(repo, store); return store.records[0]
  },
  forget: async (repo: string, id?: string) => { const store = await readStore(repo); if (id) store.records = store.records.filter(record => record.id !== id); else store.records = []; await writeStore(repo, store); return store.records }
}
