import { describe, it, expect } from 'vitest'

// The harness module imports from $lib which vitest can't resolve.
// We test the netstring encoding/decoding logic by reimplementing the
// encoder here and writing a Java decoder verifier that runs in Docker
// (tested by the 78-test judge regression suite).
// This file tests the pure encoding contract.

function encodeField(value: string): Buffer {
  const valBuf = Buffer.from(value, 'utf-8')
  const header = Buffer.from(String(valBuf.length) + ':', 'ascii')
  return Buffer.concat([header, valBuf])
}

function generateMarkerDataFile(
  params: { name: string; type: string }[],
  testCases: any[],
  outputs: string[],
  interactive: { secretField: string } | null
): Buffer {
  const parts: Buffer[] = [encodeField(String(testCases.length))]
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i]
    for (const param of params) {
      const val = tc[param.name]
      let str: string
      if (typeof val === 'string') str = val
      else if (val === null || val === undefined) str = ''
      else str = JSON.stringify(val)
      parts.push(encodeField(str))
    }
    parts.push(encodeField(outputs[i] ?? ''))
    if (interactive) {
      parts.push(encodeField(String(tc[interactive.secretField] ?? '')))
    }
  }
  return Buffer.concat(parts)
}

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

describe('netstring encoding', () => {
  it('encodes simple ASCII strings', () => {
    const buf = encodeField('hello')
    expect(buf.toString()).toBe('5:hello')
  })

  it('encodes empty string', () => {
    const buf = encodeField('')
    expect(buf.toString()).toBe('0:')
  })

  it('round-trips simple values', () => {
    const buf = encodeField('[1,2,3]')
    const pos = { value: 0 }
    expect(decodeField(buf, pos)).toBe('[1,2,3]')
    expect(pos.value).toBe(buf.length)
  })

  it('round-trips embedded newlines', () => {
    const val = 'line1\nline2\nline3'
    const buf = encodeField(val)
    const pos = { value: 0 }
    expect(decodeField(buf, pos)).toBe(val)
  })

  it('round-trips carriage returns and tabs', () => {
    const val = 'hello\r\n\tworld'
    const buf = encodeField(val)
    const pos = { value: 0 }
    expect(decodeField(buf, pos)).toBe(val)
  })

  it('round-trips trailing whitespace', () => {
    const val = 'value   '
    const buf = encodeField(val)
    const pos = { value: 0 }
    expect(decodeField(buf, pos)).toBe(val)
  })

  it('round-trips unicode (emoji, CJK)', () => {
    const val = '🎉 你好世界'
    const buf = encodeField(val)
    const pos = { value: 0 }
    expect(decodeField(buf, pos)).toBe(val)
  })

  it('round-trips quotes and backslashes', () => {
    const val = '"quoted\\value"'
    const buf = encodeField(val)
    const pos = { value: 0 }
    expect(decodeField(buf, pos)).toBe(val)
  })

  it('decodes multiple consecutive fields', () => {
    const buf = Buffer.concat([
      encodeField('first'),
      encodeField('second'),
      encodeField('third')
    ])
    const pos = { value: 0 }
    expect(decodeField(buf, pos)).toBe('first')
    expect(decodeField(buf, pos)).toBe('second')
    expect(decodeField(buf, pos)).toBe('third')
    expect(pos.value).toBe(buf.length)
  })

  it('throws on truncated data', () => {
    const buf = Buffer.from('5:hel')
    const pos = { value: 0 }
    expect(() => decodeField(buf, pos)).toThrow('overflows')
  })

  it('throws on malformed length', () => {
    const buf = Buffer.from('abc:hello')
    const pos = { value: 0 }
    expect(() => decodeField(buf, pos)).toThrow('Malformed')
  })
})

describe('generateMarkerDataFile', () => {
  it('encodes standard two-param problem', () => {
    const buf = generateMarkerDataFile(
      [{ name: 'nums', type: 'int_array' }, { name: 'target', type: 'int' }],
      [{ nums: [2, 7, 11, 15], target: 9 }],
      ['[0,1]'],
      null
    )
    const pos = { value: 0 }
    expect(decodeField(buf, pos)).toBe('1')
    expect(decodeField(buf, pos)).toBe('[2,7,11,15]')
    expect(decodeField(buf, pos)).toBe('9')
    expect(decodeField(buf, pos)).toBe('[0,1]')
    expect(pos.value).toBe(buf.length)
  })

  it('encodes multiple test cases', () => {
    const buf = generateMarkerDataFile(
      [{ name: 'x', type: 'int' }],
      [{ x: 1 }, { x: 2 }, { x: 3 }],
      ['a', 'b', 'c'],
      null
    )
    const pos = { value: 0 }
    expect(decodeField(buf, pos)).toBe('3')
    expect(decodeField(buf, pos)).toBe('1')
    expect(decodeField(buf, pos)).toBe('a')
    expect(decodeField(buf, pos)).toBe('2')
    expect(decodeField(buf, pos)).toBe('b')
    expect(decodeField(buf, pos)).toBe('3')
    expect(decodeField(buf, pos)).toBe('c')
  })

  it('encodes string params without extra quoting', () => {
    const buf = generateMarkerDataFile(
      [{ name: 's', type: 'string' }],
      [{ s: 'hello world' }],
      ['result'],
      null
    )
    const pos = { value: 0 }
    decodeField(buf, pos) // skip count
    expect(decodeField(buf, pos)).toBe('hello world')
  })

  it('encodes null/undefined as empty string', () => {
    const buf = generateMarkerDataFile(
      [{ name: 'x', type: 'int' }],
      [{ x: null }],
      ['out'],
      null
    )
    const pos = { value: 0 }
    decodeField(buf, pos)
    expect(decodeField(buf, pos)).toBe('')
  })

  it('includes interactive secret field', () => {
    const buf = generateMarkerDataFile(
      [{ name: 'wordlist', type: 'string_array' }],
      [{ wordlist: '["a","b"]', secret: 'a' }],
      ['solved:1'],
      { secretField: 'secret' }
    )
    const pos = { value: 0 }
    expect(decodeField(buf, pos)).toBe('1')
    expect(decodeField(buf, pos)).toBe('["a","b"]')
    expect(decodeField(buf, pos)).toBe('solved:1')
    expect(decodeField(buf, pos)).toBe('a')
  })

  it('preserves embedded newlines in values', () => {
    const buf = generateMarkerDataFile(
      [{ name: 's', type: 'string' }],
      [{ s: 'line1\nline2' }],
      ['out\nput'],
      null
    )
    const pos = { value: 0 }
    decodeField(buf, pos)
    expect(decodeField(buf, pos)).toBe('line1\nline2')
    expect(decodeField(buf, pos)).toBe('out\nput')
  })
})

describe('computeHarnessSignature', () => {
  function computeHarnessSignature(
    functionName: string,
    params: { name: string; type: string }[],
    outputType: string,
    interactive: { secretField: string } | null
  ): string {
    return JSON.stringify({
      v: 2,
      functionName,
      params: params.map(p => ({ name: p.name, type: p.type })),
      outputType,
      interactive: interactive?.secretField ?? null
    })
  }

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

  it('includes version in output', () => {
    const sig = computeHarnessSignature('fn', [], 'int', null)
    expect(sig).toContain('"v":2')
  })
})
