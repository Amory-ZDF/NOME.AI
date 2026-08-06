import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import App from '../../App'
import { createAppServices } from '../../store/services'
import { renderStudentApp } from '../../test/renderApp'
import { TaskAdjustmentModal } from './TaskAdjustmentModal'

const now = new Date('2026-08-06T10:00:00.000Z')
const task = { id: 'teacher', title: 'Math P3 Ch7 Review', type: 'teacher_assigned', subject: 'Math', estimatedMinutes: 45, dueAt: '2026-08-08T12:00:00.000Z', assignedBy: 'Ms. Wang', priority: 'P1', isOverdue: false, status: 'pending', topicIds: ['calculus'] }
const secondTask = { id: 'error-review', title: 'Error review practice', type: 'error_review', subject: 'Math', estimatedMinutes: 20, dueAt: null, assignedBy: null, priority: 'P2', isOverdue: false, status: 'pending', topicIds: [] }

function servicesFor({ reportTaskAdjustment = vi.fn(async (_, request) => ({ request, task: { ...task, adjustmentStatus: 'submitted' } })) } = {}) {
  return createAppServices({
    apiClient: {
      bootstrap: async () => ({ tasks: [task, secondTask], taskAdjustments: [], greeting: null, moduleStats: null, learningSummary: { weakTopics: ['calculus'], knowledgeHeatmap: [] }, errors: [], notes: [], noteFolders: [], settings: {} }),
      completeTask: vi.fn(), reportTaskAdjustment,
      createTask: vi.fn(), addErrors: vi.fn(), markErrorMastered: vi.fn(), submitRedo: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), submitSession: vi.fn(), updateSettings: vi.fn(),
    },
    now: () => now,
    createId: () => 'adjustment-id',
  })
}

async function openAdjustment(user, title = 'Math P3') {
  await user.click(await screen.findByRole('button', { name: new RegExp(`more options for ${title}`, 'i') }))
  await user.click(screen.getByRole('menuitem', { name: /I can't complete this/i }))
}

async function completeDraft(user) {
  await user.selectOptions(screen.getByLabelText('Reason'), 'time_conflict')
  await user.type(screen.getByLabelText('Details'), 'Mock exam preparation')
  await user.clear(screen.getByLabelText('Available minutes'))
  await user.type(screen.getByLabelText('Available minutes'), '20')
  await user.type(screen.getByLabelText('Proposed new time'), '2026-08-08T12:00')
}

test('submits a detailed adjustment request without removing the task', async () => {
  const user = userEvent.setup()
  const reportTaskAdjustment = vi.fn(async (_, request) => ({ request, task: { ...task, adjustmentStatus: 'submitted' } }))
  renderStudentApp(<App services={servicesFor({ reportTaskAdjustment })} />)

  await openAdjustment(user)
  await completeDraft(user)
  await user.click(screen.getByRole('button', { name: 'Send adjustment request' }))

  expect(await screen.findByText(/Adjustment request sent to your teacher/i)).toBeInTheDocument()
  expect(screen.getByText('Math P3 Ch7 Review')).toBeInTheDocument()
  expect(screen.getByText('Adjustment submitted')).toBeVisible()
  expect(reportTaskAdjustment).toHaveBeenCalledWith('teacher', {
    id: 'adjustment-id', taskId: 'teacher', reason: 'time_conflict', details: 'Mock exam preparation', availableMinutes: 20,
    proposedDueAt: new Date('2026-08-08T12:00').toISOString(), createdAt: '2026-08-06T10:00:00.000Z', status: 'submitted',
  })
})

test('shows field validation errors without sending an invalid adjustment request', async () => {
  const user = userEvent.setup()
  const reportTaskAdjustment = vi.fn()
  renderStudentApp(<App services={servicesFor({ reportTaskAdjustment })} />)

  await openAdjustment(user)
  await user.click(screen.getByRole('button', { name: 'Send adjustment request' }))

  expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual(['Choose a reason', 'Choose a future time'])
  expect(reportTaskAdjustment).not.toHaveBeenCalled()
})

test('resets a dismissed invalid draft before reopening the same task', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App services={servicesFor()} />)

  await openAdjustment(user)
  await user.type(screen.getByLabelText('Details'), 'Stale explanation')
  await user.click(screen.getByRole('button', { name: 'Send adjustment request' }))
  expect(screen.getAllByRole('alert')).toHaveLength(2)

  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await openAdjustment(user)

  expect(screen.getByLabelText('Details')).toHaveValue('')
  expect(screen.queryAllByRole('alert')).toHaveLength(0)
})

test('resets a close-icon dismissal before opening another task adjustment', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App services={servicesFor()} />)

  await openAdjustment(user)
  await completeDraft(user)
  await user.click(screen.getByRole('button', { name: 'close' }))
  await openAdjustment(user, 'Error review practice')

  expect(screen.getByLabelText('Reason')).toHaveValue('')
  expect(screen.getByLabelText('Details')).toHaveValue('')
  expect(screen.getByLabelText('Available minutes')).toHaveValue(60)
  expect(screen.getByLabelText('Proposed new time')).toHaveValue('')
})

test('disables duplicate adjustment submission while the request is pending', async () => {
  const user = userEvent.setup()
  let resolveRequest
  const reportTaskAdjustment = vi.fn(() => new Promise((resolve) => { resolveRequest = resolve }))
  renderStudentApp(<App services={servicesFor({ reportTaskAdjustment })} />)

  await openAdjustment(user)
  await completeDraft(user)
  const submit = screen.getByRole('button', { name: 'Send adjustment request' })
  await user.click(submit)

  expect(submit).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  expect(reportTaskAdjustment).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button', { name: 'close' }))
  expect(screen.getByLabelText('Details')).toHaveValue('Mock exam preparation')
  resolveRequest({ request: { id: 'adjustment-id' }, task: { ...task, adjustmentStatus: 'submitted' } })
  expect(await screen.findByText(/Adjustment request sent to your teacher/i)).toBeInTheDocument()
})

test('keeps the modal open and preserves the task when the adjustment write fails', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App services={servicesFor({ reportTaskAdjustment: vi.fn(async () => { throw new Error('offline') }) })} />)

  await openAdjustment(user)
  await completeDraft(user)
  await user.click(screen.getByRole('button', { name: 'Send adjustment request' }))

  expect(await screen.findByText('offline')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /adjust task/i })).toBeInTheDocument()
  expect(screen.getByText('Math P3 Ch7 Review')).toBeInTheDocument()
})

test('exports the shared adjustment modal component', () => {
  expect(TaskAdjustmentModal).toEqual(expect.any(Function))
})
