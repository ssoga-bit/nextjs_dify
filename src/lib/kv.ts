import { kv } from '@vercel/kv'

const hasRemoteKV = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)

type MemoryEntry = {
  value: string
  expiresAt?: number
}

const memoryStore = new Map<string, MemoryEntry>()

function setMemory(key: string, serialized: string, ttlSeconds?: number) {
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined
  memoryStore.set(key, { value: serialized, expiresAt })
}

function getMemory(key: string): string | null {
  const entry = memoryStore.get(key)
  if (!entry) return null
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    memoryStore.delete(key)
    return null
  }
  return entry.value
}

/**
 * Store JSON data, using Vercel KV when credentials exist.
 * Falls back to in-memory storage for local development.
 */
export async function kvSetJSON(key: string, value: unknown, ttlSeconds?: number) {
  const serialized = JSON.stringify(value)
  if (hasRemoteKV) {
    if (ttlSeconds) {
      await kv.set(key, serialized, { ex: ttlSeconds })
      return
    }
    await kv.set(key, serialized)
    return
  }
  setMemory(key, serialized, ttlSeconds)
}

/**
 * Retrieve JSON data from the active storage backend.
 */
export async function kvGetJSON<T>(key: string): Promise<T | null> {
  if (hasRemoteKV) {
    const raw = await kv.get<string>(key)
    return raw ? (JSON.parse(raw) as T) : null
  }
  const raw = getMemory(key)
  return raw ? (JSON.parse(raw) as T) : null
}
