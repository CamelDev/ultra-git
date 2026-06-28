import React, { useState } from "react"
import { GitBranch, Layers, Package, AlertTriangle, Trash2, List, X, Edit2, GitMerge, GitCommit, Tag, Upload } from "lucide-react"
import { useRepoStore } from "../../store/useRepoStore"
import { DiffModal } from "../details/DiffModal"
import { MergeRebaseModal, MergeOperation, MergeStrategy } from "./MergeRebaseModal"

interface SidebarProps {
  onMergeConflicts?: (conflictedFiles: Array<{ path: string; status: string }>, isRebase: boolean) => void
}

const Sidebar: React.FC<SidebarProps> = ({ onMergeConflicts }) => {
  const { getActiveRepo, refreshRepo } = useRepoStore()
  const activeRepo = getActiveRepo()

  const [selectedStashIndex, setSelectedStashIndex] = useState<number | null>(null)
  const [conflictWarning, setConflictWarning] = useState(false)
  const [poppingIndex, setPoppingIndex] = useState<number | null>(null)
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null)
  
  const [isStashDetailsOpen, setIsStashDetailsOpen] = useState(false)
  const [detailsStashIndex, setDetailsStashIndex] = useState<number | null>(null)
  const [detailsStashMessage, setDetailsStashMessage] = useState<string | null>(null)

  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState("")
  const [errorMessage, setErrorMessage] = useState("")
  const [branchModalMode, setBranchModalMode] = useState<"create" | "rename">("create")
  const [branchToRename, setBranchToRename] = useState<string>("")

  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [mergeTargetBranch, setMergeTargetBranch] = useState("")
  const [mergeOperation, setMergeOperation] = useState<MergeOperation>("merge")

  const branch = activeRepo?.branch || 'main'
  const status = activeRepo?.status
  const stashes = activeRepo?.stashes ?? []

  const handlePopStash = async (e: React.MouseEvent, index: number) => {
    e.stopPropagation()
    if (!activeRepo) return

    const confirmRes = await window.api.app.showMessageBox({
      type: 'question',
      title: 'Pop Stash',
      message: 'Are you sure you want to pop this stash back into your working directory?',
      buttons: ['Cancel', 'Pop'],
      defaultId: 1,
      cancelId: 0
    })

    if (!confirmRes.success || confirmRes.response !== 1) {
      return
    }

    setPoppingIndex(index)
    setConflictWarning(false)
    try {
      const res = await window.api.git.stashPop(activeRepo.path, index)
      if (res.success) {
        if (res.data?.hadConflicts) {
          setConflictWarning(true)
        }
        setSelectedStashIndex(null)
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to pop stash:', res.error)
      }
    } catch (err) {
      console.error('Error popping stash:', err)
    } finally {
      setPoppingIndex(null)
    }
  }

  const handleDeleteStash = async (e: React.MouseEvent, index: number) => {
    e.stopPropagation()
    if (!activeRepo) return

    const confirmRes = await window.api.app.showMessageBox({
      type: 'warning',
      title: 'Delete Stash',
      message: 'Are you sure you want to delete this stash? This action cannot be undone.',
      buttons: ['Cancel', 'Delete'],
      defaultId: 1,
      cancelId: 0
    })

    if (!confirmRes.success || confirmRes.response !== 1) {
      return
    }

    setDeletingIndex(index)
    try {
      const res = await window.api.git.stashDrop(activeRepo.path, index)
      if (res.success) {
        setSelectedStashIndex(null)
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to delete stash:', res.error)
      }
    } catch (err) {
      console.error('Error deleting stash:', err)
    } finally {
      setDeletingIndex(null)
    }
  }

  const handleShowStashDetails = (e: React.MouseEvent, index: number, message: string) => {
    e.stopPropagation()
    setDetailsStashIndex(index)
    setDetailsStashMessage(message)
    setIsStashDetailsOpen(true)
  }

  const formatStashDate = (dateStr: string) => {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateStr
    }
  }

  const openCreateBranchModal = (e: React.MouseEvent) => {
    e.stopPropagation()
    setBranchModalMode('create')
    setNewBranchName('')
    setErrorMessage('')
    setIsBranchModalOpen(true)
  }

  const openRenameBranchModal = (e: React.MouseEvent, branchName: string) => {
    e.stopPropagation()
    setBranchModalMode('rename')
    setBranchToRename(branchName)
    setNewBranchName(branchName)
    setErrorMessage('')
    setIsBranchModalOpen(true)
  }

  const handleBranchModalSubmit = async () => {
    const name = newBranchName.trim()
    if (!name || !activeRepo) return
    try {
      if (branchModalMode === 'create') {
        const res = await window.api.git.createBranch(activeRepo.path, name)
        if (res.success) {
          setIsBranchModalOpen(false)
          setNewBranchName('')
          setErrorMessage('')
          await refreshRepo(activeRepo.id)
        } else {
          setErrorMessage(res.error || 'Failed to create branch.')
        }
      } else {
        const res = await window.api.git.renameBranch(activeRepo.path, branchToRename, name)
        if (res.success) {
          setIsBranchModalOpen(false)
          setNewBranchName('')
          setErrorMessage('')
          await refreshRepo(activeRepo.id)
        } else {
          setErrorMessage(res.error || 'Failed to rename branch.')
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred.')
    }
  }

  const handleDeleteBranch = async (e: React.MouseEvent, branchName: string) => {
    e.stopPropagation()
    if (!activeRepo) return

    const confirmRes = await window.api.app.showMessageBox({
      type: 'warning',
      title: 'Delete Branch',
      message: `Are you sure you want to delete the branch '${branchName}'?`,
      buttons: ['Cancel', 'Delete'],
      defaultId: 1,
      cancelId: 0
    })

    if (!confirmRes.success || confirmRes.response !== 1) {
      return
    }

    try {
      const res = await window.api.git.deleteBranch(activeRepo.path, branchName, false)
      if (res.success) {
        await refreshRepo(activeRepo.id)
      } else {
        const errorMsg = res.error || ''
        if (errorMsg.includes('not fully merged') || errorMsg.includes('force')) {
          const forceConfirm = await window.api.app.showMessageBox({
            type: 'question',
            title: 'Force Delete Branch',
            message: `The branch '${branchName}' is not fully merged. Do you want to force delete it?`,
            buttons: ['Cancel', 'Force Delete'],
            defaultId: 1,
            cancelId: 0
          })
          if (forceConfirm.success && forceConfirm.response === 1) {
            const forceRes = await window.api.git.deleteBranch(activeRepo.path, branchName, true)
            if (forceRes.success) {
              await refreshRepo(activeRepo.id)
            } else {
              console.error('Failed to force delete branch:', forceRes.error)
              await window.api.app.showMessageBox({
                type: 'error',
                title: 'Error',
                message: `Failed to delete branch: ${forceRes.error}`
              })
            }
          }
        } else {
          console.error('Failed to delete branch:', res.error)
          await window.api.app.showMessageBox({
            type: 'error',
            title: 'Error',
            message: `Failed to delete branch: ${res.error}`
          })
        }
      }
    } catch (err: any) {
      console.error('Error deleting branch:', err)
      await window.api.app.showMessageBox({
        type: 'error',
        title: 'Error',
        message: `Error deleting branch: ${err.message || err}`
      })
    }
  }

  const handleCheckoutBranch = async (branchName: string) => {
    if (!activeRepo || branchName === branch) return
    try {
      const res = await window.api.git.checkout(activeRepo.path, branchName)
      if (res.success) {
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to checkout branch:', res.error)
      }
    } catch (err) {
      console.error('Error checking out branch:', err)
    }
  }

  const openMergeModal = (e: React.MouseEvent, sourceBranch: string) => {
    e.stopPropagation()
    setMergeTargetBranch(sourceBranch)
    setMergeOperation("merge")
    setMergeModalOpen(true)
  }

  const openRebaseModal = (e: React.MouseEvent, sourceBranch: string) => {
    e.stopPropagation()
    setMergeTargetBranch(sourceBranch)
    setMergeOperation("rebase")
    setMergeModalOpen(true)
  }

  const handleMergeConfirm = async (strategy: MergeStrategy) => {
    if (!activeRepo) return
    if (mergeOperation === "merge") {
      const res = await window.api.git.merge(activeRepo.path, mergeTargetBranch, strategy)
      if (!res.success) throw new Error(res.error || "Merge failed")
      if (res.data?.hadConflicts) {
        setMergeModalOpen(false)
        onMergeConflicts?.(res.data.conflictedFiles, false)
        return
      }
    } else {
      const res = await window.api.git.rebase(activeRepo.path, mergeTargetBranch)
      if (!res.success) throw new Error(res.error || "Rebase failed")
      if (res.data?.hadConflicts) {
        setMergeModalOpen(false)
        onMergeConflicts?.(res.data.conflictedFiles, true)
        return
      }
    }
    setMergeModalOpen(false)
    await refreshRepo(activeRepo.id)
  }

  const handlePushTags = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!activeRepo) return

    const confirmRes = await window.api.app.showMessageBox({
      type: 'question',
      title: 'Push Tags',
      message: 'Are you sure you want to push all local tags to the remote (origin)?',
      buttons: ['Cancel', 'Push Tags'],
      defaultId: 1,
      cancelId: 0
    })

    if (!confirmRes.success || confirmRes.response !== 1) {
      return
    }

    try {
      const res = await window.api.git.pushTags(activeRepo.path)
      if (res.success) {
        await window.api.app.showMessageBox({
          type: 'info',
          title: 'Success',
          message: 'All local tags have been successfully pushed to the remote repository.'
        })
      } else {
        console.error('Failed to push tags:', res.error)
        await window.api.app.showMessageBox({
          type: 'error',
          title: 'Error',
          message: `Failed to push tags: ${res.error}`
        })
      }
    } catch (err: any) {
      console.error('Error pushing tags:', err)
      await window.api.app.showMessageBox({
        type: 'error',
        title: 'Error',
        message: `Error pushing tags: ${err.message || err}`
      })
    }
  }

  const localBranches = activeRepo?.branches?.local ?? [branch]
  const remoteBranches = activeRepo?.branches?.remote ?? []

  return (
    <div className="sidebar" data-testid="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Local</span>
          <span>{localBranches.length}</span>
        </div>
        {localBranches.map((b) => {
          const name = typeof b === 'string' ? b : b.name;
          const ahead = typeof b === 'string' ? 0 : b.ahead;
          const behind = typeof b === 'string' ? 0 : b.behind;
          const isActive = name === branch;
          const currentAhead = isActive ? (status?.ahead ?? ahead) : ahead;
          const currentBehind = isActive ? (status?.behind ?? behind) : behind;

          if (isActive) {
            return (
              <div className="sidebar-item active" style={{ display: 'flex', alignItems: 'center' }} key={name}>
                <GitBranch className="sidebar-item-icon" size={14} style={{ flexShrink: 0 }} />
                <span data-testid="sidebar-active-branch" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                {(currentAhead > 0 || currentBehind > 0) && (
                  <span 
                    className="branch-sync-badge" 
                    style={{ 
                      marginLeft: 'auto', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      fontSize: '11px', 
                      fontWeight: 700, 
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      userSelect: 'none'
                    }}
                    data-testid="branch-sync-badge"
                  >
                    {currentAhead > 0 && (
                      <span style={{ color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '1px' }} data-testid="sync-ahead">
                        ↑<span>{currentAhead}</span>
                      </span>
                    )}
                    {currentBehind > 0 && (
                      <span style={{ color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '1px' }} data-testid="sync-behind">
                        ↓<span>{currentBehind}</span>
                      </span>
                    )}
                  </span>
                )}
                <div className="branch-actions" style={{ marginLeft: (currentAhead > 0 || currentBehind > 0) ? '8px' : 'auto', display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button
                    className="stash-action-btn"
                    style={{ padding: 0, height: '24px', width: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={(e) => openRenameBranchModal(e, name)}
                    title="Rename branch"
                    data-testid="sidebar-rename-branch-btn"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    className="stash-action-btn"
                    style={{ padding: 0, height: '24px', width: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={(e) => openCreateBranchModal(e)}
                    title="Create a new branch from latest local commit (HEAD)"
                    data-testid="sidebar-create-branch-btn"
                  >
                    <GitBranch size={13} />
                  </button>
                  <button
                    className="stash-action-btn delete"
                    style={{ padding: 0, height: '24px', width: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                    disabled={true}
                    title="Cannot delete the currently checked out branch"
                    data-testid="sidebar-delete-branch-btn"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          } else {
            return (
              <div 
                className="sidebar-item" 
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} 
                key={name}
                onClick={() => handleCheckoutBranch(name)}
                data-testid={`sidebar-branch-${name}`}
              >
                <GitBranch className="sidebar-item-icon" size={14} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                {(currentAhead > 0 || currentBehind > 0) && (
                  <span 
                    className="branch-sync-badge" 
                    style={{ 
                      marginLeft: 'auto', 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      fontSize: '11px', 
                      fontWeight: 700, 
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      userSelect: 'none'
                    }}
                    data-testid="branch-sync-badge"
                  >
                    {currentAhead > 0 && (
                      <span style={{ color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: '1px' }} data-testid="sync-ahead">
                        ↑<span>{currentAhead}</span>
                      </span>
                    )}
                    {currentBehind > 0 && (
                      <span style={{ color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '1px' }} data-testid="sync-behind">
                        ↓<span>{currentBehind}</span>
                      </span>
                    )}
                  </span>
                )}
                <div className="branch-actions" style={{ marginLeft: (currentAhead > 0 || currentBehind > 0) ? "8px" : "auto", display: "flex", gap: "4px", flexShrink: 0 }}>
                  <button
                    className="stash-action-btn"
                    style={{ padding: 0, height: "24px", width: "24px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    onClick={(e) => openMergeModal(e, name)}
                    title={`Merge ${name} into ${branch}`}
                    data-testid={`merge-branch-btn-${name}`}
                  >
                    <GitMerge size={12} />
                  </button>
                  <button
                    className="stash-action-btn"
                    style={{ padding: 0, height: "24px", width: "24px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    onClick={(e) => openRebaseModal(e, name)}
                    title={`Rebase ${branch} onto ${name}`}
                    data-testid={`rebase-branch-btn-${name}`}
                  >
                    <GitCommit size={12} />
                  </button>
                  <button
                    className="stash-action-btn"
                    style={{ padding: 0, height: "24px", width: "24px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    onClick={(e) => openRenameBranchModal(e, name)}
                    title="Rename branch"
                    data-testid={`rename-branch-btn-${name}`}
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    className="stash-action-btn delete"
                    style={{ padding: 0, height: "24px", width: "24px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    onClick={(e) => handleDeleteBranch(e, name)}
                    title="Delete branch"
                    data-testid={`delete-branch-btn-${name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          }
        })}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Remote</span>
          <span>{remoteBranches.length}</span>
        </div>
        {remoteBranches.length === 0 ? (
          <div style={{ padding: '8px 20px', fontSize: '12px', color: 'var(--text-secondary)' }}>No remote branches</div>
        ) : (
          remoteBranches.map((rb) => (
            <div key={rb} className="sidebar-item" style={{ display: 'flex', alignItems: 'center' }}>
              <Layers className="sidebar-item-icon" size={14} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rb}</span>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-header">
          <span>Stashes</span>
          <span>{stashes.length}</span>
        </div>

        {conflictWarning && (
          <div className="stash-conflict-banner">
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Conflicts detected — resolve the conflict markers (&lt;&lt;&lt;&lt;&lt;&lt;&lt;) in your files manually, then mark as resolved.</span>
          </div>
        )}

        {stashes.length === 0 ? (
          <div className="stash-empty">No stashes</div>
        ) : (
          stashes.map((stash) => {
            const isSelected = selectedStashIndex === stash.index
            const isPopping = poppingIndex === stash.index
            return (
              <div
                key={stash.ref}
                className={`sidebar-item stash-item${isSelected ? ' stash-selected' : ''}`}
                onClick={() => setSelectedStashIndex(isSelected ? null : stash.index)}
                data-testid={`stash-item-${stash.index}`}
              >
                <Package
                  className="sidebar-item-icon"
                  size={14}
                  style={{ color: isSelected ? 'var(--accent-light)' : 'var(--text-secondary)', flexShrink: 0 }}
                />
                <div className="stash-item-info">
                  <div className="stash-item-message" title={stash.message}>
                    {stash.message}
                  </div>
                  <div className="stash-item-date">{formatStashDate(stash.date)}</div>
                </div>
                {isSelected && (
                  <div className="stash-actions">
                    <button
                      className="stash-action-btn pop"
                      onClick={(e) => handlePopStash(e, stash.index)}
                      disabled={isPopping || deletingIndex === stash.index}
                      title="Pop this stash back to working directory"
                      data-testid={`stash-pop-btn-${stash.index}`}
                    >
                      {isPopping ? '…' : 'Pop'}
                    </button>
                    <button
                      className="stash-action-btn details"
                      onClick={(e) => handleShowStashDetails(e, stash.index, stash.message)}
                      disabled={isPopping || deletingIndex === stash.index}
                      title="View stash files and diff details"
                      data-testid={`stash-details-btn-${stash.index}`}
                    >
                      <List size={13} />
                    </button>
                    <button
                      className="stash-action-btn delete"
                      onClick={(e) => handleDeleteStash(e, stash.index)}
                      disabled={isPopping || deletingIndex === stash.index}
                      title="Delete this stash"
                      data-testid={`stash-delete-btn-${stash.index}`}
                    >
                      {deletingIndex === stash.index ? '…' : <Trash2 size={13} />}
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Tags</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{activeRepo?.tags?.length ?? 0}</span>
            {activeRepo?.tags && activeRepo.tags.length > 0 && (
              <button
                className="stash-action-btn"
                style={{ padding: 2, height: 20, width: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={handlePushTags}
                title="Push all local tags to remote (origin)"
                data-testid="sidebar-push-tags-btn"
              >
                <Upload size={12} />
              </button>
            )}
          </div>
        </div>
        {(!activeRepo?.tags || activeRepo.tags.length === 0) ? (
          <div style={{ padding: '8px 20px', fontSize: '12px', color: 'var(--text-secondary)' }} data-testid="no-tags-message">No tags</div>
        ) : (
          activeRepo.tags.map((tag) => (
            <div key={tag} className="sidebar-item" style={{ display: 'flex', alignItems: 'center' }} data-testid={`sidebar-tag-${tag}`}>
              <Tag className="sidebar-item-icon" size={14} style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</span>
            </div>
          ))
        )}
      </div>


      {isStashDetailsOpen && activeRepo && detailsStashIndex !== null && (
        <DiffModal
          isOpen={isStashDetailsOpen}
          onClose={() => {
            setIsStashDetailsOpen(false)
            setDetailsStashIndex(null)
            setDetailsStashMessage(null)
          }}
          filePath=""
          status=""
          repoPath={activeRepo.path}
          isStash={true}
          stashIndex={detailsStashIndex}
          stashMessage={detailsStashMessage}
        />
      )}

      {mergeModalOpen && (
        <MergeRebaseModal
          isOpen={mergeModalOpen}
          onClose={() => setMergeModalOpen(false)}
          sourceBranch={mergeTargetBranch}
          targetBranch={branch}
          operation={mergeOperation}
          onConfirm={handleMergeConfirm}
        />
      )}

      {isBranchModalOpen && (
        <div 
          className="diff-modal-overlay" 
          style={{ zIndex: 1100 }} 
          onClick={() => setIsBranchModalOpen(false)}
        >
          <div 
            className="diff-modal-content" 
            style={{ 
              maxWidth: '400px', 
              width: '90%', 
              height: 'auto', 
              display: 'flex', 
              flexDirection: 'column', 
              animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)', 
              padding: 0 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="diff-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitBranch size={16} />
                {branchModalMode === 'create' ? 'Create New Branch' : 'Rename Branch'}
              </h2>
              <button 
                className="diff-modal-close" 
                onClick={() => setIsBranchModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
                data-testid="close-branch-modal-btn"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {branchModalMode === 'create' ? (
                  <>Create a new local branch starting from the latest commit of <strong>{branch}</strong>.</>
                ) : (
                  <>Enter a new name for the local branch <strong>{branchToRename}</strong>.</>
                )}
              </div>
              <input
                type="text"
                placeholder={branchModalMode === 'create' ? "Branch name..." : "New branch name..."}
                value={newBranchName}
                onChange={(e) => {
                  setNewBranchName(e.target.value)
                  setErrorMessage('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleBranchModalSubmit()
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none'
                }}
                autoFocus
                data-testid="new-branch-name-input"
              />
              {errorMessage && (
                <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }} data-testid="branch-error-message">
                  {errorMessage}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: 'var(--bg-secondary)' }}>
              <button
                className="btn-secondary"
                onClick={() => setIsBranchModalOpen(false)}
                data-testid="cancel-branch-btn"
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleBranchModalSubmit}
                disabled={!newBranchName.trim() || (branchModalMode === 'rename' && newBranchName.trim() === branchToRename)}
                style={{ opacity: (!newBranchName.trim() || (branchModalMode === 'rename' && newBranchName.trim() === branchToRename)) ? 0.5 : 1, cursor: (!newBranchName.trim() || (branchModalMode === 'rename' && newBranchName.trim() === branchToRename)) ? 'not-allowed' : 'pointer' }}
                data-testid="create-branch-submit-btn"
              >
                {branchModalMode === 'create' ? 'Create Branch' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Sidebar
