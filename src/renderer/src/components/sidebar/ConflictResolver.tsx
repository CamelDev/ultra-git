import React, { useState, useEffect, useCallback } from "react"
import { AlertTriangle, CheckCircle, FileText, ChevronRight, XCircle, GitMerge, RotateCcw, Check, X } from "lucide-react"
import { useRepoStore } from "../../store/useRepoStore"

interface ConflictedFile {
  path: string
  status: string
}

interface ConflictHunk {
  ours: string
  base: string
  theirs: string
  startLine: number
}

interface ResolvedHunk {
  resolution: "ours" | "theirs" | "both" | "manual"
  content: string
}

interface ConflictResolverProps {
  isRebase: boolean
  isCherryPick?: boolean
  conflictedFiles: ConflictedFile[]
  onAbort: () => Promise<void>
  onComplete: () => Promise<void>
  onDismiss?: () => void
}

export const ConflictResolver: React.FC<ConflictResolverProps> = ({
  isRebase,
  isCherryPick,
  conflictedFiles,
  onAbort,
  onComplete,
  onDismiss
}) => {
  const { getActiveRepo, refreshRepo } = useRepoStore()
  const activeRepo = getActiveRepo()

  const [selectedFile, setSelectedFile] = useState<string | null>(
    conflictedFiles.length > 0 ? conflictedFiles[0].path : null
  )
  const [hunks, setHunks] = useState<ConflictHunk[]>([])
  const [rawContent, setRawContent] = useState<string>("")
  const [resolvedHunks, setResolvedHunks] = useState<ResolvedHunk[]>([])
  const [resolvedFiles, setResolvedFiles] = useState<Set<string>>(new Set())
  const [isLoadingDiff, setIsLoadingDiff] = useState(false)
  const [isAborting, setIsAborting] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [activeHunk, setActiveHunk] = useState(0)

  const loadFileDiff = useCallback(async (filePath: string) => {
    if (!activeRepo) return
    setIsLoadingDiff(true)
    setErrorMsg("")
    try {
      const res = await window.api.git.getConflictFileDiff(activeRepo.path, filePath)
      if (res.success && res.data) {
        setHunks(res.data.hunks)
        setRawContent(res.data.raw)
        setResolvedHunks(res.data.hunks.map(h => ({ resolution: "ours" as const, content: h.ours })))
        setActiveHunk(0)
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to load conflict diff")
    } finally {
      setIsLoadingDiff(false)
    }
  }, [activeRepo])

  useEffect(() => {
    if (selectedFile) {
      loadFileDiff(selectedFile)
    }
  }, [selectedFile, loadFileDiff])

  const resolveHunk = (index: number, resolution: "ours" | "theirs" | "both") => {
    const hunk = hunks[index]
    let content = ""
    if (resolution === "ours") content = hunk.ours
    else if (resolution === "theirs") content = hunk.theirs
    else content = hunk.ours + (hunk.ours && hunk.theirs ? "\n" : "") + hunk.theirs

    setResolvedHunks(prev => {
      const next = [...prev]
      next[index] = { resolution, content }
      return next
    })
  }

  const buildResolvedContent = (): string => {
    if (!rawContent || hunks.length === 0) return rawContent

    const lines = rawContent.split('\n')
    const resultLines: string[] = []
    let hunkIndex = 0
    let i = 0

    while (i < lines.length) {
      if (lines[i].startsWith('<<<<<<<') && hunkIndex < hunks.length) {
        // Insert the chosen resolution content instead of the conflict block
        const resolvedContent = resolvedHunks[hunkIndex]?.content ?? hunks[hunkIndex].ours
        if (resolvedContent !== '') {
          resolvedContent.split('\n').forEach(l => resultLines.push(l))
        }
        hunkIndex++
        i++ // skip <<<<<<< line
        // Skip until and including >>>>>>> line
        while (i < lines.length && !lines[i].startsWith('>>>>>>>')) {
          i++
        }
        if (i < lines.length) i++ // skip >>>>>>> line
      } else {
        resultLines.push(lines[i])
        i++
      }
    }

    return resultLines.join('\n')
  }

  const handleMarkResolved = async () => {
    if (!activeRepo || !selectedFile) return
    const resolvedContent = buildResolvedContent()
    try {
      const res = await window.api.git.resolveConflict(activeRepo.path, selectedFile, resolvedContent)
      if (res.success) {
        setResolvedFiles(prev => new Set([...prev, selectedFile]))
        // Select next unresolved file
        const nextFile = conflictedFiles.find(f => f.path !== selectedFile && !resolvedFiles.has(f.path))
        if (nextFile) {
          setSelectedFile(nextFile.path)
        }
        await refreshRepo(activeRepo.id)
      } else {
        setErrorMsg(res.error || "Failed to resolve conflict")
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to resolve conflict")
    }
  }

  const handleMarkResolvedNoMarkers = async () => {
    if (!activeRepo || !selectedFile) return
    try {
      const res = await window.api.git.add(activeRepo.path, selectedFile)
      if (res.success) {
        setResolvedFiles(prev => new Set([...prev, selectedFile]))
        // Select next unresolved file
        const nextFile = conflictedFiles.find(f => f.path !== selectedFile && !resolvedFiles.has(f.path))
        if (nextFile) {
          setSelectedFile(nextFile.path)
        }
        await refreshRepo(activeRepo.id)
      } else {
        setErrorMsg(res.error || "Failed to stage file")
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Failed to stage file")
    }
  }

  const handleAbort = async () => {
    setIsAborting(true)
    try {
      await onAbort()
    } finally {
      setIsAborting(false)
    }
  }

  const handleComplete = async () => {
    setIsCompleting(true)
    try {
      await onComplete()
    } finally {
      setIsCompleting(false)
    }
  }

  const allResolved = conflictedFiles.every(f => resolvedFiles.has(f.path))
  // All hunks in the current file must have a resolution chosen before allowing Apply
  const allHunksResolved = hunks.length > 0 && resolvedHunks.length === hunks.length && resolvedHunks.every(h => !!h.resolution)

  return (
    <div
      data-testid="conflict-resolver"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg-primary)",
        overflow: "hidden"
      }}
    >
      {/* Header banner */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 20px",
        background: "rgba(251, 191, 36, 0.08)",
        borderBottom: "1px solid rgba(251, 191, 36, 0.25)",
        flexShrink: 0,
        gap: "12px",
        flexWrap: "wrap"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <AlertTriangle size={16} style={{ color: "#fbbf24", flexShrink: 0 }} />
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#fbbf24" }}>
            {isRebase ? "Rebase" : isCherryPick ? "Cherry-pick" : "Merge"} in progress
          </span>
          <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            — {resolvedFiles.size} of {conflictedFiles.length} conflict{conflictedFiles.length !== 1 ? "s" : ""} resolved
          </span>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            className="btn-secondary"
            onClick={handleAbort}
            disabled={isAborting || isCompleting}
            style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}
            data-testid="abort-merge-btn"
            data-tooltip={`Abort the current ${isRebase ? 'rebase' : isCherryPick ? 'cherry-pick' : 'merge'} process`}
          >
            <XCircle size={13} />
            {isAborting ? "Aborting\u2026" : `Abort ${isRebase ? "Rebase" : isCherryPick ? "Cherry-pick" : "Merge"}`}
          </button>
          <div
            data-tooltip={!allResolved ? `Still ${conflictedFiles.filter(f => !resolvedFiles.has(f.path)).length} file(s) to resolve` : "Complete the conflict resolution and commit changes"}
            style={{ display: "inline-flex" }}
          >
            <button
              className="btn-primary"
              onClick={handleComplete}
              disabled={!allResolved || isCompleting || isAborting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                opacity: !allResolved ? 0.45 : 1,
                cursor: !allResolved ? "not-allowed" : "pointer",
                width: "100%"
              }}
              data-testid="complete-merge-btn"
            >
              <GitMerge size={13} />
              {isCompleting ? "Committing\u2026" : (isRebase ? "Continue Rebase" : isCherryPick ? "Continue Cherry-pick" : "Commit Merge")}
            </button>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              data-tooltip="Minimize — conflicts remain active"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
                marginLeft: "4px",
                flexShrink: 0
              }}
              data-testid="dismiss-conflict-resolver-btn"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Body: file list + diff panes */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
        {/* Left: file list */}
        <div style={{
          width: "220px",
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}>
          <div style={{
            padding: "10px 14px 6px",
            fontSize: "10px",
            fontWeight: 700,
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            borderBottom: "1px solid var(--border)"
          }}>
            Conflicted Files
          </div>
          <div style={{ overflow: "auto", flex: 1 }}>
            {conflictedFiles.map(f => {
              const isResolved = resolvedFiles.has(f.path)
              const isSelected = selectedFile === f.path
              return (
                <div
                  key={f.path}
                  onClick={() => setSelectedFile(f.path)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 14px",
                    cursor: "pointer",
                    background: isSelected ? "rgba(167, 139, 250, 0.08)" : "transparent",
                    borderLeft: isSelected ? "2px solid #a78bfa" : "2px solid transparent",
                    borderBottom: "1px solid var(--border)",
                    transition: "background 0.1s"
                  }}
                  data-testid={`conflict-file-${f.path}`}
                >
                  {isResolved
                    ? <CheckCircle size={13} style={{ color: "#34d399", flexShrink: 0 }} />
                    : <FileText size={13} style={{ color: "#fbbf24", flexShrink: 0 }} />
                  }
                  <span style={{
                    fontSize: "11px",
                    color: isResolved ? "var(--text-secondary)" : "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textDecoration: isResolved ? "line-through" : "none",
                    flex: 1
                  }} data-tooltip={f.path}>
                    {f.path.split("/").pop() || f.path}
                  </span>
                  {isSelected && <ChevronRight size={12} style={{ color: "#a78bfa", flexShrink: 0 }} />}
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: diff / hunk resolution area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {isLoadingDiff ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-secondary)", fontSize: "13px" }}>
              Loading conflict diff…
            </div>
          ) : !selectedFile ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-secondary)", fontSize: "13px" }}>
              Select a file to resolve
            </div>
          ) : hunks.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px" }}>
              <CheckCircle size={24} style={{ color: "#34d399" }} />
              <span style={{ color: "var(--text-secondary)", fontSize: "13px" }}>No conflict markers found in this file</span>
              <button
                className="btn-primary"
                onClick={handleMarkResolvedNoMarkers}
                disabled={resolvedFiles.has(selectedFile || "")}
                style={{
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 16px",
                  marginTop: "8px",
                  opacity: resolvedFiles.has(selectedFile || "") ? 0.5 : 1,
                  cursor: resolvedFiles.has(selectedFile || "") ? "not-allowed" : "pointer"
                }}
                data-testid="mark-resolved-no-markers-btn"
                data-tooltip="Mark this file as resolved and stage it"
              >
                <Check size={14} />
                Mark Resolved &amp; Stage
              </button>
            </div>
          ) : (
            <>
              {/* Hunk tabs */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderBottom: "1px solid var(--border)",
                flexShrink: 0,
                overflowX: "auto"
              }}>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", marginRight: "4px" }}>Conflict:</span>
                {hunks.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveHunk(idx)}
                    data-tooltip={`View conflict hunk #${idx + 1}`}
                    style={{
                      padding: "3px 10px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: 600,
                      border: `1px solid ${activeHunk === idx ? "#a78bfa" : "var(--border)"}`,
                      background: activeHunk === idx ? "rgba(167, 139, 250, 0.15)" : "transparent",
                      color: activeHunk === idx ? "#a78bfa" : "var(--text-secondary)",
                      cursor: "pointer"
                    }}
                  >
                    #{idx + 1}
                    {resolvedHunks[idx]?.resolution && (
                      <span style={{ marginLeft: "4px", color: "#34d399" }}>✓</span>
                    )}
                  </button>
                ))}
                <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
                  <div
                    data-tooltip={!allHunksResolved ? "Pick a resolution for every conflict hunk first" : "Write resolved content to disk and stage the file"}
                    style={{ display: "inline-flex" }}
                  >
                    <button
                      className="btn-primary"
                      onClick={handleMarkResolved}
                      disabled={resolvedFiles.has(selectedFile || "") || !allHunksResolved}
                      style={{
                        fontSize: "11px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 12px",
                        opacity: (!allHunksResolved || resolvedFiles.has(selectedFile || "")) ? 0.5 : 1,
                        cursor: (!allHunksResolved || resolvedFiles.has(selectedFile || "")) ? "not-allowed" : "pointer"
                      }}
                      data-testid="mark-resolved-btn"
                    >
                      <Check size={12} />
                      Apply &amp; Stage
                    </button>
                  </div>
                </div>
              </div>

              {/* Active hunk 3-pane view */}
              {hunks[activeHunk] && (
                <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
                  {/* Resolution buttons */}
                  <div style={{
                    display: "flex",
                    gap: "8px",
                    padding: "8px 16px",
                    borderBottom: "1px solid var(--border)",
                    flexShrink: 0,
                    background: "rgba(0,0,0,0.15)"
                  }}>
                    <span style={{ fontSize: "11px", color: "var(--text-secondary)", alignSelf: "center" }}>Accept:</span>
                    {([
                      { key: "ours" as const, label: "Ours (Current)", color: "#60a5fa" },
                      { key: "theirs" as const, label: "Theirs (Incoming)", color: "#a78bfa" },
                      { key: "both" as const, label: "Both", color: "#fbbf24" }
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => resolveHunk(activeHunk, opt.key)}
                        data-tooltip={opt.key === 'ours' ? "Accept current changes (ours)" : opt.key === 'theirs' ? "Accept incoming changes (theirs)" : "Accept both changes"}
                        style={{
                          padding: "4px 12px",
                          borderRadius: "4px",
                          fontSize: "11px",
                          fontWeight: 600,
                          border: `1px solid ${resolvedHunks[activeHunk]?.resolution === opt.key ? opt.color : "var(--border)"}`,
                          background: resolvedHunks[activeHunk]?.resolution === opt.key ? `${opt.color}22` : "transparent",
                          color: resolvedHunks[activeHunk]?.resolution === opt.key ? opt.color : "var(--text-secondary)",
                          cursor: "pointer"
                        }}
                        data-testid={`accept-${opt.key}-btn`}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <button
                      onClick={() => loadFileDiff(selectedFile!)}
                      data-tooltip="Reload from disk"
                      style={{
                        marginLeft: "auto",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center"
                      }}
                    >
                      <RotateCcw size={12} />
                    </button>
                  </div>

                  {/* 3-pane diff */}
                  <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
                    {/* Ours */}
                    <HunkPane
                      label="Ours (Current Branch)"
                      content={hunks[activeHunk].ours}
                      color="#60a5fa"
                      isSelected={resolvedHunks[activeHunk]?.resolution === "ours"}
                      onClick={() => resolveHunk(activeHunk, "ours")}
                    />
                    <div style={{ width: "1px", background: "var(--border)", flexShrink: 0 }} />
                    {/* Theirs */}
                    <HunkPane
                      label="Theirs (Incoming)"
                      content={hunks[activeHunk].theirs}
                      color="#a78bfa"
                      isSelected={resolvedHunks[activeHunk]?.resolution === "theirs"}
                      onClick={() => resolveHunk(activeHunk, "theirs")}
                    />
                    {/* Result preview */}
                    <div style={{ width: "1px", background: "var(--border)", flexShrink: 0 }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <div style={{
                        padding: "6px 12px",
                        fontSize: "10px",
                        fontWeight: 700,
                        color: "#34d399",
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        borderBottom: "1px solid var(--border)",
                        background: "rgba(52, 211, 153, 0.06)"
                      }}>
                        ✓ Result
                      </div>
                      <pre 
                        data-testid="conflict-result-preview"
                        style={{
                          flex: 1,
                          margin: 0,
                          padding: "12px",
                        fontSize: "12px",
                        fontFamily: "monospace",
                        color: "var(--text-primary)",
                        background: "rgba(52, 211, 153, 0.03)",
                        overflow: "auto",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        lineHeight: 1.6
                      }}>
                        {resolvedHunks[activeHunk]?.content || "(empty)"}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {errorMsg && (
            <div style={{
              padding: "8px 16px",
              background: "rgba(239, 68, 68, 0.1)",
              borderTop: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#f87171",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexShrink: 0
            }}>
              <AlertTriangle size={12} />
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface HunkPaneProps {
  label: string
  content: string
  color: string
  isSelected: boolean
  onClick: () => void
}

const HunkPane: React.FC<HunkPaneProps> = ({ label, content, color, isSelected, onClick }) => (
  <div
    style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
      cursor: "pointer",
      border: isSelected ? `1px solid ${color}44` : "none",
      outline: "none"
    }}
    onClick={onClick}
    data-tooltip="Click to accept this side"
  >
    <div style={{
      padding: "6px 12px",
      fontSize: "10px",
      fontWeight: 700,
      color,
      textTransform: "uppercase",
      letterSpacing: "0.07em",
      borderBottom: "1px solid var(--border)",
      background: isSelected ? `${color}11` : `${color}08`,
      display: "flex",
      alignItems: "center",
      gap: "6px"
    }}>
      {isSelected && <Check size={10} />}
      {label}
    </div>
    <pre style={{
      flex: 1,
      margin: 0,
      padding: "12px",
      fontSize: "12px",
      fontFamily: "monospace",
      color: "var(--text-primary)",
      background: isSelected ? `${color}06` : "transparent",
      overflow: "auto",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      lineHeight: 1.6,
      transition: "background 0.15s"
    }}>
      {content || "(empty)"}
    </pre>
  </div>
)
