import { describe, expect, test } from 'vitest'
import { MATERIAL_FIXTURES } from '../../data/materialFixtures'
import {
  confirmMaterialClassification,
  processMaterialJob,
} from './mockMaterialProcessor'

const RESULT_FIELDS = [
  'suggestedTitle',
  'materialType',
  'examBoard',
  'subject',
  'chapter',
  'folderId',
  'folderPath',
  'questionBlocks',
  'answerBlocks',
  'content',
  'linkedTopics',
  'linkedErrors',
  'confidence',
]

const FIXTURE_CASES = [
  {
    fixtureKey: 'alevel_handwritten_calculus_note',
    fileName: 'calculus-working.jpg',
    materialType: 'handwritten_draft',
    title: 'Differentiation and Stationary Points',
    examBoard: 'Cambridge International',
    subject: 'A-Level Math',
    chapter: 'Calculus',
  },
  {
    fixtureKey: 'alevel_past_paper',
    fileName: '9709_s22_qp_31.pdf',
    materialType: 'past_paper',
    title: '9709/31 May/June 2022 Past Paper',
    examBoard: 'Cambridge International',
    subject: 'A-Level Math',
    chapter: 'Calculus',
  },
  {
    fixtureKey: 'alevel_mark_scheme',
    fileName: '9709_s22_ms_31.pdf',
    materialType: 'mark_scheme',
    title: '9709/31 May/June 2022 Mark Scheme',
    examBoard: 'Cambridge International',
    subject: 'A-Level Math',
    chapter: 'Calculus',
  },
  {
    fixtureKey: 'ielts_reading_passage',
    fileName: 'urban-bees.png',
    materialType: 'ielts_passage',
    title: 'Urban Bees — IELTS Reading Passage',
    examBoard: 'Cambridge English',
    subject: 'IELTS Reading',
    chapter: 'Academic Reading',
  },
  {
    fixtureKey: 'homework',
    fileName: 'calculus-homework.pdf',
    materialType: 'homework',
    title: 'Calculus Homework — Applications of Differentiation',
    examBoard: 'Cambridge International',
    subject: 'A-Level Math',
    chapter: 'Calculus',
  },
  {
    fixtureKey: 'error_photo',
    fileName: 'stationary-point-error.webp',
    materialType: 'error_photo',
    title: 'Error Photo — Stationary Point Classification',
    examBoard: 'Cambridge International',
    subject: 'A-Level Math',
    chapter: 'Calculus',
  },
]

const processingJob = (overrides = {}) => ({
  id: 'job-1',
  fileName: '9709_s22_ms_31.pdf',
  materialType: 'mark_scheme',
  status: 'processing',
  progress: 45,
  createdAt: '2026-08-07T08:00:00.000Z',
  updatedAt: '2026-08-07T08:01:00.000Z',
  ...overrides,
})

const captureError = (callback) => {
  try {
    callback()
  } catch (error) {
    return error
  }
  return null
}

const withObjectPrototypeProperties = (properties, callback) => {
  const descriptors = new Map(
    Object.keys(properties).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(Object.prototype, key),
    ]),
  )

  try {
    for (const [key, value] of Object.entries(properties)) {
      Object.defineProperty(Object.prototype, key, {
        configurable: true,
        enumerable: false,
        value,
        writable: true,
      })
    }
    return callback()
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) {
        Object.defineProperty(Object.prototype, key, descriptor)
      } else {
        Reflect.deleteProperty(Object.prototype, key)
      }
    }
  }
}

const expectProcessorError = (callback, code, message) => {
  expect(captureError(callback)).toMatchObject({
    name: 'MaterialProcessorError',
    code,
    message,
  })
}

const expectProcessorErrorWithPrototypePollution = (
  properties,
  callback,
  code,
  message,
) => {
  const error = withObjectPrototypeProperties(
    properties,
    () => captureError(callback),
  )

  expect(error).toMatchObject({
    name: 'MaterialProcessorError',
    code,
    message,
  })
}

const sparseArray = () => new Array(1)

const arrayWithEnumerableProperty = (items) => {
  const value = [...items]
  value.ignoredByJson = 'must be rejected'
  return value
}

describe('deterministic mock material fixtures', () => {
  test.each(FIXTURE_CASES)(
    'publishes concrete classification and content for $fixtureKey',
    ({ fixtureKey, materialType, title, examBoard, subject, chapter }) => {
      const fixture = MATERIAL_FIXTURES[fixtureKey]

      expect(Object.keys(fixture).sort()).toEqual([...RESULT_FIELDS].sort())
      expect(fixture).toMatchObject({
        suggestedTitle: title,
        materialType,
        examBoard,
        subject,
        chapter,
      })
      expect(fixture.folderId).toEqual(expect.any(String))
      expect(fixture.folderPath).toEqual(expect.any(String))
      expect(fixture.content.length).toBeGreaterThan(1)
      expect(fixture.content.every(({ t, v }) => (
        ['h', 'p'].includes(t) && typeof v === 'string' && v.trim().length > 0
      ))).toBe(true)
      expect(fixture.questionBlocks.length).toBeGreaterThan(0)
      expect(fixture.linkedTopics.length).toBeGreaterThan(0)
      expect(fixture.linkedErrors).toEqual(expect.any(Array))
      expect(fixture.confidence).toBeGreaterThanOrEqual(0)
      expect(fixture.confidence).toBeLessThanOrEqual(1)
    },
  )

  test('keeps Mark Scheme questions and answers explicitly linked', () => {
    const fixture = MATERIAL_FIXTURES.alevel_mark_scheme

    expect(fixture.questionBlocks).toEqual([
      {
        id: 'ms-q1',
        label: 'Question 1',
        text: 'Find the stationary points of y = x³ - 6x² + 9x + 4.',
      },
      {
        id: 'ms-q2',
        label: 'Question 2',
        text: 'Use the second derivative to classify each stationary point.',
      },
    ])
    expect(fixture.answerBlocks).toEqual([
      {
        id: 'ms-a1',
        questionId: 'ms-q1',
        text: "M1 differentiate; A1 solve 3x² - 12x + 9 = 0 to obtain x = 1, 3.",
      },
      {
        id: 'ms-a2',
        questionId: 'ms-q2',
        text: 'B1 yʺ = 6x - 12; x = 1 is a maximum and x = 3 is a minimum.',
      },
    ])
  })
})

describe('mock material processing', () => {
  test('extracts a deterministic Mark Scheme with split questions and answers', () => {
    const processed = processMaterialJob(
      processingJob(),
      { fixtureKey: 'alevel_mark_scheme' },
    )

    expect(processed).toMatchObject({
      id: 'job-1',
      status: 'needs_confirmation',
      progress: 100,
    })
    expect(Object.keys(processed.result).sort()).toEqual([...RESULT_FIELDS].sort())
    expect(processed.result.questionBlocks.length).toBeGreaterThan(0)
    expect(processed.result.answerBlocks.length).toBeGreaterThan(0)
    expect(processed.result.examBoard).toBe('Cambridge International')
  })

  test.each(FIXTURE_CASES)(
    'processes $fixtureKey into its exact classification',
    ({ fixtureKey, fileName, materialType, title, examBoard, subject, chapter }) => {
      const processed = processMaterialJob(
        processingJob({ fileName, materialType }),
        { fixtureKey },
      )

      expect(processed.result).toMatchObject({
        suggestedTitle: title,
        materialType,
        examBoard,
        subject,
        chapter,
      })
      expect(processed.status).toBe('needs_confirmation')
      expect(processed.progress).toBe(100)
    },
  )

  test('is deterministic, deeply clones input and fixture data, and never mutates either source', () => {
    const job = processingJob({ clientMeta: { labels: ['original'] } })
    const originalJob = JSON.parse(JSON.stringify(job))

    const first = processMaterialJob(job, { fixtureKey: 'alevel_mark_scheme' })
    const second = processMaterialJob(job, { fixtureKey: 'alevel_mark_scheme' })

    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.result).not.toBe(second.result)
    expect(first.result.content).not.toBe(second.result.content)
    expect(first.result.questionBlocks[0]).not.toBe(second.result.questionBlocks[0])
    expect(first.clientMeta).not.toBe(job.clientMeta)
    expect(job).toEqual(originalJob)

    first.result.content[0].v = 'tampered'
    first.result.questionBlocks[0].text = 'tampered'
    first.clientMeta.labels.push('tampered')

    expect(second.result).toEqual(MATERIAL_FIXTURES.alevel_mark_scheme)
    expect(job).toEqual(originalJob)
  })

  test('rejects malformed jobs, invalid processing states, and unknown fixtures with stable errors', () => {
    for (const job of [null, undefined, 'job', []]) {
      expectProcessorError(
        () => processMaterialJob(job, { fixtureKey: 'alevel_mark_scheme' }),
        'INVALID_MATERIAL_JOB',
        'Material job must be an object',
      )
    }

    for (const [field, value] of [
      ['id', ''],
      ['fileName', 42],
      ['materialType', 'unknown'],
    ]) {
      expectProcessorError(
        () => processMaterialJob(processingJob({ [field]: value }), { fixtureKey: 'alevel_mark_scheme' }),
        'INVALID_MATERIAL_JOB',
        'Material job is missing valid upload metadata',
      )
    }

    for (const status of ['queued', 'needs_confirmation', 'completed', 'failed', 'cancelled', undefined]) {
      expectProcessorError(
        () => processMaterialJob(processingJob({ status }), { fixtureKey: 'alevel_mark_scheme' }),
        'INVALID_JOB_STATE',
        'Only processing material jobs can be processed',
      )
    }

    for (const options of [null, undefined, [], {}, { fixtureKey: '' }, { fixtureKey: 'unknown' }]) {
      expectProcessorError(
        () => processMaterialJob(processingJob(), options),
        'UNKNOWN_MATERIAL_FIXTURE',
        'Select a known material fixture',
      )
    }
  })

  test.each(['__proto__', 'constructor', 'toString', 'unknown_fixture'])(
    'rejects inherited or unknown fixture key %s at the lookup boundary',
    (fixtureKey) => {
      expectProcessorError(
        () => processMaterialJob(processingJob(), { fixtureKey }),
        'UNKNOWN_MATERIAL_FIXTURE',
        'Select a known material fixture',
      )
    },
  )

  test.each([
    ['id', 'job-from-prototype', 'INVALID_MATERIAL_JOB', 'Material job is missing valid upload metadata'],
    ['fileName', 'prototype.pdf', 'INVALID_MATERIAL_JOB', 'Material job is missing valid upload metadata'],
    ['materialType', 'mark_scheme', 'INVALID_MATERIAL_JOB', 'Material job is missing valid upload metadata'],
    ['status', 'processing', 'INVALID_JOB_STATE', 'Only processing material jobs can be processed'],
  ])(
    'requires processing job field %s to be an own property',
    (field, inheritedValue, code, message) => {
      const job = processingJob()
      Reflect.deleteProperty(job, field)

      expectProcessorErrorWithPrototypePollution(
        { [field]: inheritedValue },
        () => processMaterialJob(job, { fixtureKey: 'alevel_mark_scheme' }),
        code,
        message,
      )
    },
  )

  test('requires fixtureKey to be an own options property', () => {
    expectProcessorErrorWithPrototypePollution(
      { fixtureKey: 'alevel_mark_scheme' },
      () => processMaterialJob(processingJob(), {}),
      'UNKNOWN_MATERIAL_FIXTURE',
      'Select a known material fixture',
    )
  })

  test.each([
    ['undefined values', () => undefined],
    ['sparse arrays', sparseArray],
    ['enumerable array properties', () => arrayWithEnumerableProperty(['valid'])],
  ])('rejects %s in otherwise valid processing jobs', (_case, buildPayload) => {
    expectProcessorError(
      () => processMaterialJob(
        processingJob({ clientMeta: buildPayload() }),
        { fixtureKey: 'alevel_mark_scheme' },
      ),
      'INVALID_MATERIAL_JOB',
      'Material job contains non-serializable data',
    )
  })

  test('accepts null-prototype jobs and options without reading their prototypes', () => {
    const job = Object.assign(Object.create(null), processingJob())
    const options = Object.assign(Object.create(null), {
      fixtureKey: 'alevel_mark_scheme',
    })

    const processed = processMaterialJob(job, options)

    expect(processed).toMatchObject({
      id: 'job-1',
      status: 'needs_confirmation',
      progress: 100,
    })
  })

  test('keeps shared JSON data valid and rejects cyclic job data', () => {
    const shared = { label: 'shared' }
    const processed = processMaterialJob(
      processingJob({ clientMeta: { first: shared, second: shared } }),
      { fixtureKey: 'alevel_mark_scheme' },
    )
    const cyclic = {}
    cyclic.self = cyclic

    expect(processed.clientMeta).toEqual({
      first: { label: 'shared' },
      second: { label: 'shared' },
    })
    expect(processed.clientMeta.first).not.toBe(processed.clientMeta.second)
    expectProcessorError(
      () => processMaterialJob(
        processingJob({ clientMeta: cyclic }),
        { fixtureKey: 'alevel_mark_scheme' },
      ),
      'INVALID_MATERIAL_JOB',
      'Material job contains non-serializable data',
    )
  })
})

describe('material classification confirmation', () => {
  test('lets the student override a low-confidence classification', () => {
    const processedJob = processMaterialJob(
      processingJob({
        id: 'job-2',
        fileName: 'reading.png',
        materialType: 'ielts_passage',
      }),
      { fixtureKey: 'ielts_reading_passage' },
    )

    const { job, note } = confirmMaterialClassification(processedJob, {
      subject: 'IELTS Reading',
      chapter: 'Matching Headings',
      folderId: 'f-ielts-reading',
      folderPath: 'IELTS / Reading',
    })

    expect(job).toMatchObject({
      id: 'job-2',
      status: 'completed',
      progress: 100,
      materialType: 'ielts_passage',
      subject: 'IELTS Reading',
      chapter: 'Matching Headings',
      folderId: 'f-ielts-reading',
      folderPath: 'IELTS / Reading',
      result: {
        subject: 'IELTS Reading',
        chapter: 'Matching Headings',
        folderId: 'f-ielts-reading',
        folderPath: 'IELTS / Reading',
      },
    })
    expect(note).toMatchObject({
      id: 'note-job-2',
      title: 'Urban Bees — IELTS Reading Passage',
      materialType: 'ielts_passage',
      subject: 'IELTS Reading',
      chapter: 'Matching Headings',
      folderId: 'f-ielts-reading',
      folderPath: 'IELTS / Reading',
      versions: [],
      version: 1,
      sourceJobId: 'job-2',
      source: 'typed',
    })
  })

  test.each([
    ['alevel_handwritten_calculus_note', 'handwritten_draft', 'handwritten'],
    ['alevel_past_paper', 'past_paper', 'typed'],
    ['alevel_mark_scheme', 'mark_scheme', 'typed'],
    ['ielts_reading_passage', 'ielts_passage', 'typed'],
    ['homework', 'homework', 'typed'],
    ['error_photo', 'error_photo', 'photo'],
  ])('derives note source for %s from material type', (fixtureKey, materialType, source) => {
    const processedJob = processMaterialJob(
      processingJob({ materialType }),
      { fixtureKey },
    )

    expect(confirmMaterialClassification(processedJob, {}).note.source).toBe(source)
  })

  test('deeply isolates the input job, patch, completed job, and note', () => {
    const processedJob = processMaterialJob(
      processingJob(),
      { fixtureKey: 'alevel_mark_scheme' },
    )
    const patch = {
      content: [{ t: 'p', v: 'Confirmed content' }],
      linkedTopics: ['calculus-confirmed'],
      linkedErrors: ['error-9'],
    }
    const originalJob = JSON.parse(JSON.stringify(processedJob))
    const originalPatch = JSON.parse(JSON.stringify(patch))

    const { job, note } = confirmMaterialClassification(processedJob, patch)

    expect(processedJob).toEqual(originalJob)
    expect(patch).toEqual(originalPatch)
    expect(job.result.content).toEqual([{ t: 'p', v: 'Confirmed content' }])
    expect(note.content).toEqual([{ t: 'p', v: 'Confirmed content' }])
    expect(job.result.content).not.toBe(note.content)
    expect(job.result.content).not.toBe(patch.content)

    note.content[0].v = 'note mutation'
    note.linkedTopics.push('note-only')
    job.result.linkedErrors.push('job-only')

    expect(job.result.content).toEqual([{ t: 'p', v: 'Confirmed content' }])
    expect(job.result.linkedTopics).toEqual(['calculus-confirmed'])
    expect(note.linkedErrors).toEqual(['error-9'])
    expect(processedJob).toEqual(originalJob)
    expect(patch).toEqual(originalPatch)
  })

  test('rejects invalid confirmation state and malformed patches with stable errors', () => {
    const processedJob = processMaterialJob(
      processingJob(),
      { fixtureKey: 'alevel_mark_scheme' },
    )

    for (const job of [null, undefined, [], processingJob(), { ...processedJob, status: 'cancelled' }]) {
      expectProcessorError(
        () => confirmMaterialClassification(job, {}),
        'INVALID_CONFIRMATION_JOB',
        'Only classified jobs awaiting confirmation can be confirmed',
      )
    }

    for (const patch of [null, undefined, [], 'patch']) {
      expectProcessorError(
        () => confirmMaterialClassification(processedJob, patch),
        'INVALID_CLASSIFICATION_PATCH',
        'Classification patch must be an object',
      )
    }

    for (const patch of [
      { unknown: 'value' },
      { subject: '' },
      { folderId: 42 },
      { materialType: 'unknown' },
      { confidence: 2 },
      { linkedTopics: ['calculus', 42] },
      { content: [{ t: 'script', v: 'unsafe' }] },
      { questionBlocks: [{ id: 'q1', label: 'Question 1' }] },
      { answerBlocks: [{ id: 'a1', questionId: '', text: 'Answer' }] },
    ]) {
      expectProcessorError(
        () => confirmMaterialClassification(processedJob, patch),
        'INVALID_CLASSIFICATION_PATCH',
        'Classification patch contains invalid fields',
      )
    }
  })

  test.each(['id', 'status', 'result'])(
    'requires confirmation job field %s to be an own property',
    (field) => {
      const processedJob = processMaterialJob(
        processingJob(),
        { fixtureKey: 'alevel_mark_scheme' },
      )
      const inheritedValue = processedJob[field]
      Reflect.deleteProperty(processedJob, field)

      expectProcessorErrorWithPrototypePollution(
        { [field]: inheritedValue },
        () => confirmMaterialClassification(processedJob, {}),
        'INVALID_CONFIRMATION_JOB',
        'Only classified jobs awaiting confirmation can be confirmed',
      )
    },
  )

  test('ignores inherited optional timestamps when creating a note', () => {
    const sourceJob = processingJob()
    Reflect.deleteProperty(sourceJob, 'createdAt')
    Reflect.deleteProperty(sourceJob, 'updatedAt')
    const processedJob = processMaterialJob(
      sourceJob,
      { fixtureKey: 'alevel_mark_scheme' },
    )

    const note = withObjectPrototypeProperties(
      {
        createdAt: '1999-01-01T00:00:00.000Z',
        updatedAt: '1999-01-02T00:00:00.000Z',
      },
      () => confirmMaterialClassification(processedJob, {}).note,
    )

    expect(note).not.toHaveProperty('createdAt')
    expect(note).not.toHaveProperty('updatedAt')
  })

  test.each([
    ['sparse content', () => ({ content: sparseArray() })],
    ['sparse linked topics', () => ({ linkedTopics: sparseArray() })],
    ['sparse linked errors', () => ({ linkedErrors: sparseArray() })],
    ['sparse answer blocks', () => ({ answerBlocks: sparseArray() })],
    ['sparse question blocks', () => ({
      questionBlocks: sparseArray(),
      answerBlocks: [],
    })],
    ['enumerable array properties', () => ({
      linkedTopics: arrayWithEnumerableProperty(['calculus-extrema']),
    })],
  ])('rejects classification patches containing %s', (_case, buildPatch) => {
    const processedJob = processMaterialJob(
      processingJob(),
      { fixtureKey: 'alevel_mark_scheme' },
    )

    expectProcessorError(
      () => confirmMaterialClassification(processedJob, buildPatch()),
      'INVALID_CLASSIFICATION_PATCH',
      'Classification patch contains invalid fields',
    )
  })

  test.each([
    ['sparse content', () => ({ content: sparseArray() })],
    ['sparse linked topics', () => ({ linkedTopics: sparseArray() })],
    ['sparse linked errors', () => ({ linkedErrors: sparseArray() })],
    ['sparse answer blocks', () => ({ answerBlocks: sparseArray() })],
    ['sparse question blocks', () => ({
      questionBlocks: sparseArray(),
      answerBlocks: [],
    })],
    ['enumerable array properties', () => ({
      linkedTopics: arrayWithEnumerableProperty(['calculus-extrema']),
    })],
  ])('rejects classified job results containing %s', (_case, buildResultPatch) => {
    const processedJob = processMaterialJob(
      processingJob(),
      { fixtureKey: 'alevel_mark_scheme' },
    )
    processedJob.result = {
      ...processedJob.result,
      ...buildResultPatch(),
    }

    expectProcessorError(
      () => confirmMaterialClassification(processedJob, {}),
      'INVALID_CONFIRMATION_JOB',
      'Only classified jobs awaiting confirmation can be confirmed',
    )
  })

  test('accepts null-prototype confirmation data and returns JSON-round-trippable values', () => {
    const processedJob = processMaterialJob(
      processingJob(),
      { fixtureKey: 'alevel_mark_scheme' },
    )
    const nullPrototypeJob = Object.assign(Object.create(null), processedJob, {
      result: Object.assign(Object.create(null), processedJob.result),
    })
    const patch = Object.assign(Object.create(null), {
      chapter: 'Differentiation',
      linkedTopics: ['calculus-differentiation'],
    })

    const confirmed = confirmMaterialClassification(nullPrototypeJob, patch)

    expect(JSON.parse(JSON.stringify(processedJob))).toEqual(processedJob)
    expect(JSON.parse(JSON.stringify(confirmed))).toEqual(confirmed)
    expect(confirmed.note).toMatchObject({
      chapter: 'Differentiation',
      linkedTopics: ['calculus-differentiation'],
    })
  })
})
