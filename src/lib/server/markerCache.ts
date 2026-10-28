import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import Dockerode from 'dockerode'
import tar from 'tar-stream'

const CACHE_DIR = join(process.cwd(), 'node_modules', '.cache', 'marker-cache')

// Required class files for a valid cache entry. A problem may produce
// additional inner-class files (Marker$1.class etc.) which are also cached,
// but these must be present as a minimum.
const REQUIRED_CLASSES = ['Main.class', 'Marker.class']

export interface MarkerCacheEntry {
  classFiles: Map<string, Buffer>
  hash: string
}

const memoryCache = new Map<string, MarkerCacheEntry>()
const pending = new Map<string, Promise<MarkerCacheEntry | null>>()

/**
 * Cache key: SHA-256 of all inputs that affect the compiled .class files.
 *
 * Inputs hashed:
 *   1. Marker.java source code (changes per problem)
 *   2. The actual generated Main.java source — covers function signature,
 *      param types, output type, interactive config, javaHelperMethods,
 *      and the harness code structure. Any change to the harness generator
 *      automatically produces a different hash without manual version bumps.
 *   3. Docker image tag (e.g. "alpine/java:22-jdk") — invalidates if the
 *      Java compiler/runtime version changes.
 *
 * NOT included (and why):
 *   - Test data / user outputs: read at runtime from data.bin, never compiled
 *   - Helper .java sources (ListNode, TreeNode, GraphNode): these are
 *     embedded in Main.java via javaHelperMethods, so they're already
 *     covered by the Main.java hash
 */
export function computeMarkerHash(
  markerSource: string,
  mainJavaSource: string,
  dockerImageTag: string
): string {
  const h = createHash('sha256')
  h.update(markerSource)
  h.update(mainJavaSource)
  h.update(dockerImageTag)
  return h.digest('hex').substring(0, 16)
}

/**
 * Look up a cache entry. Returns null on miss, incomplete entry, or
 * any read error. Validates that required .class files are present.
 */
export async function getCachedClasses(hash: string): Promise<MarkerCacheEntry | null> {
  const mem = memoryCache.get(hash)
  if (mem && isComplete(mem)) return mem
  if (mem) { memoryCache.delete(hash); return null }

  const dir = join(CACHE_DIR, hash)
  try {
    const files = await fs.readdir(dir)
    const classFiles = new Map<string, Buffer>()
    for (const f of files) {
      if (f.endsWith('.class')) {
        classFiles.set(f, await fs.readFile(join(dir, f)))
      }
    }
    if (!isCompleteMap(classFiles)) return null
    const entry: MarkerCacheEntry = { classFiles, hash }
    memoryCache.set(hash, entry)
    return entry
  } catch {
    return null
  }
}

function isComplete(entry: MarkerCacheEntry): boolean {
  return isCompleteMap(entry.classFiles)
}

function isCompleteMap(classFiles: Map<string, Buffer>): boolean {
  for (const name of REQUIRED_CLASSES) {
    const buf = classFiles.get(name)
    if (!buf || buf.length === 0) return false
  }
  return true
}

/**
 * Extract .class files from a container and store them in the cache.
 * Concurrent calls for the same hash share a single extraction.
 * Returns null (no cache) on any failure — never a partial entry.
 */
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

    if (!isCompleteMap(classFiles)) {
      console.error(`[marker-cache] incomplete extraction for ${hash}: missing required classes`)
      return null
    }

    // Write to disk atomically: temp dir → rename
    const tmpDir = join(CACHE_DIR, `_tmp_${hash}_${Date.now()}`)
    const finalDir = join(CACHE_DIR, hash)
    await fs.mkdir(tmpDir, { recursive: true })
    for (const [name, buf] of classFiles) {
      await fs.writeFile(join(tmpDir, name), buf)
    }
    try {
      await fs.rename(tmpDir, finalDir)
    } catch {
      // Another process wrote first — use theirs
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

/** Pack cached .class files + a binary data file into a tar archive. */
export function packCachedWithData(
  cached: MarkerCacheEntry,
  dataFileContent: Buffer
) {
  const pack = tar.pack()
  for (const [name, buf] of cached.classFiles) {
    pack.entry({ name }, buf)
  }
  pack.entry({ name: 'data.bin' }, dataFileContent)
  pack.finalize()
  return pack
}

export function getCacheStats(): { entries: number } {
  return { entries: memoryCache.size }
}

/**
 * Remove a cache entry from memory and disk. Safe to call during
 * concurrent execution — ongoing reads of the old entry use their
 * own in-memory copy, not the disk files.
 */
export function evictCacheEntry(hash: string): void {
  memoryCache.delete(hash)
  fs.rm(join(CACHE_DIR, hash), { recursive: true, force: true }).catch(() => {})
}
