/**
 * Shared, renderer-safe conflict contracts.  These types deliberately model a
 * conflict as a whole document plus explicit region decisions; a region is
 * not a patch and must never be applied independently of its document.
 */

export type OperationKind = 'merge' | 'rebase' | 'cherry-pick'
export type OperationPhase = 'conflicted' | 'ready-to-continue' | 'completed' | 'aborted'
export type OperationRole = 'current' | 'incoming' | 'onto' | 'replayed'
export type ConflictType = 'both-modified' | 'both-added' | 'deleted-by-us' | 'deleted-by-them' | 'added-by-us' | 'added-by-them' | 'other'
export type EolStyle = 'lf' | 'crlf' | 'mixed' | 'none'
export type RegionChoice = 'unresolved' | 'current' | 'incoming' | 'both-current-first' | 'both-incoming-first' | 'selected-range' | 'manual'

export interface BlobView {
  oid?: string
  mode?: string
  bytes: string
  hash: string
  byteLength: number
  eol: EolStyle
  hasFinalNewline: boolean
  isBinary: boolean
}

export interface LineRange { start: number; end: number }

export interface ConflictRegionIdentity {
  generation: string
  stageOids: { base?: string; current?: string; incoming?: string }
  baseRange: LineRange
  currentRange: LineRange
  incomingRange: LineRange
  modes: { base?: string; current?: string; incoming?: string }
  contentHashes: { base: string; current: string; incoming: string }
}

export interface ConflictRegion extends ConflictRegionIdentity {
  id: string
  base: string
  current: string
  incoming: string
  choice: RegionChoice
  selected?: string
}

export interface ConflictDocument {
  repoId: string
  path: string
  generation: string
  conflictType: ConflictType
  base?: BlobView
  stage2?: BlobView
  stage3?: BlobView
  workingResult?: BlobView
  regions: ConflictRegion[]
  result?: BlobView
  isBinary: boolean
  eol: EolStyle
  hasFinalNewline: boolean
}

export interface ConflictFileSummary { path: string; status: string; conflictType?: ConflictType }

export interface OperationSnapshot {
  repoId: string
  generation: string
  kind: OperationKind
  phase: OperationPhase
  roles: { current: string; incoming: string; currentRole: OperationRole; incomingRole: OperationRole }
  currentStep?: number
  totalSteps?: number
  subject?: string
  conflicts: ConflictFileSummary[]
  nextConflict?: string
}

export interface ResolutionSelection { documentGeneration: string; regionId: string; choice: RegionChoice; selected?: string }

export type ConflictErrorCode =
  | 'STALE_GENERATION' | 'STALE_OID' | 'STALE_REGION' | 'STALE_DIFF'
  | 'PATH_CONTAINMENT' | 'SIZE_LIMIT' | 'UNSUPPORTED_CONFLICT'
  | 'PREFLIGHT_FAILED' | 'POSTCONDITION_FAILED' | 'UNDO_EXPIRED'

export interface ConflictError { code: ConflictErrorCode; message: string; path?: string; regionId?: string }

export interface UndoEntry {
  repository: string
  operationGeneration: string
  before: { documentHash: string; stageOids: ConflictRegion['stageOids'] }
  after: { documentHash: string; resultHash: string }
  safetySnapshotId: string
  expiresAt: string
  expiryReason?: 'expired' | 'operation-advanced' | 'external-change'
}

export interface OperationActionResult {
  snapshot: OperationSnapshot
  document?: ConflictDocument
  error?: ConflictError
}
