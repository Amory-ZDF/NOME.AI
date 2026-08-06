export const STORAGE_KEY = 'nome-ai.student-state.v1'
export const STORAGE_VERSION = 1

const clone = (value) => structuredClone(value)
const isPlainStateObject = (value) => value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype

export function createMockRepository({ storage = window.localStorage, latencyMs = 60, seedFactory }) {
  const wait = () => new Promise((resolve) => setTimeout(resolve, latencyMs))
  const seed = () => clone(seedFactory())
  const load = () => {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return seed()

    try {
      const envelope = JSON.parse(raw)
      return envelope.version === STORAGE_VERSION && isPlainStateObject(envelope.data) ? envelope.data : seed()
    } catch {
      return seed()
    }
  }
  const save = (data) => storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, data }))

  return {
    async bootstrap() {
      await wait()
      const data = load()
      save(data)
      return clone(data)
    },
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
      return this.bootstrap()
    },
  }
}
