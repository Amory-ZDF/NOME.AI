export function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))

  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.has(key) ? values.get(key) : null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  }
}
