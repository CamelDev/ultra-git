import React, { useEffect, useState } from 'react'
import { FileText, Copy, Check } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'
import { DiffModal } from './DiffModal'

const DetailsPanel: React.FC = () => {
  const { getActiveRepo, selectedCommitHash } = useRepoStore()
  const activeRepo = getActiveRepo()
  
  const [files, setFiles] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFileForDiff, setSelectedFileForDiff] = useState<any | null>(null)
  const [copied, setCopied] = useState(false)

  const commit = activeRepo?.commits.find((c) => c.hash === selectedCommitHash)

  // Reset copied state when selected commit changes
  useEffect(() => {
    setCopied(false)
  }, [selectedCommitHash])

  const handleCopySHA = (hash: string) => {
    window.api.app.copyToClipboard(hash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    if (!selectedCommitHash || !activeRepo) {
      setFiles([])
      setError(null)
      setIsLoading(false)
      return
    }

    let isMounted = true
    setIsLoading(true)
    setError(null)

    window.api.git
      .getCommitFiles(activeRepo.path, selectedCommitHash)
      .then((res) => {
        if (!isMounted) return
        if (res.success && res.data) {
          setFiles(res.data)
        } else {
          setError(res.error || 'Failed to fetch commit files')
        }
        setIsLoading(false)
      })
      .catch((err) => {
        if (!isMounted) return
        setError(err.message || 'Error fetching files')
        setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [selectedCommitHash, activeRepo?.path])

  return (
    <div className="details-panel">
      <div className="details-header">
        <div className="details-title">Selection Details</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {commit ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                {commit.message}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
                  <span>by {commit.author_name}</span>
                  <span>•</span>
                  <span>{new Date(commit.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
                {commit.author_email && (
                  <div 
                    data-testid="commit-author-email"
                    style={{ 
                      color: 'var(--text-secondary)', 
                      opacity: 0.8,
                      fontStyle: 'italic'
                    }}
                  >
                    &lt;{commit.author_email}&gt;
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                <span>SHA:</span>
                <code 
                  data-testid="commit-sha-short"
                  style={{ 
                    fontFamily: 'JetBrains Mono, monospace', 
                    backgroundColor: 'var(--bg-tertiary)', 
                    padding: '1px 4px', 
                    borderRadius: '3px',
                    border: '1px solid var(--border)',
                    fontSize: '10.5px',
                    color: 'var(--text-primary)'
                  }}
                >
                  {commit.hash.substring(0, 7)}
                </code>
                <button
                  onClick={() => handleCopySHA(commit.hash)}
                  className="copy-sha-btn"
                  data-testid="copy-sha-btn"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: copied ? '#10b981' : 'var(--text-secondary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2px',
                    borderRadius: '4px',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--hover)'
                    e.currentTarget.style.color = copied ? '#10b981' : 'var(--text-primary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.color = copied ? '#10b981' : 'var(--text-secondary)'
                  }}
                  data-tooltip="Copy full SHA"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          ) : (
            'Select a commit to view changes'
          )}
        </div>
      </div>
      <div style={{ padding: '10px 15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {isLoading ? 'Loading files...' : `${files.length} files modified`}
        </span>
      </div>
      <div className="file-list">
        {isLoading && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Loading files...
          </div>
        )}
        {error && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#f87171', fontSize: '12px' }}>
            Error: {error}
          </div>
        )}
        {!isLoading && !error && !selectedCommitHash && (
          <div className="file-item">
            <FileText size={14} style={{ marginRight: '8px', color: 'var(--text-secondary)', flexShrink: 0 }} />
            <span>No selection</span>
          </div>
        )}
        {!isLoading && !error && selectedCommitHash && files.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
            No files changed in this commit
          </div>
        )}
        {!isLoading && !error && selectedCommitHash && files.map((file) => (
          <div 
            key={file.path} 
            className="file-item"
            style={{ cursor: 'pointer' }}
            onClick={() => setSelectedFileForDiff(file)}
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
            <span className={`file-status status-${file.status.toLowerCase()}`}>
              {file.status}
            </span>
          </div>
        ))}
      </div>

      {selectedFileForDiff && activeRepo && selectedCommitHash && (
        <DiffModal
          isOpen={!!selectedFileForDiff}
          onClose={() => setSelectedFileForDiff(null)}
          filePath={selectedFileForDiff.path}
          oldPath={selectedFileForDiff.oldPath}
          status={selectedFileForDiff.status}
          commitHash={selectedCommitHash}
          repoPath={activeRepo.path}
        />
      )}
    </div>
  )
}

export default DetailsPanel
