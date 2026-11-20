import React, { useState, useEffect, useMemo } from "react"
import { X, HardDrive, Lock, AlertTriangle, Loader, Search, CheckCircle2 } from "lucide-react"
import { Repository } from "../../store/useRepoStore"

const normalizePath = (p: string) => (p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()

export interface DeleteWorktreesResult {
  success: boolean
  errors?: string[]
  deletedWorktrees?: string[]
  failedWorktrees?: string[]
}

export const shouldSuggestForceWorktreeRemoval = (errors: string[]): boolean => {
  return errors.some((err) => {
    const lower = err.toLowerCase()
    return (
      lower.includes("locked") ||
      lower.includes("modified") ||
      lower.includes("untracked") ||
      lower.includes("dirty") ||
      lower.includes("contains modified") ||
      lower.includes("--force") ||
      lower.includes("force")
    )
  })
}

const TriStateCheckbox: React.FC<{
  checked: boolean
  indeterminate: boolean
  disabled?: boolean
  onChange: () => void
  testId?: string
}> = ({ checked, indeterminate, disabled, onChange, testId }) => {
  const ref = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate
    }
  }, [indeterminate])

  return (
    <input
      type="checkbox"
      ref={ref}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      data-testid={testId}
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        accentColor: "var(--accent)",
        width: "14px",
        height: "14px",
        marginRight: "8px",
        flexShrink: 0
      }}
    />
  )
}

interface DeleteWorktreesModalProps {
  isOpen: boolean
  onClose: () => void
  activeRepo: Repository
  initialWorktreePath?: string
  onConfirm: (worktreePaths: string[], force: boolean) => Promise<DeleteWorktreesResult>
}

export const DeleteWorktreesModal: React.FC<DeleteWorktreesModalProps> = ({
  isOpen,
  onClose,
  activeRepo,
  initialWorktreePath,
  onConfirm
}) => {
  const [checkedPaths, setCheckedPaths] = useState<Set<string>>(new Set())
  const [forceRemove, setForceRemove] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [recentlyDeleted, setRecentlyDeleted] = useState<string[]>([])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isDeleting) {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, isDeleting, onClose])

  const worktrees = useMemo(() => activeRepo?.worktrees ?? [], [activeRepo?.worktrees])
  const mainWtPath = worktrees[0]?.path ?? ""
  const activeRepoPath = activeRepo?.path ?? ""

  const isMainWorktree = (wtPath: string) =>
    Boolean(mainWtPath) && normalizePath(wtPath) === normalizePath(mainWtPath)

  const isActiveWorktree = (wtPath: string) =>
    Boolean(activeRepoPath) && normalizePath(wtPath) === normalizePath(activeRepoPath)

  const isWorktreeRemovable = (wtPath: string) =>
    !isMainWorktree(wtPath) && !isActiveWorktree(wtPath)

  // Synchronize checkedPaths with updated worktrees (prune removed or no-longer-removable worktrees)
  useEffect(() => {
    if (!isOpen) return
    const validPaths = new Set(worktrees.map((wt) => wt.path))
    setCheckedPaths((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const p of prev) {
        if (validPaths.has(p) && isWorktreeRemovable(p)) {
          next.add(p)
        } else {
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [worktrees, isOpen, mainWtPath, activeRepoPath])

  // Initialize modal state when opened
  useEffect(() => {
    if (isOpen) {
      const initialSet = new Set<string>()
      if (initialWorktreePath && isWorktreeRemovable(initialWorktreePath)) {
        initialSet.add(initialWorktreePath)
      }
      setCheckedPaths(initialSet)
      setForceRemove(false)
      setSearchText("")
      setErrors([])
      setRecentlyDeleted([])
      setIsDeleting(false)
    }
  }, [isOpen, initialWorktreePath])

  const filteredWorktrees = useMemo(() => {
    if (!searchText) return worktrees
    const lowerSearch = searchText.toLowerCase()
    return worktrees.filter((wt) => {
      const shortName = wt.path.split(/[/\\]/).pop() || wt.path
      return (
        wt.path.toLowerCase().includes(lowerSearch) ||
        shortName.toLowerCase().includes(lowerSearch) ||
        wt.branch.toLowerCase().includes(lowerSearch)
      )
    })
  }, [worktrees, searchText])

  const removableFilteredPaths = useMemo(
    () => filteredWorktrees.filter((wt) => isWorktreeRemovable(wt.path)).map((wt) => wt.path),
    [filteredWorktrees, mainWtPath, activeRepoPath]
  )

  if (!isOpen) return null

  const allRemovableChecked =
    removableFilteredPaths.length > 0 && removableFilteredPaths.every((p) => checkedPaths.has(p))
  const someRemovableChecked =
    removableFilteredPaths.some((p) => checkedPaths.has(p)) && !allRemovableChecked

  const handleToggleAll = () => {
    if (removableFilteredPaths.length === 0) return
    setCheckedPaths((prev) => {
      const next = new Set(prev)
      if (allRemovableChecked) {
        removableFilteredPaths.forEach((p) => next.delete(p))
      } else {
        removableFilteredPaths.forEach((p) => next.add(p))
      }
      return next
    })
  }

  const handleWorktreeCheckChange = (wtPath: string) => {
    if (!isWorktreeRemovable(wtPath)) return
    setCheckedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(wtPath)) {
        next.delete(wtPath)
      } else {
        next.add(wtPath)
      }
      return next
    })
  }

  const handleConfirmClick = async () => {
    if (checkedPaths.size === 0) return
    setIsDeleting(true)
    setErrors([])
    try {
      const pathsToProcess = Array.from(checkedPaths)
      const result = await onConfirm(pathsToProcess, forceRemove)

      const deleted = result.deletedWorktrees || []
      if (deleted.length > 0) {
        setRecentlyDeleted((prev) => Array.from(new Set([...prev, ...deleted])))
        setCheckedPaths((prev) => {
          const next = new Set(prev)
          deleted.forEach((p) => next.delete(p))
          return next
        })
      }

      if (result.success) {
        onClose()
      } else if (result.errors && result.errors.length > 0) {
        setErrors(result.errors)
        if (shouldSuggestForceWorktreeRemoval(result.errors)) {
          setForceRemove(true)
        }
      }
    } catch (err: any) {
      setErrors([err.message || "An unexpected error occurred during worktree removal."])
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="app-dialog-overlay" style={{ zIndex: 1400 }} onClick={() => !isDeleting && onClose()}>
      <div
        className="app-dialog-content"
        style={{
          maxWidth: "740px",
          width: "95%",
          height: "540px",
          display: "flex",
          flexDirection: "column",
          animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          padding: 0,
          borderRadius: "10px",
          overflow: "hidden",
          border: "1px solid var(--border)"
        }}
        onClick={(e) => e.stopPropagation()}
        data-testid="delete-worktrees-modal"
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--bg-secondary)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div className="app-dialog-icon error">
              <AlertTriangle size={15} style={{ color: "#f87171" }} />
            </div>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
              Remove Worktrees
            </h3>
          </div>
          <button
            onClick={() => !isDeleting && onClose()}
            disabled={isDeleting}
            style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: isDeleting ? "not-allowed" : "pointer", padding: 4 }}
            data-testid="close-delete-worktrees-btn"
            data-tooltip="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search / Filter bar */}
        <div style={{ padding: "12px 20px 8px 20px", background: "var(--bg-secondary)" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search
              size={13}
              style={{
                position: "absolute",
                left: "10px",
                color: "var(--text-secondary)",
                pointerEvents: "none"
              }}
            />
            <input
              type="text"
              placeholder="Search worktrees by path or branch..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className={`branch-filter-input ${searchText ? "filter-active" : ""}`}
              data-testid="delete-worktrees-search-input"
              style={{
                paddingLeft: "30px",
                paddingRight: searchText ? "30px" : "10px",
                width: "100%",
                boxSizing: "border-box"
              }}
            />
            {searchText && (
              <button
                onClick={() => setSearchText("")}
                className="branch-filter-clear-btn"
                data-testid="delete-worktrees-search-clear-btn"
                style={{
                  position: "absolute",
                  right: "10px",
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  padding: 2
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {removableFilteredPaths.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: "8px",
                paddingLeft: "2px",
                fontSize: "12px",
                color: "var(--text-secondary)"
              }}
            >
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  cursor: "pointer",
                  userSelect: "none"
                }}
              >
                <TriStateCheckbox
                  checked={allRemovableChecked}
                  indeterminate={someRemovableChecked}
                  onChange={handleToggleAll}
                  testId="select-all-worktrees-checkbox"
                />
                <span>
                  Select all removable ({removableFilteredPaths.length})
                </span>
              </label>
              <span>{checkedPaths.size} selected</span>
            </div>
          )}
        </div>

        {/* Worktrees List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 10px",
            background: "var(--bg-primary)",
            borderBottom: "1px solid var(--border)"
          }}
          data-testid="delete-worktrees-list"
        >
          {filteredWorktrees.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", fontSize: "13px", color: "var(--text-secondary)" }}>
              No worktrees found matching &quot;{searchText}&quot;
            </div>
          ) : (
            filteredWorktrees.map((wt) => {
              const shortName = wt.path.split(/[/\\]/).pop() || wt.path
              const isMain = isMainWorktree(wt.path)
              const isActive = isActiveWorktree(wt.path)
              const removable = isWorktreeRemovable(wt.path)
              const isChecked = checkedPaths.has(wt.path)

              return (
                <div
                  key={wt.path}
                  className={`sidebar-item ${isChecked ? "active" : ""}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 12px",
                    height: "auto",
                    cursor: removable ? "pointer" : "not-allowed",
                    opacity: removable ? 1 : 0.45,
                    background: isChecked ? "rgba(99, 102, 241, 0.1)" : "transparent",
                    borderRadius: "6px"
                  }}
                  onClick={() => removable && handleWorktreeCheckChange(wt.path)}
                  data-testid={`worktree-item-${wt.branch}`}
                  data-worktree-path={wt.path}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", marginRight: "4px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {removable ? (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleWorktreeCheckChange(wt.path)}
                        data-testid={`worktree-checkbox-${wt.branch}`}
                        data-worktree-path={wt.path}
                        style={{
                          cursor: "pointer",
                          accentColor: "var(--accent)",
                          width: "14px",
                          height: "14px",
                          marginRight: "8px",
                          flexShrink: 0
                        }}
                      />
                    ) : (
                      <div style={{ width: "22px", flexShrink: 0 }} />
                    )}
                  </div>

                  <HardDrive
                    className="sidebar-item-icon"
                    size={14}
                    style={{ flexShrink: 0, marginRight: "10px" }}
                  />

                  <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, gap: "2px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                      <span
                        title={wt.path}
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {shortName}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          color: "var(--text-secondary)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        ({wt.branch})
                      </span>
                      {!removable && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "var(--text-secondary)",
                            flexShrink: 0
                          }}
                          data-tooltip={
                            isMain
                              ? "Main repository worktree (cannot remove)"
                              : "Currently active worktree (switch away before removing)"
                          }
                        >
                          ({isMain ? "main" : "active"})
                        </span>
                      )}
                      {wt.locked && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "3px",
                            fontSize: "10px",
                            fontWeight: 600,
                            padding: "1px 6px",
                            borderRadius: "999px",
                            background: "rgba(245, 158, 11, 0.14)",
                            border: "1px solid rgba(245, 158, 11, 0.35)",
                            color: "#fbbf24",
                            flexShrink: 0
                          }}
                          title={wt.lockReason ? `Locked: ${wt.lockReason}` : "Locked worktree (requires force remove)"}
                          data-testid={`worktree-locked-badge-${wt.branch}`}
                        >
                          <Lock size={10} />
                          locked
                        </span>
                      )}
                      {wt.prunable && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            fontSize: "10px",
                            fontWeight: 600,
                            padding: "1px 6px",
                            borderRadius: "999px",
                            background: "rgba(148, 163, 184, 0.14)",
                            border: "1px solid rgba(148, 163, 184, 0.3)",
                            color: "var(--text-secondary)",
                            flexShrink: 0
                          }}
                          title={wt.prunableReason || "Worktree directory is missing on disk"}
                        >
                          missing
                        </span>
                      )}
                    </div>
                    <span
                      title={wt.path}
                      style={{
                        fontSize: "11px",
                        color: "var(--text-secondary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontFamily: "var(--font-mono, monospace)"
                      }}
                    >
                      {wt.path}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Recently removed worktrees display */}
        {recentlyDeleted.length > 0 && (
          <div
            style={{
              margin: "12px 20px 0 20px",
              padding: "10px 12px",
              borderRadius: "6px",
              background: "rgba(34, 197, 94, 0.08)",
              border: "1px solid rgba(34, 197, 94, 0.25)",
              color: "#4ade80",
              fontSize: "12px",
              maxHeight: "80px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "4px"
            }}
            data-testid="delete-worktrees-successes"
          >
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
              <CheckCircle2 size={13} />
              <span>
                Successfully removed {recentlyDeleted.length} worktree{recentlyDeleted.length > 1 ? "s" : ""}:
              </span>
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginLeft: "19px", wordBreak: "break-word" }}>
              {recentlyDeleted.map((p) => p.split(/[/\\]/).pop() || p).join(", ")}
            </div>
          </div>
        )}

        {/* Errors display */}
        {errors.length > 0 && (
          <div
            style={{
              margin: "12px 20px 0 20px",
              padding: "10px 12px",
              borderRadius: "6px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              color: "#f87171",
              fontSize: "12px",
              maxHeight: "100px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "4px"
            }}
            data-testid="delete-worktrees-errors"
          >
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
              <AlertTriangle size={13} />
              <span>
                Failed to remove {errors.length} worktree{errors.length > 1 ? "s" : ""}:
              </span>
            </div>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              {errors.map((err, idx) => (
                <li key={idx} style={{ wordBreak: "break-word" }}>
                  {err}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            background: "var(--bg-tertiary)",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px"
          }}
        >
          {/* Force remove option checkbox */}
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "var(--text-secondary)",
              cursor: "pointer",
              userSelect: "none",
              whiteSpace: "nowrap",
              flexShrink: 0
            }}
            data-testid="force-delete-worktrees-label"
            title="Uses git worktree remove --force --force to remove locked or dirty worktrees"
          >
            <input
              type="checkbox"
              checked={forceRemove}
              onChange={(e) => setForceRemove(e.target.checked)}
              data-testid="force-delete-worktrees-checkbox"
              style={{
                width: "14px",
                height: "14px",
                accentColor: "var(--accent)",
                cursor: "pointer"
              }}
            />
            <span>Force remove locked / dirty worktrees (-f -f)</span>
          </label>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
            <button
              className="btn-secondary"
              onClick={onClose}
              disabled={isDeleting}
              data-testid="cancel-delete-worktrees-btn"
              style={{ padding: "6px 14px", fontSize: "12px" }}
            >
              Cancel
            </button>
            <button
              className="app-dialog-btn danger"
              onClick={handleConfirmClick}
              disabled={checkedPaths.size === 0 || isDeleting}
              data-testid="confirm-delete-worktrees-btn"
              style={{
                padding: "6px 14px",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              {isDeleting && <Loader size={12} style={{ animation: "spin 1s linear infinite" }} />}
              {isDeleting ? "Removing..." : `Remove Selected (${checkedPaths.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
