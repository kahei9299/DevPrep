import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { computeMarkerHash, getCachedClasses, evictCacheEntry } from './markerCache'
import fs from 'node:fs/promises'
import { join } from 'node:path'

const CACHE_DIR = join(process.cwd(), 'node_modules', '.cache', 'marker-cache')

describe('computeMarkerHash', () => {
  it('produces a 16-char hex string', () => {
    const hash = computeMarkerHash('class Marker {}', ['class ListNode {}'], '{"v":2,"fn":"twoSum"}')
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is deterministic', () => {
    const a = computeMarkerHash('src', ['h1', 'h2'], 'sig')
    const b = computeMarkerHash('src', ['h1', 'h2'], 'sig')
    expect(a).toBe(b)
  })

  it('changes when Marker source changes', () => {
    const a = computeMarkerHash('class Marker { int x; }', ['a'], 'sig')
    const b = computeMarkerHash('class Marker { int y; }', ['a'], 'sig')
    expect(a).not.toBe(b)
  })

  it('changes when helper sources change', () => {
    const a = computeMarkerHash('src', ['class A {}'], 'sig')
    const b = computeMarkerHash('src', ['class B {}'], 'sig')
    expect(a).not.toBe(b)
  })

  it('changes when harness signature changes', () => {
    const a = computeMarkerHash('src', ['a'], '{"v":2,"fn":"twoSum"}')
    const b = computeMarkerHash('src', ['a'], '{"v":2,"fn":"search"}')
    expect(a).not.toBe(b)
  })

  it('changes when harness version changes', () => {
    const a = computeMarkerHash('src', ['a'], '{"v":1,"fn":"x"}')
    const b = computeMarkerHash('src', ['a'], '{"v":2,"fn":"x"}')
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
    expect(await getCachedClasses('nonexistent_hash')).toBeNull()
  })

  it('returns null for incomplete entry missing Main.class', async () => {
    const dir = join(CACHE_DIR, testHash)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(join(dir, 'Marker.class'), 'fake')
    // Missing Main.class — should be rejected
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
    await fs.writeFile(join(dir, 'ListNode.class'), 'listnode-bytecode')
    const entry = await getCachedClasses(testHash)
    expect(entry).not.toBeNull()
    expect(entry!.classFiles.size).toBe(3)
    expect(entry!.classFiles.get('Main.class')!.toString()).toBe('main-bytecode')
    await fs.rm(dir, { recursive: true, force: true })
  })
})
