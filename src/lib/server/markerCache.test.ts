import { describe, it, expect, afterEach } from 'vitest'
import { computeMarkerHash, getCachedClasses, evictCacheEntry } from './markerCache'
import fs from 'node:fs/promises'
import { join } from 'node:path'

const CACHE_DIR = join(process.cwd(), 'node_modules', '.cache', 'marker-cache')
const H = ['class ListNode {}', 'class TreeNode {}', 'class GraphNode {}']

describe('computeMarkerHash', () => {
  it('produces a 16-char hex string', () => {
    const hash = computeMarkerHash('class Marker {}', 'class Main {}', H, 'alpine/java:22-jdk')
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is deterministic', () => {
    const a = computeMarkerHash('marker', 'main', H, 'img')
    const b = computeMarkerHash('marker', 'main', H, 'img')
    expect(a).toBe(b)
  })

  it('changes when Marker source changes', () => {
    const a = computeMarkerHash('class Marker { int x; }', 'main', H, 'img')
    const b = computeMarkerHash('class Marker { int y; }', 'main', H, 'img')
    expect(a).not.toBe(b)
  })

  it('changes when Main.java source changes', () => {
    const a = computeMarkerHash('marker', 'class Main { void a() {} }', H, 'img')
    const b = computeMarkerHash('marker', 'class Main { void b() {} }', H, 'img')
    expect(a).not.toBe(b)
  })

  it('changes when Docker image tag changes', () => {
    const a = computeMarkerHash('marker', 'main', H, 'alpine/java:22-jdk')
    const b = computeMarkerHash('marker', 'main', H, 'alpine/java:23-jdk')
    expect(a).not.toBe(b)
  })

  it('changes when a helper class source changes', () => {
    const h1 = ['class ListNode { int val; }', 'class TreeNode {}', 'class GraphNode {}']
    const h2 = ['class ListNode { int val; ListNode next; }', 'class TreeNode {}', 'class GraphNode {}']
    const a = computeMarkerHash('marker', 'main', h1, 'img')
    const b = computeMarkerHash('marker', 'main', h2, 'img')
    expect(a).not.toBe(b)
  })

  it('changes when TreeNode source changes', () => {
    const h1 = ['class ListNode {}', 'class TreeNode { int val; }', 'class GraphNode {}']
    const h2 = ['class ListNode {}', 'class TreeNode { int val; TreeNode left; }', 'class GraphNode {}']
    const a = computeMarkerHash('marker', 'main', h1, 'img')
    const b = computeMarkerHash('marker', 'main', h2, 'img')
    expect(a).not.toBe(b)
  })

  it('changes when GraphNode source changes', () => {
    const h1 = ['class ListNode {}', 'class TreeNode {}', 'class GraphNode { int val; }']
    const h2 = ['class ListNode {}', 'class TreeNode {}', 'class GraphNode { List<GraphNode> neighbors; }']
    const a = computeMarkerHash('marker', 'main', h1, 'img')
    const b = computeMarkerHash('marker', 'main', h2, 'img')
    expect(a).not.toBe(b)
  })

  it('automatically invalidates when harness generator output changes', () => {
    const mainV1 = 'public class Main { /* v1 */ }'
    const mainV2 = 'public class Main { /* v2 */ }'
    const a = computeMarkerHash('marker', mainV1, H, 'img')
    const b = computeMarkerHash('marker', mainV2, H, 'img')
    expect(a).not.toBe(b)
  })
})

describe('getCachedClasses', () => {
  const testHash = 'test_' + Date.now().toString(36)

  afterEach(async () => {
    evictCacheEntry(testHash)
    await fs.rm(join(CACHE_DIR, testHash), { recursive: true, force: true }).catch(() => {})
  })

  it('returns null for nonexistent hash', async () => {
    expect(await getCachedClasses('nonexistent_hash_xyz')).toBeNull()
  })

  it('returns null for incomplete entry missing Main.class', async () => {
    const dir = join(CACHE_DIR, testHash)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'Marker.class'), 'fake')
    expect(await getCachedClasses(testHash)).toBeNull()
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('returns null for entry with zero-length required class', async () => {
    const dir = join(CACHE_DIR, testHash)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'Main.class'), '')
    await fs.writeFile(join(dir, 'Marker.class'), 'fake')
    expect(await getCachedClasses(testHash)).toBeNull()
    await fs.rm(dir, { recursive: true, force: true })
  })

  it('returns a valid entry when all required classes exist', async () => {
    const dir = join(CACHE_DIR, testHash)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'Main.class'), 'main-bytecode')
    await fs.writeFile(join(dir, 'Marker.class'), 'marker-bytecode')
    const entry = await getCachedClasses(testHash)
    expect(entry).not.toBeNull()
    expect(entry!.classFiles.has('Main.class')).toBe(true)
    expect(entry!.classFiles.has('Marker.class')).toBe(true)
    await fs.rm(dir, { recursive: true, force: true })
  })
})
