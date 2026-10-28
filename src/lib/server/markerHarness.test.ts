import { describe, it, expect } from 'vitest'
import { generateMarkerDataFile, computeHarnessSignature, generateDataDrivenHarness, HARNESS_VERSION } from './markerHarness'

// ─── Netstring decoder (mirrors the Java parser for round-trip testing) ───

function decodeField(buf: Buffer, pos: { value: number }): string {
  let i = pos.value
  if (i >= buf.length) throw new Error(`Truncated data at offset ${i}`)
  let colonIdx = -1
  for (let j = i; j < buf.length; j++) {
    if (buf[j] === 0x3a) { colonIdx = j; break }
    if (buf[j] < 0x30 || buf[j] > 0x39) throw new Error(`Malformed length at offset ${i}`)
  }
  if (colonIdx < 0) throw new Error(`Missing colon at offset ${i}`)
  const len = parseInt(buf.subarray(i, colonIdx).toString('ascii'), 10)
  const start = colonIdx + 1
  if (start + len > buf.length) throw new Error(`Field overflows at offset ${start}`)
  const val = buf.subarray(start, start + len).toString('utf-8')
  pos.value = start + len
  return val
}

function decodeAll(buf: Buffer): string[] {
  const fields: string[] = []
  const pos = { value: 0 }
  while (pos.value < buf.length) fields.push(decodeField(buf, pos))
  return fields
}

// ─── Production generateMarkerDataFile tests ───

describe('generateMarkerDataFile (production)', () => {
  it('encodes a standard two-param problem', () => {
    const buf = generateMarkerDataFile(
      [{ name: 'nums', type: 'int_array' }, { name: 'target', type: 'int' }],
      [{ nums: [2, 7, 11, 15], target: 9 }],
      ['[0,1]'],
      null
    )
    expect(buf).toBeInstanceOf(Buffer)
    const fields = decodeAll(buf)
    expect(fields).toEqual(['1', '[2,7,11,15]', '9', '[0,1]'])
  })

  it('encodes multiple test cases', () => {
    const buf = generateMarkerDataFile(
      [{ name: 'x', type: 'int' }],
      [{ x: 1 }, { x: 2 }, { x: 3 }],
      ['a', 'b', 'c'],
      null
    )
    expect(decodeAll(buf)).toEqual(['3', '1', 'a', '2', 'b', '3', 'c'])
  })

  it('preserves embedded newlines exactly', () => {
    const buf = generateMarkerDataFile(
      [{ name: 's', type: 'string' }],
      [{ s: 'line1\nline2\nline3' }],
      ['out\nput'],
      null
    )
    const fields = decodeAll(buf)
    expect(fields[1]).toBe('line1\nline2\nline3')
    expect(fields[2]).toBe('out\nput')
  })

  it('preserves carriage returns and tabs', () => {
    const buf = generateMarkerDataFile(
      [{ name: 's', type: 'string' }],
      [{ s: 'hello\r\n\tworld' }],
      ['result'],
      null
    )
    expect(decodeAll(buf)[1]).toBe('hello\r\n\tworld')
  })

  it('preserves trailing whitespace', () => {
    const buf = generateMarkerDataFile(
      [{ name: 's', type: 'string' }],
      [{ s: 'value   ' }],
      ['result'],
      null
    )
    expect(decodeAll(buf)[1]).toBe('value   ')
  })

  it('preserves unicode (emoji, CJK)', () => {
    const buf = generateMarkerDataFile(
      [{ name: 's', type: 'string' }],
      [{ s: '🎉 你好世界' }],
      ['✅'],
      null
    )
    const fields = decodeAll(buf)
    expect(fields[1]).toBe('🎉 你好世界')
    expect(fields[2]).toBe('✅')
  })

  it('preserves quotes and backslashes', () => {
    const buf = generateMarkerDataFile(
      [{ name: 's', type: 'string' }],
      [{ s: '"quoted\\value"' }],
      ['result'],
      null
    )
    expect(decodeAll(buf)[1]).toBe('"quoted\\value"')
  })

  it('handles empty string parameters', () => {
    const buf = generateMarkerDataFile(
      [{ name: 's', type: 'string' }],
      [{ s: '' }],
      [''],
      null
    )
    const fields = decodeAll(buf)
    expect(fields[1]).toBe('')
    expect(fields[2]).toBe('')
  })

  it('handles null/undefined as empty string', () => {
    const buf = generateMarkerDataFile(
      [{ name: 'x', type: 'int' }],
      [{ x: null }],
      ['out'],
      null
    )
    expect(decodeAll(buf)[1]).toBe('')
  })

  it('handles string starting with digits and colons', () => {
    const buf = generateMarkerDataFile(
      [{ name: 's', type: 'string' }],
      [{ s: '42:ambiguous' }],
      ['7:tricky'],
      null
    )
    const fields = decodeAll(buf)
    expect(fields[1]).toBe('42:ambiguous')
    expect(fields[2]).toBe('7:tricky')
  })

  it('includes interactive secret field', () => {
    const buf = generateMarkerDataFile(
      [{ name: 'wordlist', type: 'string_array' }],
      [{ wordlist: '["a","b"]', secret: 'a' }],
      ['solved:1'],
      { secretField: 'secret' }
    )
    const fields = decodeAll(buf)
    expect(fields).toEqual(['1', '["a","b"]', 'solved:1', 'a'])
  })

  it('JSON-serializes non-string values', () => {
    const buf = generateMarkerDataFile(
      [{ name: 'grid', type: 'int_array_2d' }],
      [{ grid: [[1, 2], [3, 4]] }],
      ['output'],
      null
    )
    expect(decodeAll(buf)[1]).toBe('[[1,2],[3,4]]')
  })
})

// ─── Netstring decoder edge cases ───

describe('netstring decoder (mirrors Java parser)', () => {
  it('rejects truncated field', () => {
    const buf = Buffer.from('10:short')
    expect(() => decodeField(buf, { value: 0 })).toThrow('overflows')
  })

  it('rejects malformed length with letters', () => {
    const buf = Buffer.from('abc:hello')
    expect(() => decodeField(buf, { value: 0 })).toThrow('Malformed')
  })

  it('rejects empty buffer', () => {
    expect(() => decodeField(Buffer.alloc(0), { value: 0 })).toThrow('Truncated')
  })

  it('handles zero-length field', () => {
    const buf = Buffer.from('0:')
    expect(decodeField(buf, { value: 0 })).toBe('')
  })

  it('handles field containing only colons', () => {
    const buf = generateMarkerDataFile(
      [{ name: 's', type: 'string' }],
      [{ s: ':::' }],
      ['out'],
      null
    )
    expect(decodeAll(buf)[1]).toBe(':::')
  })
})

// ─── Production computeHarnessSignature tests ───

describe('computeHarnessSignature (production)', () => {
  it('is deterministic', () => {
    const a = computeHarnessSignature('fn', [{ name: 'x', type: 'int' }], 'int', null)
    const b = computeHarnessSignature('fn', [{ name: 'x', type: 'int' }], 'int', null)
    expect(a).toBe(b)
  })

  it('differs for different function names', () => {
    const a = computeHarnessSignature('a', [], 'int', null)
    const b = computeHarnessSignature('b', [], 'int', null)
    expect(a).not.toBe(b)
  })

  it('differs for different param types', () => {
    const a = computeHarnessSignature('fn', [{ name: 'x', type: 'int' }], 'int', null)
    const b = computeHarnessSignature('fn', [{ name: 'x', type: 'string' }], 'int', null)
    expect(a).not.toBe(b)
  })

  it('differs for different output types', () => {
    const a = computeHarnessSignature('fn', [], 'int', null)
    const b = computeHarnessSignature('fn', [], 'string', null)
    expect(a).not.toBe(b)
  })

  it('includes HARNESS_VERSION', () => {
    const sig = computeHarnessSignature('fn', [], 'int', null)
    expect(sig).toContain(`"v":${HARNESS_VERSION}`)
  })
})

// ─── Production generateDataDrivenHarness tests ───

describe('generateDataDrivenHarness (production)', () => {
  it('generates valid Java source', () => {
    const src = generateDataDrivenHarness(
      'twoSum',
      [{ name: 'nums', type: 'int_array' }, { name: 'target', type: 'int' }],
      'int_array',
      null
    )
    expect(src).toContain('public class Main')
    expect(src).toContain('Marker marker = new Marker()')
    expect(src).toContain('data.bin')
    expect(src).toContain('readField')
    expect(src).toContain('marker.twoSum')
    expect(src).not.toContain('undefined')
    expect(src).not.toContain('data.txt')
  })

  it('reads from data.bin not data.txt', () => {
    const src = generateDataDrivenHarness('fn', [{ name: 'x', type: 'int' }], 'int', null)
    expect(src).toContain('data.bin')
    expect(src).not.toContain('data.txt')
  })

  it('handles interactive problems', () => {
    const src = generateDataDrivenHarness(
      'findSecretWord',
      [{ name: 'wordlist', type: 'string_array' }],
      'string',
      { secretField: 'secret' }
    )
    expect(src).toContain('marker.isCorrect')
    expect(src).toContain('secretVal')
    expect(src).not.toContain('marker.findSecretWord')
  })

  it('uses netstring parser with error detection', () => {
    const src = generateDataDrivenHarness('fn', [], 'int', null)
    expect(src).toContain('Truncated data at offset')
    expect(src).toContain('Malformed length at offset')
    expect(src).toContain('Missing colon at offset')
    expect(src).toContain('Field overflows data')
  })
})

// ─── Cache key automatic invalidation via generated source ───

import { computeMarkerHash } from './markerCache'

describe('cache key invalidation via generated Main.java', () => {
  const marker = 'class Marker { boolean isCorrect(int[] a, int[] b) { return true; } }'
  const image = 'alpine/java:22-jdk'

  it('same problem produces same cache key', () => {
    const params = [{ name: 'nums', type: 'int_array' as const }, { name: 'target', type: 'int' as const }]
    const mainA = generateDataDrivenHarness('twoSum', params, 'int_array', null)
    const mainB = generateDataDrivenHarness('twoSum', params, 'int_array', null)
    expect(computeMarkerHash(marker, mainA, image)).toBe(computeMarkerHash(marker, mainB, image))
  })

  it('different function name invalidates cache key', () => {
    const params = [{ name: 'nums', type: 'int_array' as const }]
    const mainA = generateDataDrivenHarness('twoSum', params, 'int_array', null)
    const mainB = generateDataDrivenHarness('search', params, 'int_array', null)
    expect(computeMarkerHash(marker, mainA, image)).not.toBe(computeMarkerHash(marker, mainB, image))
  })

  it('different param types invalidates cache key', () => {
    const mainA = generateDataDrivenHarness('fn', [{ name: 'x', type: 'int' }], 'int', null)
    const mainB = generateDataDrivenHarness('fn', [{ name: 'x', type: 'string' }], 'int', null)
    expect(computeMarkerHash(marker, mainA, image)).not.toBe(computeMarkerHash(marker, mainB, image))
  })

  it('different output type invalidates cache key', () => {
    const mainA = generateDataDrivenHarness('fn', [], 'int', null)
    const mainB = generateDataDrivenHarness('fn', [], 'string', null)
    expect(computeMarkerHash(marker, mainA, image)).not.toBe(computeMarkerHash(marker, mainB, image))
  })

  it('different Docker image invalidates cache key', () => {
    const main = generateDataDrivenHarness('fn', [], 'int', null)
    expect(computeMarkerHash(marker, main, 'alpine/java:22-jdk'))
      .not.toBe(computeMarkerHash(marker, main, 'alpine/java:23-jdk'))
  })

  it('different Marker source invalidates cache key', () => {
    const main = generateDataDrivenHarness('fn', [], 'int', null)
    expect(computeMarkerHash('class Marker { int v1; }', main, image))
      .not.toBe(computeMarkerHash('class Marker { int v2; }', main, image))
  })
})
