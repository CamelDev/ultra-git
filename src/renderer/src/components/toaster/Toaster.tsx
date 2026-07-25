import React, { useState, useCallback } from 'react'
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react'
import { useToaster, Toast, ToastVariant } from './ToasterContext'
import './Toaster.css'

const variantIcon: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 size={14} />,
  error: <AlertCircle size={14} />,
  warning: <AlertTriangle size={14} />,
  info: <Info size={14} />,
}

interface ToastItemProps {
  toast: Toast
  onRemove: (id: string) => void
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
  const [exiting, setExiting] = useState(false)
  const duration = toast.duration ?? 4000

  const handleClose = useCallback(() => {
    setExiting(true)
    // Allow the exit animation to finish before unmounting
    setTimeout(() => onRemove(toast.id), 250)
  }, [onRemove, toast.id])

  return (
    <div
      className={`toast${exiting ? ' toast-exiting' : ''}`}
      data-variant={toast.variant}
      data-testid="toast"
    >
      <div className={`toast-icon ${toast.variant}`}>
        {variantIcon[toast.variant]}
      </div>
      <div className="toast-content">
        <p className="toast-title">{toast.title}</p>
        {toast.message && <p className="toast-message">{toast.message}</p>}
      </div>
      <button
        className="toast-close"
        onClick={handleClose}
        aria-label="Dismiss notification"
        data-testid="toast-close"
      >
        <X size={14} />
      </button>
      {duration !== Infinity && (
        <div
          className={`toast-progress ${toast.variant}`}
          style={{ animationDuration: `${duration}ms` }}
        />
      )}
    </div>
  )
}

/**
 * Toaster – renders the active toast stack in the bottom-right corner.
 * Place this once inside the component tree (e.g. in App) alongside the
 * `ToasterProvider`.
 */
export const Toaster: React.FC = () => {
  const { toasts, removeToast } = useToaster()

  if (toasts.length === 0) return null

  return (
    <div className="toaster-container" data-testid="toaster-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}