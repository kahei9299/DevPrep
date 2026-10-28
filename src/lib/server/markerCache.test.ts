import { describe, it, expect } from 'vitest'
import { computeMarkerHash } from './markerCache'

describe('computeMarkerHash', () => {
  it('produces a 16-char hex string', () => {
    const hash = computeMarkerHash('class Marker {}', ['class ListNode {}'], '{"fn":"twoSum"}')
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('produces the same hash for the same inputs', () => {
    const a = computeMarkerHash('class Marker { int x; }', ['a', 'b'], 'sig')
    const b = computeMarkerHash('class Marker { int x; }', ['a', 'b'], 'sig')
    expect(a).toBe(b)
  })

  it('produces different hashes for different Marker sources', () => {
    const a = computeMarkerHash('class Marker { int x; }', ['a'], 'sig')
    const b = computeMarkerHash('class Marker { int y; }', ['a'], 'sig')
    expect(a).not.toBe(b)
  })

  it('produces different hashes for different helper sources', () => {
    const a = computeMarkerHash('class Marker {}', ['class A {}'], 'sig')
    const b = computeMarkerHash('class Marker {}', ['class B {}'], 'sig')
    expect(a).not.toBe(b)
  })

  it('produces different hashes for different harness signatures', () => {
    const a = computeMarkerHash('class Marker {}', ['a'], '{"fn":"twoSum"}')
    const b = computeMarkerHash('class Marker {}', ['a'], '{"fn":"search"}')
    expect(a).not.toBe(b)
  })
})
