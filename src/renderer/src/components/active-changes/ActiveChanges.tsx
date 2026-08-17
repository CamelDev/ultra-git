import React, { useState, useEffect } from 'react'
import { FileText, ArrowRight, ArrowLeft, AlertTriangle, RotateCcw, Trash2 } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'
import { useToaster } from '../toaster/ToasterContext'
import { DiffModal } from '../details/DiffModal'
import { AppDialog } from '../dialogs/AppDialog'

export const ActiveChanges: React.FC = () => {
  const { getActiveRepo, refreshRepo, identities } = useRepoStore()
  const { addToast } = useToaster()
  const activeRepo = getActiveRepo()

  const [selectedUnstaged, setSelectedUnstaged] = useState<Set<string>>(new Set())
  const [selectedStaged, setSelectedStaged] = useState<Set<string>>(new Set())
  const [lastUnstagedIndex, setLastUnstagedIndex] = useState<number | null>(null)
  const [lastStagedIndex, setLastStagedIndex] = useState<number | null>(null)

  const [selectedFileForDiff, setSelectedFileForDiff] = useState<{
    path: string
    oldPath?: string
    status: string
    isStaged: boolean
  } | null>(null)

  const [discardTarget, setDiscardTarget] = useState<{ filePaths: string[]; isStaged: boolean } | null>(null)

  if (!activeRepo || !activeRepo.status || !activeRepo.status.files) {
    return null
  }

  const files = activeRepo.status.files as any[]

  // Staged files: index is not space (' ') and not untracked ('?')
  const stagedFiles = files.filter((f) => f.index !== ' ' && f.index !== '?')

  // Unstaged files: working_dir is not space (' '), or index is untracked ('?')
  const unstagedFiles = files.filter((f) => f.working_dir !== ' ' || f.index === '?')

  // Sync selection sets whenever files change to prune deleted/staged paths
  useEffect(() => {
    const unstagedPaths = new Set(unstagedFiles.map((f) => f.path))
    setSelectedUnstaged((prev) => {
      const next = new Set<string>()
      prev.forEach((p) => {
        if (unstagedPaths.has(p)) next.add(p)
      })
      return next
    })
  }, [unstagedFiles.map((f) => f.path).join(',')])

  useEffect(() => {
    const stagedPaths = new Set(stagedFiles.map((f) => f.path))
    setSelectedStaged((prev) => {
      const next = new Set<string>()
      prev.forEach((p) => {
        if (stagedPaths.has(p)) next.add(p)
      })
      return next
    })
  }, [stagedFiles.map((f) => f.path).join(',')])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedFileForDiff) return
        setSelectedUnstaged(new Set())
        setSelectedStaged(new Set())
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedFileForDiff])

  if (files.length === 0) {
    return null
  }

  const handleStageFile = async (filePath: string) => {
    try {
      const res = await window.api.git.add(activeRepo.path, filePath)
      if (res.success) {
        setSelectedUnstaged((prev) => {
          const next = new Set(prev)
          next.delete(filePath)
          return next
        })
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
        setSelectedStaged((prev) => {
          const next = new Set(prev)
          next.delete(filePath)
          return next
        })
        await refreshRepo(activeRepo.id)
      } else {
        addToast({ variant: 'error', title: 'Unstage Failed', message: res.error || 'Failed to unstage file' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Unstage Error', message: err.message || 'Error unstaging file' })
    }
  }

  const handleBatchStage = async () => {
    const paths = Array.from(selectedUnstaged)
    if (paths.length === 0) return
    try {
      const res = await window.api.git.add(activeRepo.path, paths)
      if (res.success) {
        setSelectedUnstaged(new Set())
        await refreshRepo(activeRepo.id)
        addToast({ variant: 'success', title: 'Staged', message: `Staged ${paths.length} file(s)` })
      } else {
        addToast({ variant: 'error', title: 'Batch Stage Failed', message: res.error || 'Failed to stage selected files' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Batch Stage Error', message: err.message || 'Error staging selected files' })
    }
  }

  const handleBatchUnstage = async () => {
    const paths = Array.from(selectedStaged)
    if (paths.length === 0) return
    try {
      const res = await window.api.git.reset(activeRepo.path, paths)
      if (res.success) {
        setSelectedStaged(new Set())
        await refreshRepo(activeRepo.id)
        addToast({ variant: 'success', title: 'Unstaged', message: `Unstaged ${paths.length} file(s)` })
      } else {
        addToast({ variant: 'error', title: 'Batch Unstage Failed', message: res.error || 'Failed to unstage selected files' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Batch Unstage Error', message: err.message || 'Error unstaging selected files' })
    }
  }

  const handleDiscardChanges = (filePath: string | string[], isStaged: boolean) => {
    const filePaths = Array.isArray(filePath) ? filePath : [filePath]
    setDiscardTarget({ filePaths, isStaged })
  }

  const toggleUnstagedFile = (path: string, index: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedUnstaged((prev) => {
      const next = new Set(prev)
      if (e?.shiftKey && lastUnstagedIndex !== null) {
        const start = Math.min(lastUnstagedIndex, index)
        const end = Math.max(lastUnstagedIndex, index)
        for (let i = start; i <= end; i++) {
          if (unstagedFiles[i]) next.add(unstagedFiles[i].path)
        }
      } else if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
    setLastUnstagedIndex(index)
  }

  const toggleStagedFile = (path: string, index: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedStaged((prev) => {
      const next = new Set(prev)
      if (e?.shiftKey && lastStagedIndex !== null) {
        const start = Math.min(lastStagedIndex, index)
        const end = Math.max(lastStagedIndex, index)
        for (let i = start; i <= end; i++) {
          if (stagedFiles[i]) next.add(stagedFiles[i].path)
        }
      } else if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
    setLastStagedIndex(index)
  }

  const handleSelectAllUnstaged = () => {
    if (selectedUnstaged.size === unstagedFiles.length) {
      setSelectedUnstaged(new Set())
    } else {
      setSelectedUnstaged(new Set(unstagedFiles.map((f) => f.path)))
    }
  }

  const handleSelectAllStaged = () => {
    if (selectedStaged.size === stagedFiles.length) {
      setSelectedStaged(new Set())
    } else {
      setSelectedStaged(new Set(stagedFiles.map((f) => f.path)))
    }
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

  const discardMessage = discardTarget
    ? discardTarget.filePaths.length === 1
      ? `Are you sure you want to discard changes in "${discardTarget.filePaths[0]}"? This operation cannot be undone.`
      : `Are you sure you want to discard changes in ${discardTarget.filePaths.length} selected files? This operation cannot be undone.`
    : ''

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
          <div className="column-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {unstagedFiles.length > 0 && (
                <input
                  type="checkbox"
                  className="file-select-checkbox header-checkbox"
                  checked={selectedUnstaged.size === unstagedFiles.length}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = selectedUnstaged.size > 0 && selectedUnstaged.size < unstagedFiles.length
                    }
                  }}
                  onChange={handleSelectAllUnstaged}
                  title="Select / Deselect all unstaged files"
                  data-testid="select-all-unstaged-checkbox"
                />
              )}
              <span>
                Changed files ({unstagedFiles.length})
                {selectedUnstaged.size > 0 && ` • ${selectedUnstaged.size} selected`}
              </span>
            </div>
            {selectedUnstaged.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  className="action-btn reset-btn"
                  onClick={() => handleDiscardChanges(Array.from(selectedUnstaged), false)}
                  data-tooltip={`Discard ${selectedUnstaged.size} selected changes`}
                  data-testid="batch-discard-unstaged-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px' }}
                >
                  <RotateCcw size={12} />
                  <span>Discard ({selectedUnstaged.size})</span>
                </button>
                <button
                  className="action-btn stage-btn"
                  onClick={handleBatchStage}
                  data-tooltip={`Stage ${selectedUnstaged.size} selected files`}
                  data-testid="batch-stage-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px' }}
                >
                  <span>Stage ({selectedUnstaged.size})</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            )}
          </div>
          <div className="active-file-list">
            {unstagedFiles.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                No unstaged changes
              </div>
            ) : (
              unstagedFiles.map((file, index) => {
                const statusChar = file.working_dir === ' ' && file.index === '?' ? '?' : file.working_dir
                const isSelected = selectedUnstaged.has(file.path)
                return (
                  <div
                    key={`unstaged-${file.path}`}
                    className={`file-item ${isSelected ? 'selected' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      if (e.shiftKey || e.metaKey || e.ctrlKey) {
                        toggleUnstagedFile(file.path, index, e)
                      } else {
                        setSelectedFileForDiff({
                          path: file.path,
                          status: statusChar,
                          isStaged: false
                        })
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      className="file-select-checkbox"
                      checked={isSelected}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleUnstagedFile(file.path, index, e)
                      }}
                      onChange={() => {}}
                      data-testid={`checkbox-unstaged-${file.path}`}
                    />
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
                        if (isSelected && selectedUnstaged.size > 1) {
                          handleDiscardChanges(Array.from(selectedUnstaged), false)
                        } else {
                          handleDiscardChanges(file.path, false)
                        }
                      }}
                      data-tooltip={
                        isSelected && selectedUnstaged.size > 1
                          ? `Discard ${selectedUnstaged.size} selected changes`
                          : "Discard changes"
                      }
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      className="action-btn stage-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isSelected && selectedUnstaged.size > 1) {
                          handleBatchStage()
                        } else {
                          handleStageFile(file.path)
                        }
                      }}
                      data-tooltip={
                        isSelected && selectedUnstaged.size > 1
                          ? `Stage ${selectedUnstaged.size} selected files`
                          : "Stage changes"
                      }
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
          <div className="column-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {stagedFiles.length > 0 && (
                <input
                  type="checkbox"
                  className="file-select-checkbox header-checkbox"
                  checked={selectedStaged.size === stagedFiles.length}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = selectedStaged.size > 0 && selectedStaged.size < stagedFiles.length
                    }
                  }}
                  onChange={handleSelectAllStaged}
                  title="Select / Deselect all staged files"
                  data-testid="select-all-staged-checkbox"
                />
              )}
              <span>
                Staged ({stagedFiles.length})
                {selectedStaged.size > 0 && ` • ${selectedStaged.size} selected`}
              </span>
            </div>
            {selectedStaged.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  className="action-btn reset-btn"
                  onClick={() => handleDiscardChanges(Array.from(selectedStaged), true)}
                  data-tooltip={`Discard ${selectedStaged.size} selected staged changes`}
                  data-testid="batch-discard-staged-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px' }}
                >
                  <RotateCcw size={12} />
                  <span>Discard ({selectedStaged.size})</span>
                </button>
                <button
                  className="action-btn unstage-btn"
                  onClick={handleBatchUnstage}
                  data-tooltip={`Unstage ${selectedStaged.size} selected files`}
                  data-testid="batch-unstage-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px' }}
                >
                  <ArrowLeft size={12} />
                  <span>Unstage ({selectedStaged.size})</span>
                </button>
              </div>
            )}
          </div>
          <div className="active-file-list">
            {stagedFiles.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                No staged changes
              </div>
            ) : (
              stagedFiles.map((file, index) => {
                const oldPath = getRenamedOldPath(file.path)
                const isSelected = selectedStaged.has(file.path)
                return (
                  <div
                    key={`staged-${file.path}`}
                    className={`file-item ${isSelected ? 'selected' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      if (e.shiftKey || e.metaKey || e.ctrlKey) {
                        toggleStagedFile(file.path, index, e)
                      } else {
                        setSelectedFileForDiff({
                          path: file.path,
                          oldPath,
                          status: file.index,
                          isStaged: true
                        })
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      className="file-select-checkbox"
                      checked={isSelected}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleStagedFile(file.path, index, e)
                      }}
                      onChange={() => {}}
                      data-testid={`checkbox-staged-${file.path}`}
                    />
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
                        if (isSelected && selectedStaged.size > 1) {
                          handleDiscardChanges(Array.from(selectedStaged), true)
                        } else {
                          handleDiscardChanges(file.path, true)
                        }
                      }}
                      data-tooltip={
                        isSelected && selectedStaged.size > 1
                          ? `Discard ${selectedStaged.size} selected staged changes`
                          : "Discard changes"
                      }
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      className="action-btn unstage-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isSelected && selectedStaged.size > 1) {
                          handleBatchUnstage()
                        } else {
                          handleUnstageFile(file.path)
                        }
                      }}
                      data-tooltip={
                        isSelected && selectedStaged.size > 1
                          ? `Unstage ${selectedStaged.size} selected files`
                          : "Unstage changes"
                      }
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
        message={discardMessage}
        variant="warning"
        icon={<Trash2 size={16} />}
        testId="discard-changes-dialog"
        actions={[
          { label: 'Cancel', value: 'cancel', variant: 'secondary' },
          { label: 'Discard', value: 'discard', variant: 'danger', setsBusy: true }
        ]}
        onResolve={async (val) => {
          if (val === 'discard' && discardTarget) {
            const { filePaths, isStaged } = discardTarget
            setDiscardTarget(null)
            try {
              const res = await window.api.git.discardChanges(activeRepo.path, filePaths, isStaged)
              if (res.success) {
                if (isStaged) {
                  setSelectedStaged((prev) => {
                    const next = new Set(prev)
                    filePaths.forEach((p) => next.delete(p))
                    return next
                  })
                } else {
                  setSelectedUnstaged((prev) => {
                    const next = new Set(prev)
                    filePaths.forEach((p) => next.delete(p))
                    return next
                  })
                }
                await refreshRepo(activeRepo.id)
                addToast({
                  variant: 'success',
                  title: 'Changes Discarded',
                  message:
                    filePaths.length === 1
                      ? `Discarded changes in "${filePaths[0]}"`
                      : `Discarded changes in ${filePaths.length} files`
                })
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
