import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import App from '../../App'
import { createAppServices } from '../../store/services'
import { renderStudentApp } from '../../test/renderApp'
import { TaskAdjustmentModal } from './TaskAdjustmentModal'

const now = new Date('2026-08-06T10:00:00.000Z')
const task = { id: 'teacher', title: 'Math P3 Ch7 Review', type: 'teacher_assigned', subject: 'Math', estimatedMinutes: 45, dueAt: '2026-08-08T12:00:00.000Z', assignedBy: 'Ms. Wang', priority: 'P1', isOverdue: false, status: 'pending', topicIds: ['calculus'] }
const secondTask = { id: 'physics-task', title: 'Physics assignment', type: 'teacher_assigned', subject: 'Physics', estimatedMinutes: 20, dueAt: null, assignedBy: 'Mr. Chen', priority: 'P2', isOverdue: false, status: 'pending', topicIds: [] }

afterEach(() => {
  vi.useRealTimers()
})

function servicesFor({
  reportTaskAdjustment = vi.fn(async (_, request) => ({ request, task: { ...task, adjustmentStatus: 'submitted' } })),
  clock = () => now,
} = {}) {
  return createAppServices({
    apiClient: {
      bootstrap: async () => ({ tasks: [task, secondTask], taskAdjustments: [], greeting: null, moduleStats: null, learningSummary: { weakTopics: ['calculus'], knowledgeHeatmap: [] }, errors: [], notes: [], noteFolders: [], settings: {} }),
      completeTask: vi.fn(), reportTaskAdjustment,
      createTask: vi.fn(), addErrors: vi.fn(), markErrorMastered: vi.fn(), submitRedo: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), submitSession: vi.fn(), updateSettings: vi.fn(),
    },
    now: clock,
    createId: () => 'adjustment-id',
  })
}

async function openAdjustment(user, title = 'Math P3') {
  const trigger = await screen.findByRole('button', { name: new RegExp(`more options for ${title}`, 'i') })
  await user.click(trigger)
  await user.click(within(trigger.parentElement).getByRole('menuitem', { name: /I can't complete this/i }))
}

async function completeDraft(user) {
  await user.selectOptions(screen.getByLabelText('Reason'), 'time_conflict')
  await user.type(screen.getByLabelText('Details'), 'Mock exam preparation')
  await user.clear(screen.getByLabelText('Available minutes'))
  await user.type(screen.getByLabelText('Available minutes'), '20')
  await user.type(screen.getByLabelText('Proposed new time'), '2026-08-08T12:00')
}

test('submits a detailed adjustment request without removing the task', async () => {
  // The app clock is 2026-08-06 even when the host clock is much later than the proposed due date.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2099-01-01T00:00:00.000Z'))
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

test('uses one business-time snapshot when the injected clock crosses the proposed due time', async () => {
  // Toast identity must not consume the business clock after the submit snapshot is captured.
  const user = userEvent.setup()
  const dueAt = new Date('2026-08-08T12:00')
  const submitNow = new Date(dueAt.getTime() - 1_000)
  const laterNow = new Date(dueAt.getTime() + 1_000)
  const clock = vi.fn()
    .mockReturnValueOnce(submitNow)
    .mockReturnValueOnce(laterNow)
  const reportTaskAdjustment = vi.fn(async (_, request) => ({
    request,
    task: { ...task, adjustmentStatus: 'submitted' },
  }))
  renderStudentApp(<App services={servicesFor({ clock, reportTaskAdjustment })} />)

  await openAdjustment(user)
  await completeDraft(user)
  await user.click(screen.getByRole('button', { name: 'Send adjustment request' }))

  await waitFor(() => expect(reportTaskAdjustment).toHaveBeenCalledTimes(1))
  const request = reportTaskAdjustment.mock.calls[0][1]
  expect(request.createdAt).toBe(submitNow.toISOString())
  expect(new Date(request.createdAt).getTime()).toBeLessThanOrEqual(new Date(request.proposedDueAt).getTime())
  expect(clock).toHaveBeenCalledTimes(1)
})

test('restores focus to the task checkbox when successful submission removes the options trigger', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App services={servicesFor()} />)

  await openAdjustment(user)
  await completeDraft(user)
  await user.click(screen.getByRole('button', { name: 'Send adjustment request' }))

  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Adjust task' })).not.toBeInTheDocument())
  expect(screen.queryByRole('button', { name: /more options for Math P3/i })).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /Mark Math P3 Ch7 Review complete/i })).toHaveFocus()
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

test('rejects a proposed time that is earlier than the injected app clock', async () => {
  const user = userEvent.setup()
  const reportTaskAdjustment = vi.fn()
  renderStudentApp(<App services={servicesFor({ reportTaskAdjustment })} />)

  await openAdjustment(user)
  await user.selectOptions(screen.getByLabelText('Reason'), 'time_conflict')
  await user.type(screen.getByLabelText('Proposed new time'), '2026-08-05T12:00')
  await user.click(screen.getByRole('button', { name: 'Send adjustment request' }))

  expect(screen.getByRole('alert')).toHaveTextContent('Choose a future time')
  expect(reportTaskAdjustment).not.toHaveBeenCalled()
})

test.each([
  ['a thrown clock error', () => { throw new Error('clock unavailable') }],
  ['null', () => null],
  ['undefined', () => undefined],
  ['a non-Date value', () => '2026-08-06T10:00:00.000Z'],
  ['an invalid Date', () => new Date(Number.NaN)],
])('fails closed when the injected app clock returns %s', async (_, clock) => {
  const user = userEvent.setup()
  const reportTaskAdjustment = vi.fn()
  renderStudentApp(<App services={servicesFor({ clock, reportTaskAdjustment })} />)

  await openAdjustment(user)
  await completeDraft(user)
  const submit = screen.getByRole('button', { name: 'Send adjustment request' })
  await user.click(submit)

  expect(screen.getByRole('alert')).toHaveTextContent('Unable to validate current time. Try again.')
  expect(submit).not.toBeDisabled()
  expect(reportTaskAdjustment).not.toHaveBeenCalled()
})

test('submits safely when a branded app Date has poisoned own methods', async () => {
  const user = userEvent.setup()
  const poisonedNow = new Date(now)
  Object.defineProperties(poisonedNow, {
    getTime: { value: () => { throw new Error('poisoned getTime') } },
    toISOString: { value: () => 'forged-created-at' },
  })
  const reportTaskAdjustment = vi.fn(async (_, request) => ({
    request,
    task: { ...task, adjustmentStatus: 'submitted' },
  }))
  renderStudentApp(<App services={servicesFor({
    clock: () => poisonedNow,
    reportTaskAdjustment,
  })} />)

  await openAdjustment(user)
  await completeDraft(user)
  await user.click(screen.getByRole('button', { name: 'Send adjustment request' }))

  await waitFor(() => expect(reportTaskAdjustment).toHaveBeenCalledTimes(1))
  expect(reportTaskAdjustment.mock.calls[0][1].createdAt).toBe('2026-08-06T10:00:00.000Z')
})

test('fails closed without an unhandled error when the app clock is a Date Proxy', async () => {
  const user = userEvent.setup()
  const reportTaskAdjustment = vi.fn()
  renderStudentApp(<App services={servicesFor({
    clock: () => new Proxy(new Date(now), {}),
    reportTaskAdjustment,
  })} />)

  await openAdjustment(user)
  await completeDraft(user)
  await user.click(screen.getByRole('button', { name: 'Send adjustment request' }))

  expect(screen.getByRole('alert')).toHaveTextContent('Unable to validate current time. Try again.')
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
  await openAdjustment(user, 'Physics assignment')

  expect(screen.getByLabelText('Reason')).toHaveValue('')
  expect(screen.getByLabelText('Details')).toHaveValue('')
  expect(screen.getByLabelText('Available minutes')).toHaveValue(60)
  expect(screen.getByLabelText('Proposed new time')).toHaveValue('')
})

test('opens as a named dialog, focuses Reason, and contains Tab navigation', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App services={servicesFor()} />)

  await openAdjustment(user)
  const dialog = screen.getByRole('dialog', { name: 'Adjust task' })
  const reason = within(dialog).getByLabelText('Reason')
  await waitFor(() => expect(reason).toHaveFocus())

  await user.tab({ shift: true })
  const close = within(dialog).getByRole('button', { name: 'close' })
  const cancel = within(dialog).getByRole('button', { name: 'Cancel' })
  expect(close).toHaveFocus()
  await user.tab({ shift: true })
  expect(cancel).toHaveFocus()
  await user.tab()
  expect(close).toHaveFocus()
})

test('Escape closes the dialog and restores focus to its options trigger', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App services={servicesFor()} />)
  const trigger = await screen.findByRole('button', { name: /more options for Math P3/i })
  await user.click(trigger)
  await user.click(screen.getByRole('menuitem', { name: /I can't complete this/i }))
  expect(screen.getByRole('dialog', { name: 'Adjust task' })).toBeInTheDocument()

  await user.keyboard('{Escape}')

  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Adjust task' })).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
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
  await user.keyboard('{Escape}')
  expect(screen.getByRole('dialog', { name: 'Adjust task' })).toBeInTheDocument()
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
