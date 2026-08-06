import { expect, test } from 'vitest'
import { runRecoverableAction } from './actionRunner'

test('rolls back optimistic state and reports a typed failure', async () => {
  // Catches a write failure that leaves optimistic UI state committed or hides its error.
  const calls = []

  await expect(runRecoverableAction({
    snapshot: ['before'],
    optimistic: () => calls.push('optimistic'),
    request: () => Promise.reject(new Error('offline')),
    commit: () => calls.push('commit'),
    rollback: (snapshot) => calls.push(snapshot[0]),
    onError: (error) => calls.push(error.message),
  })).rejects.toThrow('offline')

  expect(calls).toEqual(['optimistic', 'before', 'offline'])
})

test('commits the request result after optimistic state succeeds', async () => {
  // Catches a successful write that never commits the server-confirmed result.
  const committed = []
  const result = await runRecoverableAction({
    snapshot: [],
    optimistic: () => {},
    request: () => Promise.resolve({ id: 'task-1' }),
    commit: (value) => committed.push(value.id),
    rollback: () => {},
    onError: () => {},
  })

  expect(result).toEqual({ id: 'task-1' })
  expect(committed).toEqual(['task-1'])
})
