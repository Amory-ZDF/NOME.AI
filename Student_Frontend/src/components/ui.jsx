import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useId, useRef } from 'react'

// Material Symbol icon
export function Icon({ name, size = 20, className = '', filled = false }) {
  return (
    <span
      className={`mso ${className}`}
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24` }}
    >
      {name}
    </span>
  )
}

// Badge
const badgeStyles = {
  teal: 'bg-teal-tint text-deep-teal',
  amber: 'bg-alert-amber/10 text-alert-amber',
  green: 'bg-success-green/10 text-success-green',
  red: 'bg-error-red/10 text-error-red',
  stone: 'bg-warm-stone/10 text-warm-stone',
  sky: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
}
export function Badge({ tone = 'stone', children, className = '' }) {
  return <span className={`zb-badge ${badgeStyles[tone]} ${className}`}>{children}</span>
}

// Priority badge (PRD: P0=Amber / P1=Teal / P2=Stone)
export function PriorityBadge({ priority }) {
  const map = { P0: ['amber', 'P0 High'], P1: ['teal', 'P1 Med'], P2: ['stone', 'P2 Low'] }
  const [tone, label] = map[priority] || ['stone', priority]
  return <Badge tone={tone}>{label}</Badge>
}

// Progress bar 6px
export function ProgressBar({ value, color = 'bg-deep-teal', className = '' }) {
  return (
    <div className={`h-1.5 w-full rounded-full bg-warm-stone/15 overflow-hidden ${className}`}>
      <motion.div
        className={`h-full rounded-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ type: 'spring', stiffness: 100, damping: 20 }}
      />
    </div>
  )
}

// Difficulty stars
export function Stars({ level, max = 5 }) {
  return (
    <span className="text-alert-amber text-sm tracking-tight" title={`Difficulty ${level}/${max}`}>
      {'★'.repeat(level)}<span className="text-warm-stone/30">{'★'.repeat(max - level)}</span>
    </span>
  )
}

// Empty state
export function EmptyState({ icon = 'task_alt', title, desc, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon name={icon} size={40} className="text-warm-stone/70 mb-3" />
      <p className="font-semibold text-deep-ink mb-1">{title}</p>
      {desc && <p className="text-sm text-warm-stone mb-4 max-w-sm">{desc}</p>}
      {action}
    </div>
  )
}

// Toggle switch
export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 cursor-pointer select-none"
    >
      <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-deep-teal' : 'bg-warm-stone/30'}`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
      </span>
      {label && <span className="text-sm text-deep-ink">{label}</span>}
    </button>
  )
}

// Modal
export function Modal({ open, onClose, title, children, width = 'max-w-lg', initialFocusRef, returnFocusTarget }) {
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined

    const restoreTarget = returnFocusTarget || document.activeElement
    const dialog = dialogRef.current
    const focusableSelector = 'button:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    const focusable = () => Array.from(dialog?.querySelectorAll(focusableSelector) ?? [])
    const first = initialFocusRef?.current || focusable()[0] || dialog
    first?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const elements = focusable()
      if (elements.length === 0) {
        event.preventDefault()
        dialog?.focus()
        return
      }
      const firstElement = elements[0]
      const lastElement = elements.at(-1)
      const activeElement = document.activeElement
      if (event.shiftKey && (activeElement === firstElement || !dialog?.contains(activeElement))) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && (activeElement === lastElement || !dialog?.contains(activeElement))) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (restoreTarget?.isConnected) restoreTarget.focus()
    }
  }, [initialFocusRef, open, returnFocusTarget])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-deep-ink/30 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`relative bg-pure-surface rounded-card border border-whisper-line w-full ${width} p-6 max-h-[85vh] overflow-y-auto`}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id={titleId} className="zb-section-title">{title}</h3>
              <button type="button" aria-label="close" onClick={onClose} className="text-warm-stone hover:text-deep-ink"><Icon name="close" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Toast
export function Toast({ toast }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.key}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60]"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
        >
          <div className={`flex items-center gap-2 rounded-comp px-4 py-2.5 text-sm text-white shadow-lg ${
            toast.type === 'success' ? 'bg-success-green' : toast.type === 'error' ? 'bg-error-red' : 'bg-deep-ink'
          }`}>
            <Icon name={toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'error' : 'info'} size={18} />
            {toast.message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Card staggered entrance container
export const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}
export const fadeUpItem = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 20 } },
}

// Rich-text content renderer (mock data structure)
export function MathHTML({ html, className = '' }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
