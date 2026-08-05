import React, { useState } from 'react'
import { FileText, ArrowRight, ArrowLeft, AlertTriangle, RotateCcw, Trash2 } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'
import { useToaster } from '../toaster/ToasterContext'
import { DiffModal } from '../details/DiffModal'
import { AppDialog } from '../dialogs/AppDialog'

export const ActiveChanges: React.FC = () => {
  const { getActiveRepo, refreshRepo, identities } = useRepoStore()
  const { addToast } = useToaster()
  const activeRepo = getActiveRepo()

  const [selectedFileForDiff, setSelectedFileForDiff] = useState<{
    path: string
    oldPath?: string
    status: string
    isStaged: boolean
  } | null>(null)

  const [discardTarget, setDiscardTarget] = useState<{ filePath: string; isStaged: boolean } | null>(null)

  if (!activeRepo || !activeRepo.status || !activeRepo.status.files) {
    return null
  }

  const files = activeRepo.status.files as any[]

  // Staged files: index is not space (' ') and not untracked ('?')
  const stagedFiles = files.filter((f) => f.index !== ' ' && f.index !== '?')

  // Unstaged files: working_dir is not space (' '), or index is untracked ('?')
  const unstagedFiles = files.filter((f) => f.working_dir !== ' ' || f.index === '?')

  if (files.length === 0) {
    return null
  }

  const handleStageFile = async (filePath: string) => {
    try {
      const res = await window.api.git.add(activeRepo.path, filePath)
      if (res.success) {
        await refreshRepo(activeRepo.id)
      } else {
        addToast({ variant: 'error', title: 'Stage Failed', message: res.error || 'Failed to stage file' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Stage Error', message: err.message || 'Error staging file' })
    }
  }

  const handleUnstageFile = async (filePath: string) => {
    try {
      const res = await window.api.git.reset(activeRepo.path, filePath)
      if (res.success) {
        await refreshRepo(activeRepo.id)
      } else {
        addToast({ variant: 'error', title: 'Unstage Failed', message: res.error || 'Failed to unstage file' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Unstage Error', message: err.message || 'Error unstaging file' })
    }
  }

  const handleDiscardChanges = (filePath: string, isStaged: boolean) => {
    setDiscardTarget({ filePath, isStaged })
  }

  const getStatusClass = (status: string) => {
    if (status === '?') return 'status-q'
    return `status-${status.toLowerCase()}`
  }

  const getRenamedOldPath = (filePath: string) => {
    if (!activeRepo.status.renamed) return undefined
    const renameInfo = activeRepo.status.renamed.find((r: any) => r.to === filePath)
    return renameInfo ? renameInfo.from : undefined
  }

  const isIdentityRequiredAndMissing = !!(activeRepo && identities.length > 1 && !activeRepo.identityId)

  return (
    <div className="active-changes-panel" data-testid="active-changes-panel">
      {isIdentityRequiredAndMissing && (
        <div 
          className="pull-conflict-banner" 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
            fontSize: '12px',
            color: '#f59e0b',
            fontWeight: 500,
            boxSizing: 'border-box'
          }}
          data-testid="identity-required-banner"
        >
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>Multiple Git identities configured. Please select the identity profile you wish to use for this repository from the Sync Panel dropdown above.</span>
        </div>
      )}

      <div className="active-changes-columns">
        {/* Unstaged (Changed files) column */}
        <div className="active-changes-column unstaged-column">
          <div className="column-header">
            <span>Changed files ({unstagedFiles.length})</span>
          </div>
          <div className="active-file-list">
            {unstagedFiles.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                No unstaged changes
              </div>
            ) : (
              unstagedFiles.map((file) => {
                const statusChar = file.working_dir === ' ' && file.index === '?' ? '?' : file.working_dir
                return (
                  <div
                    key={`unstaged-${file.path}`}
                    className="file-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      setSelectedFileForDiff({
                        path: file.path,
                        status: statusChar,
                        isStaged: false
                      })
                    }
                  >
                    <FileText size={14} style={{ marginRight: '8px', color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginRight: '8px',
                        flex: 1
                      }}
                      data-tooltip={file.path}
                    >
                      {file.path}
                    </span>
                    <span className={`file-status ${getStatusClass(statusChar)}`}>
                      {statusChar}
                    </span>
                    <button
                      className="action-btn reset-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDiscardChanges(file.path, false)
                      }}
                      data-tooltip="Discard changes"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      className="action-btn stage-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStageFile(file.path)
                      }}
                      data-tooltip="Stage changes"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span>Stage</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Staged column */}
        <div className="active-changes-column staged-column">
          <div className="column-header">
            <span>Staged ({stagedFiles.length})</span>
          </div>
          <div className="active-file-list">
            {stagedFiles.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                No staged changes
              </div>
            ) : (
              stagedFiles.map((file) => {
                const oldPath = getRenamedOldPath(file.path)
                return (
                  <div
                    key={`staged-${file.path}`}
                    className="file-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      setSelectedFileForDiff({
                        path: file.path,
                        oldPath,
                        status: file.index,
                        isStaged: true
                      })
                    }
                  >
                    <FileText size={14} style={{ marginRight: '8px', color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginRight: '8px',
                        flex: 1
                      }}
                      data-tooltip={oldPath ? `${oldPath} -> ${file.path}` : file.path}
                    >
                      {oldPath ? `${oldPath} -> ${file.path}` : file.path}
                    </span>
                    <span className={`file-status ${getStatusClass(file.index)}`}>
                      {file.index}
                    </span>
                    <button
                      className="action-btn reset-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDiscardChanges(file.path, true)
                      }}
                      data-tooltip="Discard changes"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      className="action-btn unstage-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleUnstageFile(file.path)
                      }}
                      data-tooltip="Unstage changes"
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <ArrowLeft size={12} />
                      <span>Unstage</span>
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      {selectedFileForDiff && (
        <DiffModal
          isOpen={!!selectedFileForDiff}
          onClose={() => setSelectedFileForDiff(null)}
          filePath={selectedFileForDiff.path}
          oldPath={selectedFileForDiff.oldPath}
          status={selectedFileForDiff.status}
          repoPath={activeRepo.path}
          isActiveChange={true}
          isStaged={selectedFileForDiff.isStaged}
          files={
            selectedFileForDiff.isStaged
              ? stagedFiles.map((f) => ({
                  path: f.path,
                  oldPath: getRenamedOldPath(f.path),
                  status: f.index,
                  isStaged: true
                }))
              : unstagedFiles.map((f) => ({
                  path: f.path,
                  status: f.working_dir === ' ' && f.index === '?' ? '?' : f.working_dir,
                  isStaged: false
                }))
          }
          initialFileIndex={
            selectedFileForDiff.isStaged
              ? Math.max(0, stagedFiles.findIndex((f) => f.path === selectedFileForDiff.path))
              : Math.max(0, unstagedFiles.findIndex((f) => f.path === selectedFileForDiff.path))
          }
        />
      )}

      {/* Discard Changes confirmation dialog */}
      <AppDialog
        isOpen={discardTarget !== null}
        title="Discard Changes"
        message={`Are you sure you want to discard changes in "${discardTarget?.filePath}"? This operation cannot be undone.`}
        variant="warning"
        icon={<Trash2 size={16} />}
        testId="discard-changes-dialog"
        actions={[
          { label: 'Cancel', value: 'cancel', variant: 'secondary' },
          { label: 'Discard', value: 'discard', variant: 'danger', setsBusy: true }
        ]}
        onResolve={async (val) => {
          if (val === 'discard' && discardTarget) {
            const { filePath, isStaged } = discardTarget
            setDiscardTarget(null)
            try {
              const res = await window.api.git.discardChanges(activeRepo.path, filePath, isStaged)
              if (res.success) {
                await refreshRepo(activeRepo.id)
                addToast({ variant: 'success', title: 'Changes Discarded', message: `Discarded changes in "${filePath}"` })
              } else {
                addToast({ variant: 'error', title: 'Discard Failed', message: res.error || 'Failed to discard changes' })
              }
            } catch (err: any) {
              addToast({ variant: 'error', title: 'Discard Error', message: err.message || 'Error discarding changes' })
            }
          } else {
            setDiscardTarget(null)
          }
        }}
        onCancel={() => setDiscardTarget(null)}
      />
    </div>
  )
}
