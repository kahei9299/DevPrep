#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const src = readFileSync('scripts/verify-judge.mjs', 'utf-8')

const marker = 'const SOLUTIONS = '
const start = src.indexOf(marker)
if (start === -1) { console.error('SOLUTIONS not found'); process.exit(1) }

// Brace-match skipping template-literal bodies (they may contain unbalanced braces)
const code = src.slice(start + marker.length)
let depth = 0, inTpl = 0, i = 0
for (; i < code.length; i++) {
  const ch = code[i]
  if (ch === '`') { inTpl = inTpl ? 0 : 1; continue }
  if (inTpl) continue
  if (ch === '{') depth++
  if (ch === '}') { depth--; if (depth === 0) break }
}
const objStr = code.slice(0, i + 1)

// shortcut: Function eval of trusted local file, upgrade to a real parser if verify-judge gains dynamic expressions
const SOLUTIONS = new Function(`return (${objStr})`)()

const EXT = { python: 'solution.py', cpp: 'solution.cpp', java: 'Solution.java' }
const outDir = 'tests/judge/fixtures'
let count = 0

for (const [slug, langs] of Object.entries(SOLUTIONS)) {
  const dir = join(outDir, slug)
  mkdirSync(dir, { recursive: true })
  for (const [lang, sol] of Object.entries(langs)) {
    const fn = EXT[lang]
    if (fn && sol) { writeFileSync(join(dir, fn), sol + '\n'); count++ }
  }
}

console.log(`Extracted ${count} files for ${Object.keys(SOLUTIONS).length} problems into ${outDir}/`)
