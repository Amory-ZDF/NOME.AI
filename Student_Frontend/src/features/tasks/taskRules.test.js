import { describe, expect, test } from 'vitest'
import { filterTasks, getNextTask, rankTasks } from './taskRules'

const now = new Date('2026-08-06T10:00:00Z')
const tasks = [
  { id: 'ai', type: 'ai_recommended', priority: 'P0', dueAt: '2026-08-06T11:00:00Z', estimatedMinutes: 10, status: 'pending', subject: 'Math' },
  { id: 'teacher', type: 'teacher_assigned', priority: 'P2', dueAt: '2026-08-07T12:00:00Z', estimatedMinutes: 30, status: 'pending', subject: 'Physics' },
  { id: 'done', type: 'teacher_assigned', priority: 'P0', dueAt: '2026-08-05T12:00:00Z', estimatedMinutes: 20, status: 'completed', subject: 'Math' },
]

describe('task rules', () => {
  test('teacher work stays ahead of AI recommendations', () => {
    expect(rankTasks(tasks, { now, availableMinutes: 60, weakTopics: [] }).map((task) => task.id)).toEqual(['teacher', 'ai', 'done'])
  })

  test('overdue is derived from dueAt instead of stale isOverdue data', () => {
    expect(filterTasks(tasks, 'overdue', now).map((task) => task.id)).toEqual([])
  })

  test('filters each status view without discarding completed tasks', () => {
    const overdue = { id: 'late', status: 'pending', dueAt: '2026-08-06T09:00:00Z' }
    const allTasks = [...tasks, overdue]

    expect(filterTasks(allTasks, 'all', now).map((task) => task.id)).toEqual(['ai', 'teacher', 'done', 'late'])
    expect(filterTasks(allTasks, 'pending', now).map((task) => task.id)).toEqual(['ai', 'teacher', 'late'])
    expect(filterTasks(allTasks, 'overdue', now).map((task) => task.id)).toEqual(['late'])
    expect(filterTasks(allTasks, 'completed', now).map((task) => task.id)).toEqual(['done'])
  })

  test('ranks task sources ahead of due dates, priority, and weak-topic boosts', () => {
    const candidates = [
      { id: 'ai-overdue', type: 'ai_recommended', priority: 'P0', dueAt: '2026-08-06T09:00:00Z', estimatedMinutes: 10, status: 'pending', topicIds: ['weak'] },
      { id: 'error', type: 'error_review', priority: 'P2', dueAt: '2026-08-07T12:00:00Z', estimatedMinutes: 45, status: 'pending', topicIds: [] },
      { id: 'teacher', type: 'teacher_assigned', priority: 'P2', dueAt: '2026-08-08T12:00:00Z', estimatedMinutes: 45, status: 'pending', topicIds: [] },
    ]

    expect(rankTasks(candidates, { now, availableMinutes: 30, weakTopics: ['weak'] }).map((task) => task.id)).toEqual(['teacher', 'error', 'ai-overdue'])
  })

  test('uses task id to keep tied rankings deterministic', () => {
    const tied = [
      { id: 'zeta', type: 'teacher_assigned', priority: 'P1', estimatedMinutes: 20, status: 'pending' },
      { id: 'alpha', type: 'teacher_assigned', priority: 'P1', estimatedMinutes: 20, status: 'pending' },
    ]

    expect(rankTasks(tied, { now }).map((task) => task.id)).toEqual(['alpha', 'zeta'])
  })

  test('returns the highest ranked pending task or null', () => {
    expect(getNextTask(tasks, { now, availableMinutes: 60, weakTopics: [] })?.id).toBe('teacher')
    expect(getNextTask([tasks[2]], { now })).toBeNull()
  })
})
