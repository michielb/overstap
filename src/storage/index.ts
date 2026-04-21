// Typed, namespaced, schema-versioned wrapper around localStorage.
// Backend is injectable so tests can swap in an in-memory Map without jsdom.

const NAMESPACE = 'treintje:'

export interface StorageBackend {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  clear(prefix?: string): void
}

export interface Storage {
  get<T>(key: string, version: number): T | undefined
  set<T>(key: string, data: T, version: number): void
  remove(key: string): void
  clear(): void
}

interface StoredEnvelope<T> {
  v: number
  data: T
}

export function browserBackend(): StorageBackend {
  const ls = window.localStorage
  return {
    getItem: (key) => ls.getItem(key),
    setItem: (key, value) => {
      ls.setItem(key, value)
    },
    removeItem: (key) => {
      ls.removeItem(key)
    },
    clear: (prefix) => {
      if (prefix === undefined) {
        ls.clear()
        return
      }
      for (let i = ls.length - 1; i >= 0; i--) {
        const k = ls.key(i)
        if (k !== null && k.startsWith(prefix)) ls.removeItem(k)
      }
    },
  }
}

export function memoryBackend(): StorageBackend {
  const map = new Map<string, string>()
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
    clear: (prefix) => {
      if (prefix === undefined) {
        map.clear()
        return
      }
      for (const k of [...map.keys()]) {
        if (k.startsWith(prefix)) map.delete(k)
      }
    },
  }
}

let warned = false
function warnOnce(message: string): void {
  if (warned) return
  warned = true
  console.warn(`[treintje] ${message}`)
}

function detectBackend(): StorageBackend {
  try {
    const probe = `${NAMESPACE}__probe__`
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return browserBackend()
  } catch {
    warnOnce('localStorage unavailable — falling back to in-memory storage for this session')
    return memoryBackend()
  }
}

function isEnvelope(value: unknown): value is StoredEnvelope<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    'data' in value &&
    typeof (value as { v: unknown }).v === 'number'
  )
}

export function createStorage(backend: StorageBackend = detectBackend()): Storage {
  const nsKey = (key: string) => `${NAMESPACE}${key}`

  return {
    get<T>(key: string, version: number): T | undefined {
      const raw = backend.getItem(nsKey(key))
      if (raw === null) return undefined
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return undefined
      }
      if (!isEnvelope(parsed)) return undefined
      if (parsed.v !== version) return undefined
      return parsed.data as T
    },

    set<T>(key: string, data: T, version: number): void {
      const envelope: StoredEnvelope<T> = { v: version, data }
      try {
        backend.setItem(nsKey(key), JSON.stringify(envelope))
      } catch {
        warnOnce('localStorage write failed — check browser storage quota or privacy settings')
      }
    },

    remove(key: string): void {
      backend.removeItem(nsKey(key))
    },

    clear(): void {
      backend.clear(NAMESPACE)
    },
  }
}

export const storage: Storage = createStorage()
