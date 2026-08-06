import { useRef, useState } from 'react'
import { Modal } from '../../components/ui'
import { useApp } from '../../store/AppStore'
import { ADJUSTMENT_REASONS, validateAdjustmentDraft } from './adjustmentRules'

const reasonLabels = {
  time_conflict: 'Time conflict',
  difficulty: 'Difficulty',
  health: 'Health',
  other: 'Other',
}

const initialDraft = {
  reason: '',
  details: '',
  availableMinutes: '60',
  proposedDueAt: '',
}

export function TaskAdjustmentModal({ task, open, onClose, returnFocusTarget, fallbackFocusTarget }) {
  const { requestTaskAdjustment, isActionPending } = useApp()
  const reasonRef = useRef(null)
  const [draft, setDraft] = useState(initialDraft)
  const [errors, setErrors] = useState({})
  const pending = task ? isActionPending(`task:adjust:${task.id}`) : false

  const update = (field) => (event) => {
    setDraft((current) => ({ ...current, [field]: event.target.value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const reset = () => {
    setDraft(initialDraft)
    setErrors({})
  }

  const close = () => {
    if (!pending) {
      reset()
      onClose()
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (!task || pending) return

    const validation = validateAdjustmentDraft(draft)
    setErrors(validation.errors)
    if (!validation.valid) return

    try {
      await requestTaskAdjustment(task, draft)
      reset()
      onClose()
    } catch {
      // AppStore rolls back and displays the recoverable write failure.
    }
  }

  return (
    <Modal open={open} onClose={close} title="Adjust task" initialFocusRef={reasonRef} returnFocusTarget={returnFocusTarget} fallbackFocusTarget={fallbackFocusTarget}>
      <form onSubmit={submit}>
        <p className="text-sm text-warm-stone mb-4">Tell your teacher what needs to change for “{task?.title}”.</p>

        <label className="block text-sm font-medium mb-1.5" htmlFor="task-adjustment-reason">Reason</label>
        <select ref={reasonRef} id="task-adjustment-reason" className="zb-input mb-1" value={draft.reason} onChange={update('reason')} disabled={pending}>
          <option value="">Choose a reason</option>
          {ADJUSTMENT_REASONS.map((reason) => <option key={reason} value={reason}>{reasonLabels[reason]}</option>)}
        </select>
        {errors.reason && <p className="text-xs text-error-red mb-3" role="alert">{errors.reason}</p>}

        <label className="block text-sm font-medium mb-1.5" htmlFor="task-adjustment-details">Details</label>
        <textarea id="task-adjustment-details" className="zb-input h-24 py-2 resize-y mb-3" value={draft.details} onChange={update('details')} disabled={pending} />

        <label className="block text-sm font-medium mb-1.5" htmlFor="task-adjustment-minutes">Available minutes</label>
        <input id="task-adjustment-minutes" className="zb-input mb-3" type="number" min="0" max="720" value={draft.availableMinutes} onChange={update('availableMinutes')} disabled={pending} />

        <label className="block text-sm font-medium mb-1.5" htmlFor="task-adjustment-due-at">Proposed new time</label>
        <input id="task-adjustment-due-at" className="zb-input mb-1" type="datetime-local" value={draft.proposedDueAt} onChange={update('proposedDueAt')} disabled={pending} />
        {errors.proposedDueAt && <p className="text-xs text-error-red mb-3" role="alert">{errors.proposedDueAt}</p>}

        <div className="flex gap-2 mt-5">
          <button type="submit" className="zb-btn-primary flex-1" disabled={pending}>Send adjustment request</button>
          <button type="button" className="zb-btn-ghost flex-1" onClick={close} disabled={pending}>Cancel</button>
        </div>
      </form>
    </Modal>
  )
}
