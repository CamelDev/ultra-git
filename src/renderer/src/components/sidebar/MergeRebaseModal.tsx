import React, { useState } from "react"
import { GitMerge, GitCommit, X, Loader, AlertTriangle } from "lucide-react"

export type MergeStrategy = "merge" | "no-ff" | "squash"
export type MergeOperation = "merge" | "rebase"

interface MergeRebaseModalProps {
  isOpen: boolean
  onClose: () => void
  sourceBranch: string
  targetBranch: string
  operation: MergeOperation
  onConfirm: (strategy: MergeStrategy) => Promise<void>
}

const STRATEGY_OPTIONS: Array<{ value: MergeStrategy; label: string; description: string }> = [
  {
    value: "merge",
    label: "Fast-forward if possible",
    description: "Creates a merge commit only when needed. History stays linear when possible."
  },
  {
    value: "no-ff",
    label: "Always create merge commit",
    description: "Always records a merge commit — makes branch history explicit in the graph."
  },
  {
    value: "squash",
    label: "Squash commits",
    description: "Combines all commits from source into a single staged change. Requires a commit."
  }
]

export const MergeRebaseModal: React.FC<MergeRebaseModalProps> = ({
  isOpen,
  onClose,
  sourceBranch,
  targetBranch,
  operation,
  onConfirm
}) => {
  const [strategy, setStrategy] = useState<MergeStrategy>("merge")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  if (!isOpen) return null

  const isMerge = operation === "merge"

  const handleConfirm = async () => {
    setIsLoading(true)
    setError("")
    try {
      await onConfirm(strategy)
    } catch (err: any) {
      setError(err.message || "Operation failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="diff-modal-overlay" style={{ zIndex: 1200 }} onClick={onClose}>
      <div
        className="diff-modal-content"
        style={{
          maxWidth: "480px",
          width: "90%",
          height: "auto",
          display: "flex",
          flexDirection: "column",
          animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          padding: 0,
          borderRadius: "10px",
          overflow: "hidden",
          border: "1px solid var(--border)"
        }}
        onClick={e => e.stopPropagation()}
      >
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
            {isMerge
              ? <GitMerge size={16} style={{ color: "#a78bfa" }} />
              : <GitCommit size={16} style={{ color: "#34d399" }} />
            }
            <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
              {isMerge ? "Merge Branch" : "Rebase Branch"}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}
            data-testid="close-merge-modal-btn"
            data-tooltip="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "14px 20px 0", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{
            background: "rgba(167, 139, 250, 0.15)",
            border: "1px solid rgba(167, 139, 250, 0.3)",
            borderRadius: "4px",
            padding: "3px 8px",
            fontSize: "12px",
            fontWeight: 600,
            color: "#a78bfa",
            fontFamily: "monospace"
          }}>
            {sourceBranch}
          </span>
          <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>
            {isMerge ? "merge into" : "rebase onto"}
          </span>
          <span style={{
            background: "rgba(52, 211, 153, 0.15)",
            border: "1px solid rgba(52, 211, 153, 0.3)",
            borderRadius: "4px",
            padding: "3px 8px",
            fontSize: "12px",
            fontWeight: 600,
            color: "#34d399",
            fontFamily: "monospace"
          }}>
            {targetBranch}
          </span>
        </div>

        {isMerge && (
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>
              Merge Strategy
            </div>
            {STRATEGY_OPTIONS.map(opt => (
              <label
                key={opt.value}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: `1px solid ${strategy === opt.value ? "rgba(167, 139, 250, 0.4)" : "var(--border)"}`,
                  background: strategy === opt.value ? "rgba(167, 139, 250, 0.06)" : "transparent",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
                data-testid={`strategy-option-${opt.value}`}
              >
                <input
                  type="radio"
                  name="merge-strategy"
                  value={opt.value}
                  checked={strategy === opt.value}
                  onChange={() => setStrategy(opt.value)}
                  style={{ marginTop: "2px", accentColor: "#a78bfa", flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "2px" }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    {opt.description}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        {!isMerge && (
          <div style={{ padding: "16px 20px" }}>
            <div style={{
              padding: "10px 12px",
              borderRadius: "6px",
              border: "1px solid rgba(52, 211, 153, 0.3)",
              background: "rgba(52, 211, 153, 0.06)",
              fontSize: "12px",
              color: "var(--text-secondary)",
              lineHeight: 1.6
            }}>
              Replays commits from <strong style={{ color: "#a78bfa" }}>{targetBranch}</strong> on top of <strong style={{ color: "#34d399" }}>{sourceBranch}</strong>.
              This rewrites commit history — use with caution on shared branches.
            </div>
          </div>
        )}

        {error && (
          <div style={{
            margin: "0 20px 12px",
            padding: "8px 12px",
            borderRadius: "6px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#f87171",
            fontSize: "12px",
            display: "flex",
            alignItems: "flex-start",
            gap: "8px"
          }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "flex-end",
          gap: "8px",
          background: "var(--bg-secondary)"
        }}>
          <button className="btn-secondary" onClick={onClose} disabled={isLoading} data-testid="cancel-merge-btn" data-tooltip="Cancel and close modal">
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleConfirm}
            disabled={isLoading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: isMerge ? "rgba(167, 139, 250, 0.85)" : "rgba(52, 211, 153, 0.85)",
              borderColor: isMerge ? "#a78bfa" : "#34d399"
            }}
            data-testid="confirm-merge-btn"
            data-tooltip={isMerge ? `Merge ${sourceBranch} into ${targetBranch}` : `Rebase ${targetBranch} onto ${sourceBranch}`}
          >
            {isLoading && <Loader size={12} style={{ animation: "spin 1s linear infinite" }} />}
            {isMerge
              ? (isLoading ? "Merging\u2026" : `Merge ${sourceBranch}`)
              : (isLoading ? "Rebasing\u2026" : "Start Rebase")
            }
          </button>
        </div>
      </div>
    </div>
  )
}
