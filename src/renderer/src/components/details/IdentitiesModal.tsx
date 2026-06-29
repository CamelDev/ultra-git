import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, FolderOpen, Github, Gitlab, Check, Loader2, Pencil, AlertCircle } from 'lucide-react'
import { useRepoStore, Identity } from '../../store/useRepoStore'

interface IdentitiesModalProps {
  isOpen: boolean
  onClose: () => void
}

const BitbucketIcon = (props: any) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M22.3 3.4c-.2-.4-.6-.7-1-.7H2.7c-.5 0-.9.3-1 .7L.1 19.3c-.1.5.1 1 .5 1.3.3.3.7.4 1.1.4h18.6c.4 0 .8-.2 1-.6l2.1-15.6c.1-.5-.1-1-.4-1.4zM15.4 15H8.6l-1-6.8h8.8l-1 6.8z"/>
  </svg>
)

export const IdentitiesModal: React.FC<IdentitiesModalProps> = ({ isOpen, onClose }) => {
  const { identities, addIdentity, removeIdentity, updateIdentity } = useRepoStore()
  
  // Form states
  const [provider, setProvider] = useState<'github' | 'gitlab' | 'bitbucket' | 'custom'>('github')
  const [label, setLabel] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sshKeyPath, setSshKeyPath] = useState('')
  const [personalAccessToken, setPersonalAccessToken] = useState('')
  
  // Validation and Integration states
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [connectedUser, setConnectedUser] = useState<{
    name: string
    email: string
    username: string
    avatarUrl: string
  } | null>(null)

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleReset = () => {
    setProvider('github')
    setLabel('')
    setName('')
    setEmail('')
    setSshKeyPath('')
    setPersonalAccessToken('')
    setConnectedUser(null)
    setValidationError('')
    setEditingId(null)
  }

  // Reset states when modal is opened/closed
  useEffect(() => {
    if (!isOpen) {
      handleReset()
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleBrowseSshKey = async () => {
    try {
      const res = await window.api.app.openFile({
        filters: [{ name: 'All Files', extensions: ['*'] }]
      })
      if (!res.canceled && res.path) {
        setSshKeyPath(res.path)
      }
    } catch (err) {
      console.error('Failed to open file dialog:', err)
    }
  }

  const handleConnectToken = async () => {
    if (!personalAccessToken.trim()) {
      setValidationError('Please enter a personal access token.')
      return
    }

    if (provider === 'bitbucket' && !email.trim()) {
      setValidationError('Bitbucket API tokens require your Atlassian account email address. Please fill in the Git Email field first.')
      return
    }

    setIsValidating(true)
    setValidationError('')
    setConnectedUser(null)

    try {
      const res = await window.api.git.validateToken(provider, personalAccessToken.trim(), email.trim())
      if (res.success && res.data) {
        const user = res.data
        setConnectedUser(user)
        
        // Auto-fill values
        setName(user.name || '')
        if (user.email) {
          setEmail(user.email)
        }
        if (!label) {
          const capitalizedProvider = provider.charAt(0).toUpperCase() + provider.slice(1)
          setLabel(`${capitalizedProvider} - ${user.username || user.name}`)
        }
      } else {
        setValidationError(res.error || 'Failed to authenticate token.')
      }
    } catch (err: any) {
      setValidationError(err.message || 'An unexpected error occurred during connection.')
    } finally {
      setIsValidating(false)
    }
  }

  const handleStartEdit = (identity: Identity) => {
    setEditingId(identity.id)
    setProvider(identity.provider || 'custom')
    setLabel(identity.label)
    setName(identity.name)
    setEmail(identity.email)
    setSshKeyPath(identity.sshKeyPath || '')
    setPersonalAccessToken(identity.personalAccessToken || '')
    
    if (identity.username) {
      setConnectedUser({
        name: identity.name,
        email: identity.email,
        username: identity.username,
        avatarUrl: identity.avatarUrl || ''
      })
    } else {
      setConnectedUser(null)
    }
    setValidationError('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError('')

    if (!label.trim() || !name.trim() || !email.trim()) {
      setValidationError('Label, Git Name, and Git Email are required fields.')
      return
    }

    const payload = {
      label: label.trim(),
      name: name.trim(),
      email: email.trim(),
      provider,
      username: connectedUser?.username || undefined,
      avatarUrl: connectedUser?.avatarUrl || undefined,
      sshKeyPath: sshKeyPath.trim() || undefined,
      personalAccessToken: personalAccessToken.trim() || undefined
    }

    if (editingId) {
      updateIdentity({
        ...payload,
        id: editingId
      })
    } else {
      addIdentity(payload)
    }

    handleReset()
  }

  const getProviderLink = () => {
    if (provider === 'github') return 'https://github.com/settings/tokens'
    if (provider === 'gitlab') return 'https://gitlab.com/-/user_settings/personal_access_tokens'
    if (provider === 'bitbucket') return 'https://id.atlassian.com/manage-profile/security/api-tokens'
    return null
  }

  const renderProviderIcon = (prov: string, size = 16) => {
    switch (prov) {
      case 'github':
        return <Github size={size} style={{ color: '#fff' }} />
      case 'gitlab':
        return <Gitlab size={size} style={{ color: '#fc6d26' }} />
      case 'bitbucket':
        return <BitbucketIcon width={size} height={size} style={{ color: '#0052cc' }} />
      default:
        return null
    }
  }

  return (
    <div 
      className="diff-modal-overlay" 
      style={{ zIndex: 1100 }}
      onClick={onClose}
    >
      <div 
        className="diff-modal-content" 
        style={{ 
          maxWidth: '850px', 
          width: '90%',
          height: '600px', 
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          padding: 0
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="diff-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Manage Git Identities
          </h2>
          <button className="diff-modal-close" onClick={onClose} data-testid="identities-close-btn" data-tooltip="Close modal">
            <X size={16} />
          </button>
        </div>

        {/* Modal Body: Split view */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Left Panel: Profile List */}
          <div style={{ width: '40%', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-secondary)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                Configured Profiles ({identities.length})
              </h3>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {identities.length === 0 ? (
                <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px', border: '1px dashed var(--border)', borderRadius: '6px' }}>
                  No custom Git identity profiles defined. Uses system configuration by default.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {identities.map((identity) => (
                    <div 
                      key={identity.id} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        padding: '10px 12px', 
                        backgroundColor: editingId === identity.id ? 'var(--bg-active)' : 'var(--bg-primary)', 
                        border: editingId === identity.id ? '1px solid var(--accent)' : '1px solid var(--border)', 
                        borderRadius: '6px',
                        gap: '10px',
                        position: 'relative'
                      }}
                      data-testid={`profile-row-${identity.label}`}
                    >
                      {/* Avatar */}
                      {identity.avatarUrl ? (
                        <img 
                          src={identity.avatarUrl} 
                          alt="avatar" 
                          style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
                        />
                      ) : (
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--border)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px' }}>
                          {identity.label.substring(0, 2).toUpperCase()}
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} data-tooltip={identity.label}>
                            {identity.label}
                          </span>
                          {identity.provider && identity.provider !== 'custom' && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.06)' }}>
                              {renderProviderIcon(identity.provider, 11)}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {identity.name}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button 
                          type="button"
                          className="btn-secondary" 
                          style={{ padding: '6px', border: 'none', color: 'var(--text-secondary)', backgroundColor: 'transparent' }}
                          onClick={() => handleStartEdit(identity)}
                          data-tooltip="Edit profile"
                          data-testid={`edit-profile-${identity.label}`}
                        >
                          <Pencil size={12} />
                        </button>
                        <button 
                          type="button"
                          className="btn-secondary" 
                          style={{ padding: '6px', border: 'none', color: '#f87171', backgroundColor: 'transparent' }}
                          onClick={() => {
                            if (editingId === identity.id) {
                              handleReset()
                            }
                            removeIdentity(identity.id)
                          }}
                          data-tooltip="Delete profile"
                          data-testid={`delete-profile-${identity.label}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Add/Edit Form */}
          <div style={{ width: '60%', padding: '24px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <h3 
              data-testid="form-header"
              style={{ margin: '0 0 16px 0', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}
            >
              {editingId ? 'Edit Identity Profile' : 'Add New Identity'}
            </h3>

            {validationError && (
              <div 
                style={{ 
                  color: '#f87171', 
                  fontSize: '12px', 
                  padding: '10px 14px', 
                  backgroundColor: 'rgba(239, 68, 68, 0.08)', 
                  borderRadius: '6px', 
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
                data-testid="identity-form-error"
              >
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <span>{validationError}</span>
              </div>
            )}

            {/* Provider Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', gap: '4px', marginBottom: '20px' }}>
              {(['github', 'gitlab', 'bitbucket', 'custom'] as const).map((prov) => {
                const isActive = provider === prov
                let tabName = 'Generic / Custom'
                if (prov === 'github') tabName = 'GitHub'
                if (prov === 'gitlab') tabName = 'GitLab'
                if (prov === 'bitbucket') tabName = 'Bitbucket'

                return (
                  <button
                    key={prov}
                    type="button"
                    onClick={() => {
                      if (!editingId) {
                        setProvider(prov)
                        setConnectedUser(null)
                        setPersonalAccessToken('')
                      }
                    }}
                    disabled={!!editingId} // Disable changing provider while editing (delete and re-create is cleaner)
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontSize: '12px',
                      fontWeight: isActive ? 700 : 500,
                      cursor: editingId ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      opacity: editingId && !isActive ? 0.4 : 1
                    }}
                    data-testid={`provider-tab-${prov}`}
                    data-tooltip={`Select ${tabName} identity provider`}
                  >
                    {renderProviderIcon(prov, 12)}
                    <span>{tabName}</span>
                  </button>
                )
              })}
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
              
              {/* Token-based auth config (only for GitHub/GitLab/Bitbucket) */}
              {provider !== 'custom' && (
                <div style={{ padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  
                  {connectedUser ? (
                    /* Account Connection State card */
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} data-testid="connected-account-card">
                      {connectedUser.avatarUrl ? (
                        <img 
                          src={connectedUser.avatarUrl} 
                          alt="avatar" 
                          style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid var(--border)' }}
                        />
                      ) : (
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                          {connectedUser.username.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{connectedUser.name}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>({connectedUser.username})</span>
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#10b981', fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
                          <Check size={12} />
                          <span>Connected</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '11px', color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.2)' }}
                        onClick={() => {
                          setConnectedUser(null)
                          setPersonalAccessToken('')
                        }}
                        data-tooltip="Disconnect provider account"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    /* Token input & guidance */
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                          Personal Access Token
                        </label>
                        {getProviderLink() && (
                          <a 
                            href={getProviderLink()!} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            style={{ fontSize: '10px', color: 'var(--accent-light)', marginLeft: 'auto', textDecoration: 'none' }}
                          >
                            Generate Token ↗
                          </a>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input 
                          type="password" 
                          placeholder="Paste access token (e.g. ghp_...)" 
                          className="commit-input"
                          style={{ flex: 1, fontSize: '12px' }}
                          value={personalAccessToken}
                          onChange={(e) => setPersonalAccessToken(e.target.value)}
                          data-testid="token-input"
                        />
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={isValidating || !personalAccessToken}
                          onClick={handleConnectToken}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
                          data-testid="connect-token-btn"
                          data-tooltip="Connect token to account"
                        >
                          {isValidating && <Loader2 size={12} className="spin-animation" />}
                          <span>{isValidating ? 'Connecting...' : 'Connect'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* Basic Details: Label */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Profile Label
                </label>
                <input 
                  type="text" 
                  placeholder="e.g. Personal GitHub" 
                  className="commit-input" 
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  data-testid="label-input"
                />
              </div>

              {/* Git Name and Email (Pre-fillable or Editable) */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Git Name (`user.name`)
                  </label>
                  <input 
                    type="text" 
                    placeholder="Jane Doe" 
                    className="commit-input" 
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="name-input"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Git Email (`user.email`)
                  </label>
                  <input 
                    type="email" 
                    placeholder="jane.doe@company.com" 
                    className="commit-input" 
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    data-testid="email-input"
                  />
                </div>
              </div>

              {/* SSH Private Key File Browse */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  SSH Private Key Path (Optional)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="text" 
                    placeholder="C:\Users\Jane\.ssh\id_rsa_work" 
                    className="commit-input" 
                    style={{ flex: 1 }}
                    value={sshKeyPath}
                    onChange={(e) => setSshKeyPath(e.target.value)}
                    data-testid="ssh-key-input"
                  />
                  <button 
                    type="button"
                    className="btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 10px' }}
                    onClick={handleBrowseSshKey}
                    data-testid="ssh-key-browse-btn"
                    data-tooltip="Browse SSH key files"
                  >
                    <FolderOpen size={14} />
                    <span>Browse</span>
                  </button>
                </div>
              </div>

              {/* Form Buttons */}
              <div style={{ marginTop: 'auto', display: 'flex', gap: '10px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                {editingId && (
                  <button 
                    type="button" 
                    className="btn-secondary" 
                    style={{ flex: 1 }}
                    onClick={handleReset}
                    data-testid="cancel-edit-btn"
                    data-tooltip="Cancel changes and reset form"
                  >
                    Cancel
                  </button>
                )}
                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ flex: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  data-testid="save-profile-btn"
                  data-tooltip={editingId ? "Save changes to profile" : "Create new Git identity profile"}
                >
                  <Plus size={14} />
                  <span>{editingId ? 'Save Changes' : 'Add Profile'}</span>
                </button>
              </div>

            </form>
          </div>

        </div>
      </div>
    </div>
  )
}
