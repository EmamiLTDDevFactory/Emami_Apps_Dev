import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext(null)

let idCounter = 1

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const showToast = useCallback((message, variant = 'success') => {
    const id = idCounter++
    setToasts((prev) => [...prev, { id, message, variant }])
    timers.current[id] = setTimeout(() => dismiss(id), 4000)
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm" aria-live="polite" role="status">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }) {
  const variantStyles = {
    success: 'bg-white border-l-4 border-green-500 text-slate-800',
    error: 'bg-white border-l-4 border-red-500 text-slate-800',
    info: 'bg-white border-l-4 border-indigo-500 text-slate-800',
  }
  return (
    <div className={`flex items-start justify-between gap-3 rounded-lg shadow-lg px-4 py-3 text-sm ${variantStyles[toast.variant] || variantStyles.info}`}>
      <span>{toast.message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded"
      >
        ✕
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
