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

test('settles a deferred success without committing after its owner becomes inactive', async () => {
  // Catches a late successful request mutating provider state after unmount.
  const calls = []
  let active = true
  let resolveRequest
  const operation = runRecoverableAction({
    snapshot: [],
    optimistic: () => calls.push('optimistic'),
    request: () => new Promise((resolve) => { resolveRequest = resolve }),
    commit: () => calls.push('commit'),
    rollback: () => calls.push('rollback'),
    onError: () => calls.push('error'),
    isActive: () => active,
  })

  active = false
  resolveRequest({ id: 'task-1' })

  await expect(operation).resolves.toEqual({ id: 'task-1' })
  expect(calls).toEqual(['optimistic'])
})

test('settles a deferred rejection without rollback or error callbacks after its owner becomes inactive', async () => {
  // Catches late rollback/toast callbacks after provider unmount while preserving Promise rejection.
  const calls = []
  let active = true
  let rejectRequest
  const operation = runRecoverableAction({
    snapshot: ['before'],
    optimistic: () => calls.push('optimistic'),
    request: () => new Promise((_, reject) => { rejectRequest = reject }),
    commit: () => calls.push('commit'),
    rollback: () => calls.push('rollback'),
    onError: () => calls.push('error'),
    isActive: () => active,
  })

  active = false
  rejectRequest(new Error('offline'))

  await expect(operation).rejects.toThrow('offline')
  expect(calls).toEqual(['optimistic'])
})
