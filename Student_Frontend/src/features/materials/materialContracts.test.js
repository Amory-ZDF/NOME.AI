import { expect, test } from 'vitest'
import { MATERIAL_FIXTURES } from '../../data/materialFixtures'
import { sanitizeUploadJob, sanitizeUploadJobs } from './materialContracts'

const validJob = (overrides = {}) => ({
  id: 'job-1',
  fileName: 'notes.jpg',
  mimeType: 'image/jpeg',
  size: 1000,
  materialType: 'handwritten_draft',
  createdAt: '2026-08-06T00:00:00.000Z',
  updatedAt: '2026-08-06T00:00:00.000Z',
  progress: 0,
  status: 'queued',
  ...overrides,
})

const classifiedJob = (overrides = {}) => validJob({
  status: 'needs_confirmation',
  progress: 100,
  result: structuredClone(MATERIAL_FIXTURES.alevel_handwritten_calculus_note),
  ...overrides,
})

test('clones a contract-exact upload job and validates the expected identity', () => {
  const source = classifiedJob()
  const clone = sanitizeUploadJob(source, { expectedId: 'job-1' })

  expect(clone).toEqual(source)
  expect(clone).not.toBe(source)
  expect(clone.result).not.toBe(source.result)
})

test.each([
  ['unknown top-level field', () => validJob({ rawBytes: 'AA==' })],
  ['nested rawBytes', () => classifiedJob({ result: { ...structuredClone(MATERIAL_FIXTURES.alevel_handwritten_calculus_note), rawBytes: 'AA==' } })],
  ['nested base64', () => classifiedJob({ result: { ...structuredClone(MATERIAL_FIXTURES.alevel_handwritten_calculus_note), content: [{ t: 'p', v: 'safe', base64: 'AA==' }] } })],
  ['Blob', () => classifiedJob({ result: { ...structuredClone(MATERIAL_FIXTURES.alevel_handwritten_calculus_note), content: [new Blob(['unsafe'])] } })],
  ['typed array', () => classifiedJob({ result: { ...structuredClone(MATERIAL_FIXTURES.alevel_handwritten_calculus_note), linkedErrors: new Uint8Array([1]) } })],
  ['custom prototype', () => Object.assign(Object.create({ inherited: true }), validJob())],
  ['undefined', () => validJob({ subject: undefined })],
  ['symbol key', () => Object.assign(validJob(), { [Symbol('unsafe')]: 'x' })],
  ['accessor', () => Object.defineProperty(validJob(), 'subject', { enumerable: true, get: () => 'Math' })],
  ['sparse array', () => classifiedJob({ result: { ...structuredClone(MATERIAL_FIXTURES.alevel_handwritten_calculus_note), linkedErrors: new Array(1) } })],
  ['wrong identity', () => validJob({ id: 'fake-job' })],
])('rejects an upload job containing %s', (_, makeJob) => {
  const job = makeJob()
  expect(() => sanitizeUploadJob(job, { expectedId: 'job-1' })).toThrow(/invalid upload job/i)
})

test('rejects cycles and enforces a flat failed-only failure object', () => {
  const cyclic = validJob()
  cyclic.self = cyclic
  expect(() => sanitizeUploadJob(cyclic)).toThrow(/invalid upload job/i)

  expect(() => sanitizeUploadJob(validJob({
    status: 'failed',
    progress: 1,
    failure: { code: 'FAILED', message: 'Nope', stack: 'unsafe' },
  }))).toThrow(/invalid upload job/i)
  expect(() => sanitizeUploadJob(validJob({
    status: 'cancelled',
    failure: { code: 'FAILED', message: 'Nope' },
  }))).toThrow(/invalid upload job/i)
  expect(sanitizeUploadJob(validJob({
    status: 'failed',
    progress: 1,
    failure: { code: 'FAILED', message: 'Nope' },
  }))).toMatchObject({ status: 'failed', failure: { code: 'FAILED', message: 'Nope' } })
})

test('filters invalid jobs from bootstrap collections without weakening valid jobs', () => {
  const valid = validJob()
  const invalid = validJob({ id: 'invalid', rawBytes: 'AA==' })

  expect(sanitizeUploadJobs([invalid, valid])).toEqual([valid])
  expect(sanitizeUploadJobs(null)).toEqual([])
})
