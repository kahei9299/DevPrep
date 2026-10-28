import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import Dockerode from 'dockerode'
import tar from 'tar-stream'

const CACHE_DIR = join(process.cwd(), 'node_modules', '.cache', 'marker-cache')

export interface MarkerCacheEntry {
  classFiles: Map<string, Buffer>
  hash: string
}

// In-memory: hash → class file buffers (including Main.class for the data-driven harness)
const memoryCache = new Map<string, MarkerCacheEntry>()

// Prevents concurrent duplicate compilations for the same hash
const pending = new Map<string, Promise<MarkerCacheEntry | null>>()

/**
 * Cache key: hash of Marker.java source + helper class sources + javaHelperMethods
 * + harness signature (function name, param types, output type, interactive config).
 * This ensures the cached Main.class matches the problem's validation interface.
 */
export function computeMarkerHash(
  markerSource: string,
  helperSources: string[],
  harnessSignature: string
): string {
  const h = createHash('sha256')
  h.update(markerSource)
  for (const s of helperSources) h.update(s)
  h.update(harnessSignature)
  return h.digest('hex').substring(0, 16)
}

export async function getCachedClasses(hash: string): Promise<MarkerCacheEntry | null> {
  const mem = memoryCache.get(hash)
  if (mem) return mem

  const dir = join(CACHE_DIR, hash)
  try {
    const files = await fs.readdir(dir)
    const classFiles = new Map<string, Buffer>()
    for (const f of files) {
      if (f.endsWith('.class')) {
        classFiles.set(f, await fs.readFile(join(dir, f)))
      }
    }
    if (classFiles.size === 0) return null
    const entry: MarkerCacheEntry = { classFiles, hash }
    memoryCache.set(hash, entry)
    return entry
  } catch {
    return null
  }
}

export async function cacheClassFiles(
  hash: string,
  container: Dockerode.Container
): Promise<MarkerCacheEntry | null> {
  const existing = pending.get(hash)
  if (existing) return existing

  const p = extractAndStore(hash, container)
  pending.set(hash, p)
  try {
    return await p
  } finally {
    pending.delete(hash)
  }
}

async function extractAndStore(
  hash: string,
  container: Dockerode.Container
): Promise<MarkerCacheEntry | null> {
  try {
    const classFiles = new Map<string, Buffer>()
    const archiveStream = await container.getArchive({ path: '/app' })
    const extract = tar.extract()

    const done = new Promise<void>((resolve, reject) => {
      extract.on('entry', (header: any, stream: any, next: () => void) => {
        const name = header.name.replace(/^app\//, '')
        // Cache ALL .class files including Main.class (the data-driven harness)
        if (name.endsWith('.class')) {
          const chunks: Buffer[] = []
          stream.on('data', (c: Buffer) => chunks.push(c))
          stream.on('end', () => {
            classFiles.set(name, Buffer.concat(chunks))
            next()
          })
        } else {
          stream.resume()
          stream.on('end', next)
        }
      })
      extract.on('finish', resolve)
      extract.on('error', reject)
    })

    ;(archiveStream as any).pipe(extract)
    await done

    if (classFiles.size === 0) return null

    const tmpDir = join(CACHE_DIR, `_tmp_${hash}_${Date.now()}`)
    const finalDir = join(CACHE_DIR, hash)

    await fs.mkdir(tmpDir, { recursive: true })
    for (const [name, buf] of classFiles) {
      await fs.writeFile(join(tmpDir, name), buf)
    }
    try {
      await fs.rename(tmpDir, finalDir)
    } catch {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }

    const entry: MarkerCacheEntry = { classFiles, hash }
    memoryCache.set(hash, entry)
    return entry
  } catch (e) {
    console.error('[marker-cache] extraction failed:', e)
    return null
  }
}

/** Pack cached .class files + a data file for the data-driven harness. No .java sources needed. */
export function packCachedWithData(
  cached: MarkerCacheEntry,
  dataFileContent: string
) {
  const pack = tar.pack()
  for (const [name, buf] of cached.classFiles) {
    pack.entry({ name }, buf)
  }
  pack.entry({ name: 'data.txt' }, Buffer.from(dataFileContent))
  pack.finalize()
  return pack
}

export function getCacheStats(): { entries: number } {
  return { entries: memoryCache.size }
}

export function evictCacheEntry(hash: string): void {
  memoryCache.delete(hash)
  fs.rm(join(CACHE_DIR, hash), { recursive: true, force: true }).catch(() => {})
}
