import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  variant: ToastVariant
  title: string
  message?: string
  /** Auto-dismiss duration in ms. Defaults to 4000. Use Infinity to persist. */
  duration?: number
}

interface ToasterContextValue {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

const ToasterContext = createContext<ToasterContextValue | null>(null)

let toastCounter = 0

export const ToasterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${++toastCounter}`
    const newToast: Toast = { id, ...toast }
    setToasts((prev) => [...prev, newToast])

    const duration = toast.duration ?? 4000
    if (duration !== Infinity) {
      const timer = setTimeout(() => {
        removeToast(id)
      }, duration)
      timersRef.current.set(id, timer)
    }
  }, [removeToast])

  return (
    <ToasterContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
    </ToasterContext.Provider>
  )
}

/**
 * Hook to trigger toast notifications from any component wrapped by
 * `ToasterProvider`.
 *
 * @example
 * const { addToast } = useToaster()
 * addToast({ variant: 'success', title: 'Done!', message: 'Tags pushed.' })
 */
export const useToaster = (): ToasterContextValue => {
  const ctx = useContext(ToasterContext)
  if (!ctx) {
    throw new Error('useToaster must be used within a <ToasterProvider>')
  }
  return ctx
}