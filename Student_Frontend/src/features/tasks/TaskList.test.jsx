import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import App from '../../App'
import { createAppServices } from '../../store/services'
import { renderStudentApp } from '../../test/renderApp'
import { TaskList } from './TaskList'

const now = new Date('2026-08-06T10:00:00.000Z')

const tasks = [
  { id: 'teacher', title: 'Math P3 Ch7 Review', type: 'teacher_assigned', subject: 'Math', estimatedMinutes: 45, dueAt: '2026-08-08T12:00:00.000Z', assignedBy: 'Ms. Wang', priority: 'P1', isOverdue: false, status: 'pending', topicIds: ['calculus'] },
  { id: 'error', title: 'Error review practice', type: 'error_review', subject: 'Math', estimatedMinutes: 20, dueAt: '2026-08-05T12:00:00.000Z', assignedBy: null, priority: 'P0', isOverdue: false, status: 'pending', topicIds: [] },
]

function servicesFor({ taskData = tasks, completeTask = vi.fn(async (id) => ({ task: { ...taskData.find((task) => task.id === id), status: 'completed', completedAt: now.toISOString(), isOverdue: false } })) } = {}) {
  return createAppServices({
    apiClient: {
      bootstrap: async () => ({ tasks: taskData, taskAdjustments: [], greeting: null, moduleStats: null, learningSummary: { weakTopics: ['calculus'], knowledgeHeatmap: [] }, errors: [], notes: [], noteFolders: [], settings: {} }),
      completeTask,
      reportTaskAdjustment: vi.fn(),
      createTask: vi.fn(), addErrors: vi.fn(), markErrorMastered: vi.fn(), submitRedo: vi.fn(), createNote: vi.fn(), updateNote: vi.fn(), submitSession: vi.fn(), updateSettings: vi.fn(),
    },
    now: () => now,
    createId: () => 'adjustment-id',
  })
}

test('completed tasks remain visible on the Completed filter', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App services={servicesFor()} />, { route: '/tasks' })

  await user.click(await screen.findByRole('checkbox', { name: /Math P3 Ch7 Review/i }))
  await user.click(screen.getByRole('button', { name: 'Completed' }))

  expect(await screen.findByText('Math P3 Ch7 Review')).toBeInTheDocument()
})

test('ranks teacher work before error review and derives overdue badges from the supplied clock', async () => {
  const user = userEvent.setup()
  renderStudentApp(<App services={servicesFor()} />, { route: '/tasks' })

  const teacher = await screen.findByText('Math P3 Ch7 Review')
  const errorReview = screen.getByText('Error review practice')

  expect(teacher.compareDocumentPosition(errorReview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByText('Error review practice').closest('div[class*="group"]')).toHaveTextContent('Overdue')

  await user.click(screen.getByRole('button', { name: /more options for Math P3 Ch7 Review/i }))
  expect(screen.getByRole('menuitem', { name: /I can't complete this/i })).toBeInTheDocument()
})

test('renders a visible submitted status for a pending task adjustment', async () => {
  const taskData = [{ ...tasks[0], adjustmentStatus: 'submitted' }, tasks[1]]
  renderStudentApp(<App services={servicesFor({ taskData })} />, { route: '/tasks' })

  expect(await screen.findByText('Adjustment submitted')).toBeVisible()
  expect(screen.getByText('Math P3 Ch7 Review')).toBeInTheDocument()
})

test('exports the shared task list component for Home and Tasks', () => {
  expect(TaskList).toEqual(expect.any(Function))
})
