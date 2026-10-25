import React, { useState, useEffect, useCallback } from 'react'
import { Globe, Plus, Trash2, Copy, Check, X, AlertTriangle, RefreshCw } from 'lucide-react'
import { useToaster } from '../toaster/ToasterContext'
import { useRepoStore } from '../../store/useRepoStore'
import { AppDialog } from '../dialogs/AppDialog'

interface RemoteInfo {
  name: string
  refs: {
    fetch: string
    push: string
  }
}

interface ManageRemotesModalProps {
  isOpen: boolean
  onClose: () => void
  repoPath: string
  repoId: string
}

export const ManageRemotesModal: React.FC<ManageRemotesModalProps> = ({
  isOpen,
  onClose,
  repoPath,
  repoId
}) => {
  const { addToast } = useToaster()
  const { refreshRepo } = useRepoStore()

  const [remotes, setRemotes] = useState<RemoteInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add remote form state
  const [newRemoteName, setNewRemoteName] = useState('')
  const [newRemoteUrl, setNewRemoteUrl] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Delete remote confirmation state
  const [remoteToDelete, setRemoteToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Copied URL feedback state: maps remote name to copied boolean
  const [copiedRemote, setCopiedRemote] = useState<string | null>(null)

  const loadRemotes = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await window.api.git.getRemotes(repoPath)
      if (res.success && res.data) {
        setRemotes(res.data)
        // If there are no remotes yet, default the new remote name to 'origin'
        if (res.data.length === 0 && !newRemoteName) {
          setNewRemoteName('origin')
        }
      } else {
        setError(res.error || 'Failed to load remotes')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching remotes')
    } finally {
      setIsLoading(false)
    }
  }, [repoPath, newRemoteName])

  useEffect(() => {
    if (isOpen) {
      loadRemotes()
      setAddError(null)
    }
  }, [isOpen, loadRemotes])

  // Handle Escape key to close modal (only if confirm dialog is not active)
  useEffect(() => {
    if (!isOpen || remoteToDelete) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, remoteToDelete, onClose])

  const handleCopyUrl = (remoteName: string, url: string) => {
    window.api.app.copyToClipboard(url)
    setCopiedRemote(remoteName)
    setTimeout(() => {
      setCopiedRemote((curr) => (curr === remoteName ? null : curr))
    }, 2000)
  }

  const handleAddRemote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const name = newRemoteName.trim()
    const url = newRemoteUrl.trim()

    if (!name) {
      setAddError('Remote name is required.')
      return
    }

    if (/\s/.test(name)) {
      setAddError('Remote name cannot contain spaces.')
      return
    }

    if (!url) {
      setAddError('Remote URL is required.')
      return
    }

    if (remotes.some((r) => r.name.toLowerCase() === name.toLowerCase())) {
      setAddError(`A remote named "${name}" already exists.`)
      return
    }

    setIsAdding(true)
    setAddError(null)
    try {
      const res = await window.api.git.addRemote(repoPath, name, url)
      if (res.success) {
        addToast({
          variant: 'success',
          title: 'Remote Added',
          message: `Remote "${name}" has been successfully added.`
        })
        setNewRemoteName('')
        setNewRemoteUrl('')
        await loadRemotes()
        await refreshRepo(repoId)
      } else {
        setAddError(res.error || 'Failed to add remote.')
      }
    } catch (err: any) {
      setAddError(err.message || 'An unexpected error occurred.')
    } finally {
      setIsAdding(false)
    }
  }

  const confirmRemoveRemote = async () => {
    if (!remoteToDelete) return
    const name = remoteToDelete
    setIsDeleting(true)
    try {
      const res = await window.api.git.removeRemote(repoPath, name)
      if (res.success) {
        addToast({
          variant: 'success',
          title: 'Remote Removed',
          message: `Remote "${name}" has been removed.`
        })
        setRemoteToDelete(null)
        await loadRemotes()
        await refreshRepo(repoId)
      } else {
        addToast({
          variant: 'error',
          title: 'Remove Remote Failed',
          message: res.error || `Failed to remove remote "${name}".`
        })
      }
    } catch (err: any) {
      addToast({
        variant: 'error',
        title: 'Error',
        message: err.message || `An error occurred while removing "${name}".`
      })
    } finally {
      setIsDeleting(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div
        className="diff-modal-overlay"
        style={{ zIndex: 1100 }}
        onClick={onClose}
        data-testid="manage-remotes-overlay"
      >
        <div
          className="diff-modal-content"
          style={{
            maxWidth: '560px',
            width: '92%',
            height: 'auto',
            display: 'flex',
            flexDirection: 'column',
            animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            padding: 0
          }}
          onClick={(e) => e.stopPropagation()}
          data-testid="manage-remotes-modal"
        >
          {/* Header */}
          <div
            className="diff-modal-header"
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={18} style={{ color: 'var(--accent-light)' }} />
              <h2
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--text-primary)'
                }}
              >
                Manage Remotes
              </h2>
              {!isLoading && (
                <span
                  style={{
                    backgroundColor: 'rgba(99, 102, 241, 0.15)',
                    color: 'var(--accent-light)',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '10px'
                  }}
                  data-testid="remotes-count-badge"
                >
                  {remotes.length}
                </span>
              )}
            </div>
            <button
              className="diff-modal-close"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 4
              }}
              data-testid="close-manage-remotes-modal-btn"
              data-tooltip="Close modal"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              maxHeight: '75vh',
              overflowY: 'auto'
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              View, add, or remove remote origins configured for this repository. Remotes are versions of your project hosted on the Internet or network.
            </div>

            {/* Remotes List Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-secondary)'
                  }}
                >
                  Configured Remotes
                </span>
                <button
                  onClick={loadRemotes}
                  disabled={isLoading}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    padding: '2px 4px'
                  }}
                  data-tooltip="Refresh remotes"
                  data-testid="refresh-remotes-btn"
                >
                  <RefreshCw size={12} className={isLoading ? 'spin-animation' : ''} />
                  <span>Refresh</span>
                </button>
              </div>

              {isLoading ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '30px',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    gap: '8px'
                  }}
                >
                  <RefreshCw size={14} className="spin-animation" />
                  <span>Loading remotes...</span>
                </div>
              ) : error ? (
                <div
                  style={{
                    padding: '12px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    color: '#f87171',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              ) : remotes.length === 0 ? (
                <div
                  style={{
                    padding: '24px 16px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px dashed var(--border)',
                    borderRadius: '6px',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  data-testid="no-remotes-message"
                >
                  <Globe size={24} style={{ opacity: 0.5, marginBottom: '4px' }} />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No remotes configured</span>
                  <span>Add a remote origin below to enable push and pull sync.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }} data-testid="remotes-list">
                  {remotes.map((remote) => {
                    const isCopied = copiedRemote === remote.name
                    const url = remote.refs.fetch || remote.refs.push || ''
                    const hasDifferentPush = remote.refs.push && remote.refs.push !== remote.refs.fetch

                    return (
                      <div
                        key={remote.name}
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          padding: '12px 14px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          transition: 'border-color 0.15s ease'
                        }}
                        data-testid={`remote-item-${remote.name}`}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span
                              style={{
                                fontSize: '13px',
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                              data-testid={`remote-name-${remote.name}`}
                            >
                              <Globe size={14} style={{ color: 'var(--accent-light)' }} />
                              {remote.name}
                            </span>
                            {remote.name === 'origin' && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  color: '#34d399',
                                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                  padding: '1px 6px',
                                  borderRadius: '3px'
                                }}
                              >
                                default
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              onClick={() => handleCopyUrl(remote.name, url)}
                              style={{
                                background: 'transparent',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                color: isCopied ? '#34d399' : 'var(--text-secondary)',
                                cursor: 'pointer',
                                padding: '4px 8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                transition: 'all 0.15s ease'
                              }}
                              data-tooltip={isCopied ? 'URL copied!' : 'Copy remote URL'}
                              data-testid={`copy-remote-${remote.name}-btn`}
                            >
                              {isCopied ? <Check size={12} /> : <Copy size={12} />}
                              <span>{isCopied ? 'Copied' : 'Copy'}</span>
                            </button>

                            <button
                              onClick={() => setRemoteToDelete(remote.name)}
                              style={{
                                background: 'transparent',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '4px',
                                color: '#f87171',
                                cursor: 'pointer',
                                padding: '4px 8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                transition: 'all 0.15s ease'
                              }}
                              data-tooltip={`Remove "${remote.name}"`}
                              data-testid={`remove-remote-${remote.name}-btn`}
                            >
                              <Trash2 size={12} />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>

                        {/* URLs */}
                        <div
                          style={{
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            color: 'var(--text-secondary)',
                            wordBreak: 'break-all',
                            backgroundColor: 'var(--bg-primary)',
                            padding: '6px 10px',
                            borderRadius: '4px',
                            marginTop: '2px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}
                        >
                          <div>
                            <span style={{ color: 'var(--text-secondary)', opacity: 0.7, marginRight: '6px' }}>Fetch:</span>
                            <span style={{ color: 'var(--text-primary)' }}>{remote.refs.fetch || '(none)'}</span>
                          </div>
                          {hasDifferentPush && (
                            <div>
                              <span style={{ color: 'var(--text-secondary)', opacity: 0.7, marginRight: '6px' }}>Push:</span>
                              <span style={{ color: 'var(--text-primary)' }}>{remote.refs.push}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Add Remote Section */}
            <div
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}
              data-testid="add-remote-section"
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Plus size={14} style={{ color: 'var(--accent-light)' }} />
                <span>Add New Remote</span>
              </div>

              <form onSubmit={handleAddRemote} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)'
                    }}
                  >
                    Remote Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. origin, upstream, mirror"
                    value={newRemoteName}
                    onChange={(e) => {
                      setNewRemoteName(e.target.value)
                      setAddError(null)
                    }}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    data-testid="add-remote-name-input"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)'
                    }}
                  >
                    Remote URL
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. https://github.com/user/repo.git or git@github.com:user/repo.git"
                    value={newRemoteUrl}
                    onChange={(e) => {
                      setNewRemoteUrl(e.target.value)
                      setAddError(null)
                    }}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '12px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    data-testid="add-remote-url-input"
                  />
                </div>

                {addError && (
                  <div
                    style={{
                      color: '#ef4444',
                      fontSize: '11px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    data-testid="add-remote-error"
                  >
                    <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                    <span>{addError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!newRemoteName.trim() || !newRemoteUrl.trim() || isAdding}
                  style={{
                    alignSelf: 'flex-start',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    marginTop: '2px',
                    opacity: !newRemoteName.trim() || !newRemoteUrl.trim() || isAdding ? 0.5 : 1,
                    cursor: !newRemoteName.trim() || !newRemoteUrl.trim() || isAdding ? 'not-allowed' : 'pointer'
                  }}
                  data-testid="add-remote-submit-btn"
                >
                  <Plus size={14} />
                  <span>{isAdding ? 'Adding...' : 'Add Remote'}</span>
                </button>
              </form>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'flex-end',
              backgroundColor: 'var(--bg-secondary)'
            }}
          >
            <button
              className="btn-secondary"
              onClick={onClose}
              data-testid="manage-remotes-close-btn"
              data-tooltip="Close modal"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog for Remote Deletion */}
      <AppDialog
        isOpen={!!remoteToDelete}
        title="Remove Remote"
        message={`Are you sure you want to remove remote "${remoteToDelete}"? Git will no longer track branches or synchronize with this remote.`}
        variant="warning"
        icon={<Trash2 size={16} />}
        actions={[
          {
            label: 'Cancel',
            value: 'cancel',
            variant: 'secondary'
          },
          {
            label: isDeleting ? 'Removing...' : 'Remove',
            value: 'remove',
            variant: 'danger',
            setsBusy: true
          }
        ]}
        onResolve={(val) => {
          if (val === 'remove') {
            confirmRemoveRemote()
          } else {
            setRemoteToDelete(null)
          }
        }}
        onCancel={() => setRemoteToDelete(null)}
        testId="remove-remote-confirm-dialog"
      />
    </>
  )
}
