import { expect, test } from 'vitest'
import { createAppServices } from './services'

test('keeps injected API, clock, and id services available to store consumers', () => {
  // Catches a service factory mutation that replaces deterministic test dependencies with globals.
  const apiClient = { bootstrap: () => Promise.resolve({}) }
  const now = () => new Date('2026-08-06T00:00:00.000Z')
  const createId = () => 'note-1'

  const services = createAppServices({ apiClient, now, createId })

  expect(services.api).toBe(apiClient)
  expect(services.now().toISOString()).toBe('2026-08-06T00:00:00.000Z')
  expect(services.createId()).toBe('note-1')
})
