export const STORAGE_KEY = 'nome-ai.student-state.v1'
export const STORAGE_VERSION = 1

const clone = (value) => structuredClone(value)
const isPlainStateObject = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype

const COLLECTION_IDENTIFIERS = Object.freeze({
  tasks: 'id',
  errors: 'id',
  noteFolders: 'id',
  notes: 'id',
  bankQuestions: 'id',
  bankRecommendations: 'questionId',
  progressTimeline: 'date',
  achievements: 'id',
  sessions: 'sessionId',
  taskAdjustments: 'id',
})

const hasNonemptyIdentifier = (value, field = 'id') => isPlainStateObject(value)
  && typeof value[field] === 'string'
  && value[field].trim().length > 0

const hasValidKeyedSessions = (value) => isPlainStateObject(value)
  && Object.entries(value).every(([sessionId, session]) => (
    hasNonemptyIdentifier(session, 'sessionId') && session.sessionId === sessionId
  ))

const matchesSeedSchema = (value, seedValue) => {
  if (!isPlainStateObject(value) || !isPlainStateObject(seedValue)) return false

  return Object.entries(seedValue).every(([key, expected]) => {
    const actual = value[key]
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)) return false
      const identifier = COLLECTION_IDENTIFIERS[key]
      if (identifier) return actual.every((item) => hasNonemptyIdentifier(item, identifier))
      const idBearing = expected.length > 0 && expected.every((item) => hasNonemptyIdentifier(item))
      return !idBearing || actual.every((item) => hasNonemptyIdentifier(item))
    }
    if (isPlainStateObject(expected)) {
      if (key === 'sessions') return hasValidKeyedSessions(actual)
      return isPlainStateObject(actual)
    }
    return Object.prototype.hasOwnProperty.call(value, key)
  })
}

const migrateStoredState = (envelope, fallback) => {
  if (envelope?.version !== STORAGE_VERSION || !isPlainStateObject(envelope.data)) return null

  let data = Object.prototype.hasOwnProperty.call(envelope.data, 'taskAdjustments')
    ? envelope.data
    : { ...envelope.data, taskAdjustments: [] }

  if (Array.isArray(data.sessions)) {
    const validLegacySessions = data.sessions.every((session) => hasNonemptyIdentifier(session, 'sessionId'))
    const sessionIds = validLegacySessions ? data.sessions.map((session) => session.sessionId) : []
    if (validLegacySessions && new Set(sessionIds).size === sessionIds.length) {
      data = {
        ...data,
        sessions: Object.fromEntries(data.sessions.map((session) => [session.sessionId, session])),
      }
    } else {
      data = { ...data, sessions: fallback.sessions }
    }
  } else if (!hasValidKeyedSessions(data.sessions)) {
    data = { ...data, sessions: fallback.sessions }
  }

  return matchesSeedSchema(data, fallback) ? data : null
}

export function createMockRepository({ storage = window.localStorage, latencyMs = 60, seedFactory }) {
  const wait = () => new Promise((resolve) => setTimeout(resolve, latencyMs))
  const seed = () => clone(seedFactory())
  const load = () => {
    const fallback = seed()
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return fallback

    try {
      const envelope = JSON.parse(raw)
      return migrateStoredState(envelope, fallback) ?? fallback
    } catch {
      return fallback
    }
  }
  const save = (data) => storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, data }))

  const bootstrap = async () => {
    await wait()
    const data = load()
    save(data)
    return clone(data)
  }

  return {
    bootstrap,
    async read(selector) {
      await wait()
      return clone(selector(clone(load())))
    },
    async update(recipe) {
      await wait()
      const next = recipe(clone(load()))
      save(next)
      return clone(next)
    },
    async reset() {
      storage.removeItem(STORAGE_KEY)
      return bootstrap()
    },
  }
}
