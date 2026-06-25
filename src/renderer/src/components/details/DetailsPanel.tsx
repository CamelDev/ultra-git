import React, { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'
import { DiffModal } from './DiffModal'

const DetailsPanel: React.FC = () => {
  const { getActiveRepo, selectedCommitHash } = useRepoStore()
  const activeRepo = getActiveRepo()
  
  const [files, setFiles] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFileForDiff, setSelectedFileForDiff] = useState<any | null>(null)

  const commit = activeRepo?.commits.find((c) => c.hash === selectedCommitHash)

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
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                by {commit.author_name} • {new Date(commit.date).toLocaleDateString()}
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
              title={file.path}
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
