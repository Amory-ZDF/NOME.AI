export const STORAGE_KEY = 'nome-ai.student-state.v1'
export const STORAGE_VERSION = 1

const clone = (value) => structuredClone(value)
const isPlainStateObject = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype

const hasNonemptyId = (value) => isPlainStateObject(value)
  && typeof value.id === 'string'
  && value.id.trim().length > 0

const matchesSeedSchema = (value, seedValue) => {
  if (!isPlainStateObject(value) || !isPlainStateObject(seedValue)) return false

  return Object.entries(seedValue).every(([key, expected]) => {
    const actual = value[key]
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)) return false
      const idBearing = expected.length > 0 && expected.every(hasNonemptyId)
      return !idBearing || actual.every(hasNonemptyId)
    }
    if (isPlainStateObject(expected)) return isPlainStateObject(actual)
    return Object.prototype.hasOwnProperty.call(value, key)
  })
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
      return envelope.version === STORAGE_VERSION && matchesSeedSchema(envelope.data, fallback) ? envelope.data : fallback
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
