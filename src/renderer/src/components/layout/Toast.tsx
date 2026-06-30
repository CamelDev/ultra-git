import React, { useEffect, useRef } from 'react'

export interface ToastMessage {
  id: string
  text: string
}

interface ToastProps {
  messages: ToastMessage[]
  onDismiss: (id: string) => void
  /** Auto-dismiss delay in ms. Default: 2800 */
  duration?: number
}

/**
 * Bottom-centre toast notification stack.
 * Each toast auto-dismisses after `duration` ms.
 */
export const Toast: React.FC<ToastProps> = ({ messages, onDismiss, duration = 2800 }) => {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    messages.forEach(({ id }) => {
      if (!timers.current.has(id)) {
        const t = setTimeout(() => {
          onDismiss(id)
          timers.current.delete(id)
        }, duration)
        timers.current.set(id, t)
      }
    })

    // Clean up timers for dismissed toasts
    timers.current.forEach((t, id) => {
      if (!messages.find((m) => m.id === id)) {
        clearTimeout(t)
        timers.current.delete(id)
      }
    })
  }, [messages, onDismiss, duration])

  // Clear all timers on unmount
  useEffect(() => {
    return () => {
      timers.current.forEach((t) => clearTimeout(t))
    }
  }, [])

  if (messages.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        zIndex: 9999,
        pointerEvents: 'none'
      }}
      aria-live="polite"
      aria-label="Notifications"
    >
      {messages.map((msg) => (
        <div
          key={msg.id}
          style={{
            padding: '9px 18px',
            borderRadius: '8px',
            background: 'rgba(30, 35, 50, 0.96)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            color: '#e2e8f0',
            fontSize: '13px',
            fontWeight: 500,
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            animation: 'toastIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            whiteSpace: 'nowrap',
            pointerEvents: 'auto'
          }}
          data-testid="toast-notification"
        >
          {msg.text}
        </div>
      ))}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  )
}

/** Hook to manage a list of toast messages */
export function useToastManager() {
  const [messages, setMessages] = React.useState<ToastMessage[]>([])

  const addToast = React.useCallback((text: string) => {
    const id = `${Date.now()}-${Math.random()}`
    setMessages((prev) => [...prev, { id, text }])
  }, [])

  const dismiss = React.useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  return { messages, addToast, dismiss }
}
