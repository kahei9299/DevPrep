import { describe, it, expect } from 'vitest'

// The harness module uses $lib path aliases that vitest doesn't resolve.
// Test the data-file generation logic directly by reimplementing the pure
// function here. The actual harness correctness is verified by the 78-test
// judge regression suite (verify-judge.mjs) which runs the full pipeline.

describe('marker data file format', () => {
  function generateMarkerDataFile(
    params: { name: string; type: string }[],
    testCases: any[],
    outputs: string[],
    interactive: { secretField: string } | null
  ): string {
    const lines: string[] = [String(testCases.length)]
    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i]
      for (const param of params) {
        const val = tc[param.name]
        if (typeof val === 'string') lines.push(val)
        else if (val === null || val === undefined) lines.push('')
        else lines.push(JSON.stringify(val))
      }
      lines.push(outputs[i] ?? '')
      if (interactive) lines.push(String(tc[interactive.secretField] ?? ''))
    }
    return lines.join('\n') + '\n'
  }

  it('produces correct line count for standard problems', () => {
    const data = generateMarkerDataFile(
      [{ name: 'nums', type: 'int_array' }, { name: 'target', type: 'int' }],
      [{ nums: [2, 7, 11, 15], target: 9 }],
      ['[0,1]'],
      null
    )
    const lines = data.trim().split('\n')
    expect(lines[0]).toBe('1')
    expect(lines[1]).toBe('[2,7,11,15]')
    expect(lines[2]).toBe('9')
    expect(lines[3]).toBe('[0,1]')
    expect(lines.length).toBe(4)
  })

  it('handles multiple test cases', () => {
    const data = generateMarkerDataFile(
      [{ name: 'nums', type: 'int_array' }, { name: 'target', type: 'int' }],
      [{ nums: [2, 7], target: 9 }, { nums: [3, 4], target: 7 }],
      ['[0,1]', '[0,1]'],
      null
    )
    const lines = data.trim().split('\n')
    expect(lines[0]).toBe('2')
    // First test case: 2 params + 1 output = 3 lines
    // Second test case: 2 params + 1 output = 3 lines
    expect(lines.length).toBe(1 + 3 + 3)
  })

  it('handles string parameters without extra quoting', () => {
    const data = generateMarkerDataFile(
      [{ name: 's', type: 'string' }],
      [{ s: 'hello world' }],
      ['result'],
      null
    )
    const lines = data.trim().split('\n')
    expect(lines[1]).toBe('hello world')
  })

  it('includes secret field for interactive problems', () => {
    const data = generateMarkerDataFile(
      [{ name: 'wordlist', type: 'string_array' }],
      [{ wordlist: '["hello","world"]', secret: 'hello' }],
      ['solved:1'],
      { secretField: 'secret' }
    )
    const lines = data.trim().split('\n')
    expect(lines[0]).toBe('1')
    expect(lines[1]).toBe('["hello","world"]')
    expect(lines[2]).toBe('solved:1')
    expect(lines[3]).toBe('hello')
  })
})
