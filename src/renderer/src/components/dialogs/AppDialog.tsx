import React, { useEffect, useState } from 'react'
import { X, Info, CheckCircle2, AlertTriangle, AlertCircle, Upload } from 'lucide-react'
import './Dialogs.css'

export type AppDialogVariant = 'info' | 'success' | 'warning' | 'error'

export interface AppDialogAction {
  /** Label of the action button. */
  label: string
  /** Visual style of the action button. */
  variant?: 'primary' | 'secondary' | 'danger'
  /** Optional icon to display in the action button. */
  icon?: React.ReactNode
  /**
   * If true, clicking this button sets the dialog to a "loading" state and
   * disables the buttons. The parent must call `onClose` when the action
   * completes (e.g. after an async API call resolves).
   */
  setsBusy?: boolean
  /** Value returned via the `onResolve` callback to identify the chosen action. */
  value: string
}

export interface AppDialogProps {
  /** Controls the dialog's visibility. */
  isOpen: boolean
  /** Title shown in the dialog header. */
  title: string
  /** Body content. Can be a string (rendered as <p>) or a custom React node. */
  message: React.ReactNode
  /**
   * Visual variant of the dialog. Controls the leading icon and accent
   * colour of the header.
   */
  variant?: AppDialogVariant
  /** Action buttons shown in the footer. Order matches the rendered order. */
  actions?: AppDialogAction[]
  /**
   * Called with the `value` of the clicked action. If undefined or omitted,
   * the dialog is closed automatically when an action is clicked.
   */
  onResolve?: (value: string) => void
  /**
   * Called when the dialog is dismissed without choosing an action (overlay
   * click, close button, Escape key). When omitted, the dialog is treated
   * as non-dismissible and only actions can close it.
   */
  onCancel?: () => void
  /**
   * If provided, renders a checkbox in the footer. The current checked state
   * is returned alongside the action value via `onResolve`.
   */
  checkbox?: {
    label: string
    initialChecked?: boolean
  }
  /** Optional override for the leading icon. */
  icon?: React.ReactNode
  /** Optional data-testid prefix for testing. */
  testId?: string
}

/**
 * AppDialog
 * ----------
 * A consistent in-app dialog used everywhere a confirmation or notification
 * is needed. Replaces native OS `alert` / `confirm` dialogs (called via
 * `window.api.app.showMessageBox`) so the user experience matches the rest
 * of the application.
 */
export const AppDialog: React.FC<AppDialogProps> = ({
  isOpen,
  title,
  message,
  variant = 'info',
  actions,
  onResolve,
  onCancel,
  checkbox,
  icon,
  testId
}) => {
  const [busyValue, setBusyValue] = useState<string | null>(null)
  const [checkboxChecked, setCheckboxChecked] = useState<boolean>(checkbox?.initialChecked ?? false)

  // Reset internal state whenever the dialog re-opens so the checkbox always
  // starts at its initial value.
  useEffect(() => {
    if (isOpen) {
      setBusyValue(null)
      setCheckboxChecked(checkbox?.initialChecked ?? false)
    }
  }, [isOpen, checkbox?.initialChecked])

  // Allow Escape to dismiss the dialog.
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (onCancel) onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const handleOverlayClick = () => {
    if (onCancel) onCancel()
  }

  const handleActionClick = (action: AppDialogAction) => {
    if (action.setsBusy) setBusyValue(action.value)
    if (onResolve) onResolve(action.value)
  }

  const defaultIcon = (() => {
    switch (variant) {
      case 'success':
        return <CheckCircle2 size={16} />
      case 'warning':
        return <AlertTriangle size={16} />
      case 'error':
        return <AlertCircle size={16} />
      case 'info':
      default:
        return <Info size={16} />
    }
  })()

  const renderMessage = () => {
    if (typeof message === 'string' || typeof message === 'number') {
      return <p>{message}</p>
    }
    return message
  }

  return (
    <div
      className="app-dialog-overlay"
      onClick={handleOverlayClick}
      data-testid={testId ? `${testId}-overlay` : 'app-dialog-overlay'}
    >
      <div
        className="app-dialog-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId ?? 'app-dialog'}
        data-variant={variant}
      >
        <div className="app-dialog-header">
          <div className={`app-dialog-icon ${variant}`}>{icon ?? defaultIcon}</div>
          <h3 className="app-dialog-title">{title}</h3>
          {onCancel && (
            <button
              className="app-dialog-close"
              onClick={onCancel}
              aria-label="Close dialog"
              data-testid={testId ? `${testId}-close` : 'app-dialog-close'}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="app-dialog-body" data-testid={testId ? `${testId}-body` : 'app-dialog-body'}>
          {renderMessage()}
        </div>

        <div className="app-dialog-footer" data-testid={testId ? `${testId}-footer` : 'app-dialog-footer'}>
          {checkbox && (
            <label
              className="app-dialog-checkbox"
              data-testid={testId ? `${testId}-checkbox` : 'app-dialog-checkbox'}
            >
              <input
                type="checkbox"
                checked={checkboxChecked}
                onChange={(e) => setCheckboxChecked(e.target.checked)}
                data-testid={testId ? `${testId}-checkbox-input` : 'app-dialog-checkbox-input'}
              />
              <span>{checkbox.label}</span>
            </label>
          )}
          {actions && actions.length > 0 ? (
            actions.map((action, idx) => {
              const isBusy = busyValue === action.value
              const isDisabled = busyValue !== null && !isBusy
              return (
                <button
                  key={`${action.value}-${idx}`}
                  className={`app-dialog-btn ${action.variant ?? 'secondary'}`}
                  onClick={() => handleActionClick(action)}
                  disabled={isDisabled || isBusy}
                  data-testid={
                    testId
                      ? `${testId}-action-${action.value}`
                      : `app-dialog-action-${action.value}`
                  }
                  data-action-value={action.value}
                  data-checkbox-checked={checkbox ? String(checkboxChecked) : undefined}
                >
                  {action.icon}
                  {isBusy ? `${action.label}…` : action.label}
                </button>
              )
            })
          ) : (
            <button
              className="app-dialog-btn primary"
              onClick={() => onCancel && onCancel()}
              data-testid={testId ? `${testId}-ok` : 'app-dialog-ok'}
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Re-export the lucide `Upload` icon for callers that want to display a tag
 * icon in the action button of a tag-related dialog.
 */
export { Upload as AppDialogUploadIcon }
