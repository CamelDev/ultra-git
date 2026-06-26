import React, { useState } from 'react'
import { useRepoStore } from '../../store/useRepoStore'

const Toolbar: React.FC = () => {
  const { getActiveRepo, refreshRepo } = useRepoStore()
  const activeRepo = getActiveRepo()
  const [commitMessage, setCommitMessage] = useState('')

  const files = activeRepo?.status?.files as any[] || []
  const stagedFiles = files.filter((f) => f.index !== ' ' && f.index !== '?')
  const unstagedFiles = files.filter((f) => f.working_dir !== ' ' || f.index === '?')

  const handleStageAll = async () => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.addAll(activeRepo.path)
      if (res.success) {
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to stage all files:', res.error)
      }
    } catch (err) {
      console.error('Error staging all files:', err)
    }
  }

  const handleUnstageAll = async () => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.resetAll(activeRepo.path)
      if (res.success) {
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to unstage all files:', res.error)
      }
    } catch (err) {
      console.error('Error unstaging all files:', err)
    }
  }

  const handleStashAll = async () => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.stashAll(activeRepo.path)
      if (res.success) {
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to stash files:', res.error)
      }
    } catch (err) {
      console.error('Error stashing files:', err)
    }
  }

  const handleCommit = async () => {
    if (!activeRepo) return
    if (commitMessage.trim().length <= 2) return
    if (stagedFiles.length === 0) {
      await window.api.app.showMessageBox({
        type: 'warning',
        title: 'No changes staged',
        message: 'There are no changes staged to be committed. Please stage some changes first.'
      })
      return
    }
    try {
      const res = await window.api.git.commit(activeRepo.path, commitMessage)
      if (res.success) {
        setCommitMessage('')
        await refreshRepo(activeRepo.id)
      } else {
        console.error('Failed to commit:', res.error)
      }
    } catch (err) {
      console.error('Error committing changes:', err)
    }
  }

  return (
    <div className="toolbar">
      <div
        className="toolbar-title"
        style={{
          fontSize: '16px',
          fontWeight: 700,
          color: 'var(--text-primary)'
        }}
      >
        Branch changes
      </div>

      {activeRepo && files.length > 0 && (
        <div className="toolbar-actions" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            className="btn-primary"
            onClick={handleStageAll}
            disabled={unstagedFiles.length === 0}
            style={{ opacity: unstagedFiles.length === 0 ? 0.5 : 1, cursor: unstagedFiles.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            Stage all
          </button>
          <button
            className="btn-secondary"
            onClick={handleUnstageAll}
            disabled={stagedFiles.length === 0}
            style={{ opacity: stagedFiles.length === 0 ? 0.5 : 1, cursor: stagedFiles.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            Unstage all
          </button>
          <button
            className="btn-stash"
            onClick={handleStashAll}
            disabled={files.length === 0}
            style={{ opacity: files.length === 0 ? 0.5 : 1, cursor: files.length === 0 ? 'not-allowed' : 'pointer' }}
            title="Stash all uncommitted changes (staged and unstaged)"
            data-testid="stash-all-btn"
          >
            Stash all
          </button>

          <div className="commit-section" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              className="commit-input"
              placeholder="Commit message..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              data-testid="commit-message-input"
            />
            <button
              className="btn-primary"
              onClick={handleCommit}
              disabled={commitMessage.trim().length <= 2}
              style={{ opacity: commitMessage.trim().length <= 2 ? 0.5 : 1, cursor: commitMessage.trim().length <= 2 ? 'not-allowed' : 'pointer' }}
              data-testid="commit-btn"
            >
              Commit
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Toolbar
