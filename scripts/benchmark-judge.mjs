#!/usr/bin/env node
/**
 * Judge Performance Benchmark
 *
 * Measures end-to-end latency for Run and Submit across Python, C++, and Java.
 * Loads reference solutions from tests/judge/fixtures/ (the same verified
 * fixtures used by verify-judge.mjs) and test inputs from problems/ metadata.
 *
 * Requires: npm run dev (server at localhost:5173) + Docker running.
 *
 * Usage:
 *   node scripts/benchmark-judge.mjs                          # Full benchmark
 *   node scripts/benchmark-judge.mjs --problem two-sum        # Single problem
 *   node scripts/benchmark-judge.mjs --lang python            # Single language
 *   node scripts/benchmark-judge.mjs --reps 3                 # Custom repetitions
 *   node scripts/benchmark-judge.mjs --warmup 1               # Warmup runs
 *   node scripts/benchmark-judge.mjs --cold                   # Include cold-start run
 *   node scripts/benchmark-judge.mjs --json results.json      # Write JSON output
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { totalmem } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.COJUDGE_URL || 'http://localhost:5173'
const POLL_INTERVAL = 100
const POLL_TIMEOUT = 120_000
const FIXTURES_DIR = join(__dirname, '..', 'tests', 'judge', 'fixtures')
const PROBLEMS_DIR = join(__dirname, '..', 'problems')

const BENCHMARK_PROBLEMS = [
  'two-sum',
  'binary-search',
  'group-anagrams',
  'lru-cache',
  'minimum-window-substring'
]

const FIXTURE_EXT = { python: 'solution.py', cpp: 'solution.cpp', java: 'Solution.java' }
const LANGUAGES = ['python', 'cpp', 'java']

// ─── CLI args ───

const cliArgs = process.argv.slice(2)
function getArg(name) {
  const idx = cliArgs.indexOf(`--${name}`)
  return idx !== -1 ? cliArgs[idx + 1] : null
}
const filterProblem = getArg('problem')
const filterLang = getArg('lang')
const REPS = parseInt(getArg('reps') || '5', 10)
const WARMUP = parseInt(getArg('warmup') || '2', 10)
const includeCold = cliArgs.includes('--cold')
const jsonPath = getArg('json')

// ─── Load solutions from verified fixtures ───

function loadFixtureSolution(slug, lang) {
  const filename = FIXTURE_EXT[lang]
  if (!filename) return null
  const path = join(FIXTURES_DIR, slug, filename)
  if (!existsSync(path)) return null
  return readFileSync(path, 'utf-8').trimEnd()
}

function loadTestCases(problemId) {
  const metaPath = join(PROBLEMS_DIR, problemId, 'metadata.json')
  if (!existsSync(metaPath)) return []
  const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
  return meta.testCases || []
}

function countOfficialTests(problemId) {
  const testsPath = join(PROBLEMS_DIR, problemId, 'official-tests.json')
  if (!existsSync(testsPath)) return 0
  return JSON.parse(readFileSync(testsPath, 'utf-8')).length
}

// ─── API helpers ───

async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return { httpStatus: res.status, ...(await res.json()) }
}

async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`)
  return { httpStatus: res.status, ...(await res.json()) }
}

async function pollJob(endpoint, jobId) {
  const start = Date.now()
  let polls = 0
  while (Date.now() - start < POLL_TIMEOUT) {
    const result = await apiGet(`${endpoint}?jobId=${jobId}`)
    polls++
    if (result.ready || (result.httpStatus >= 400 && result.error)) {
      return { ...result, polls, pollTimeMs: Date.now() - start }
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }
  return { error: 'POLL_TIMEOUT', polls, pollTimeMs: Date.now() - start }
}

// ─── Timed run ───

async function timedRun(problemId, language, code, testCases) {
  const t0 = performance.now()
  const postResult = await apiPost('/api/run', { problemId, language, code, testCases })
  const tPost = performance.now()
  if (postResult.error || !postResult.jobId) {
    return { error: postResult.error || 'No jobId', totalMs: performance.now() - t0, valid: false }
  }
  const result = await pollJob('/api/run', postResult.jobId)
  const tDone = performance.now()
  const passed = Array.isArray(result.results) && result.results.every(r => r.isCorrect)
  return {
    totalMs: tDone - t0,
    postMs: tPost - t0,
    pollMs: tDone - tPost,
    polls: result.polls,
    executionTimeMs: result.executionTimeMs ?? null,
    memoryKB: result.memoryKB ?? null,
    passed,
    timeout: !!result.timeout,
    error: result.error || null,
    // A measurement is valid only if the correct solution was accepted
    valid: passed && !result.timeout && !result.error
  }
}

// ─── Timed submit (handles multi-batch) ───

async function timedSubmit(problemId, language, code) {
  const t0 = performance.now()
  let tcNo = 0
  let totalPolls = 0
  let totalTc = 0
  let passedTc = 0
  let execMs = 0
  let memKB = 0

  while (true) {
    const postResult = await apiPost('/api/submit', { problemId, language, code, startTcNo: tcNo })
    if (postResult.error || !postResult.jobId) {
      return { error: postResult.error || 'No jobId', totalMs: performance.now() - t0, valid: false }
    }
    const result = await pollJob('/api/submit', postResult.jobId)
    totalPolls += result.polls || 0

    if (result.error) {
      return { error: result.error, totalMs: performance.now() - t0, valid: false, polls: totalPolls }
    }
    if (result.timeout) {
      return { timeout: true, totalMs: performance.now() - t0, valid: false, polls: totalPolls }
    }
    if (result.totalTc) totalTc = result.totalTc
    if (result.executionTimeMs != null) execMs += result.executionTimeMs
    if (result.memoryKB != null) memKB = Math.max(memKB, result.memoryKB)

    if (result.allAccepted) {
      passedTc = totalTc
      break
    }
    if (!result.accepted) {
      return {
        totalMs: performance.now() - t0,
        valid: false,
        error: 'Wrong answer',
        polls: totalPolls,
        totalTc,
        passedTc: result.passedTc || 0
      }
    }
    // Batch accepted — advance to next batch
    tcNo += (result.passedTc || 1)
    if (tcNo >= totalTc) break
  }

  const tDone = performance.now()
  return {
    totalMs: tDone - t0,
    polls: totalPolls,
    allAccepted: true,
    totalTc,
    passedTc,
    executionTimeMs: execMs || null,
    memoryKB: memKB || null,
    valid: true
  }
}

// ─── Statistics ───

function median(arr) {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function p95(arr) {
  if (arr.length < 5) return null
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(Math.ceil(s.length * 0.95) - 1, s.length - 1)]
}

// ─── Environment info ───

function getEnvInfo() {
  const info = { timestamp: new Date().toISOString(), arch: process.arch, platform: process.platform }
  try { info.dockerVersion = execSync('docker version --format "{{.Server.Version}}"', { encoding: 'utf-8' }).trim() } catch { info.dockerVersion = 'unknown' }
  info.nodeVersion = process.version
  try {
    const cpuInfo = execSync('sysctl -n machdep.cpu.brand_string 2>/dev/null || lscpu 2>/dev/null | head -5', { encoding: 'utf-8' }).trim()
    info.cpu = cpuInfo.split('\n')[0]
  } catch {}
  try { info.totalMemoryGB = Math.round(totalmem() / 1024 / 1024 / 1024) } catch {}
  return info
}

function summarise(samples) {
  const validTimes = samples.filter(s => s.valid).map(s => s.totalMs)
  const allTimes = samples.filter(s => !s.error).map(s => s.totalMs)
  return {
    validCount: validTimes.length,
    totalCount: samples.length,
    medianMs: median(validTimes),
    p95Ms: p95(validTimes),
    minMs: validTimes.length ? Math.min(...validTimes) : null,
    maxMs: validTimes.length ? Math.max(...validTimes) : null,
    medianPolls: median(samples.map(s => s.polls || 0)),
    errors: samples.filter(s => s.error).length,
    timeouts: samples.filter(s => s.timeout).length,
    invalidVerdicts: samples.filter(s => !s.valid && !s.error && !s.timeout).length
  }
}

// ─── Main ───

async function main() {
  console.log('=== Judge Performance Benchmark ===\n')

  const env = getEnvInfo()
  console.log(`Host: ${env.platform}/${env.arch}, Docker ${env.dockerVersion}, Node ${env.nodeVersion}`)
  console.log(`CPU: ${env.cpu || 'unknown'}, Memory: ${env.totalMemoryGB || '?'} GB`)
  console.log(`Reps: ${REPS}, Warmup: ${WARMUP}, Cold: ${includeCold}`)
  console.log(`Fixtures: ${FIXTURES_DIR}\n`)

  // Health check
  try {
    const res = await fetch(`${BASE}/`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    console.log('Server health: OK\n')
  } catch (e) {
    console.error(`Server not reachable at ${BASE}: ${e.message}`)
    process.exit(1)
  }

  const problems = filterProblem ? [filterProblem] : BENCHMARK_PROBLEMS
  const languages = filterLang ? [filterLang] : LANGUAGES
  const allResults = []
  let hasFailures = false

  for (const problemId of problems) {
    const testCases = loadTestCases(problemId)
    const officialTestCount = countOfficialTests(problemId)
    console.log(`\n── ${problemId} (${testCases.length} sample, ${officialTestCount} hidden) ──`)

    for (const lang of languages) {
      const code = loadFixtureSolution(problemId, lang)
      if (!code) {
        console.log(`  ${lang}: no fixture, skipping`)
        continue
      }

      const scenario = { problemId, language: lang, sampleTests: testCases.length, hiddenTests: officialTestCount }

      // Warmup
      for (let w = 0; w < WARMUP; w++) {
        process.stdout.write(`  ${lang} warmup ${w + 1}/${WARMUP}...`)
        const wr = await timedRun(problemId, lang, code, testCases)
        if (!wr.valid) {
          console.log(` FAILED (${wr.error || 'wrong verdict'})`)
          console.error(`  *** Warmup failed for ${problemId}/${lang} — skipping this combination`)
          hasFailures = true
        } else {
          console.log(` ${wr.totalMs.toFixed(0)}ms`)
        }
      }

      // Run benchmark
      const runSamples = []
      for (let i = 0; i < REPS; i++) {
        process.stdout.write(`  ${lang} run ${i + 1}/${REPS}...`)
        const r = await timedRun(problemId, lang, code, testCases)
        runSamples.push(r)
        const tag = r.valid ? '' : r.error ? ` ERR(${r.error.substring(0, 60)})` : r.timeout ? ' TIMEOUT' : ' WRONG'
        console.log(` ${r.totalMs.toFixed(0)}ms${tag}`)
      }

      // Submit benchmark
      const submitSamples = []
      for (let i = 0; i < REPS; i++) {
        process.stdout.write(`  ${lang} submit ${i + 1}/${REPS}...`)
        const s = await timedSubmit(problemId, lang, code)
        submitSamples.push(s)
        const tag = s.valid ? ` (${s.totalTc} tests)` : s.error ? ` ERR(${s.error.substring(0, 60)})` : s.timeout ? ' TIMEOUT' : ' WRONG'
        console.log(` ${s.totalMs.toFixed(0)}ms${tag}`)
      }

      const runStats = summarise(runSamples)
      const submitStats = summarise(submitSamples)

      if (runStats.errors || runStats.invalidVerdicts) {
        console.log(`  *** ${lang} RUN: ${runStats.errors} errors, ${runStats.invalidVerdicts} wrong verdicts — excluded from timing`)
        hasFailures = true
      }
      if (submitStats.errors || submitStats.invalidVerdicts) {
        console.log(`  *** ${lang} SUB: ${submitStats.errors} errors, ${submitStats.invalidVerdicts} wrong verdicts — excluded from timing`)
        hasFailures = true
      }

      const result = { ...scenario, run: { samples: runSamples, ...runStats }, submit: { samples: submitSamples, ...submitStats } }
      allResults.push(result)

      if (runStats.medianMs != null) {
        console.log(`  ${lang} RUN  median=${runStats.medianMs.toFixed(0)}ms min=${runStats.minMs.toFixed(0)}ms max=${runStats.maxMs.toFixed(0)}ms (${runStats.validCount}/${runStats.totalCount} valid)`)
      }
      if (submitStats.medianMs != null) {
        console.log(`  ${lang} SUB  median=${submitStats.medianMs.toFixed(0)}ms min=${submitStats.minMs.toFixed(0)}ms max=${submitStats.maxMs.toFixed(0)}ms (${submitStats.validCount}/${submitStats.totalCount} valid)`)
      }
    }
  }

  // Summary table
  console.log('\n\n=== Summary (median ms, valid measurements only) ===\n')
  console.log('Problem'.padEnd(35) + 'Lang'.padEnd(8) + 'Run'.padStart(8) + 'Submit'.padStart(10) + '  Valid')
  console.log('-'.repeat(71))
  for (const r of allResults) {
    const runStr = r.run.medianMs != null ? r.run.medianMs.toFixed(0) : '---'
    const subStr = r.submit.medianMs != null ? r.submit.medianMs.toFixed(0) : '---'
    const validStr = `${r.run.validCount}/${r.run.totalCount} ${r.submit.validCount}/${r.submit.totalCount}`
    console.log(r.problemId.padEnd(35) + r.language.padEnd(8) + runStr.padStart(8) + subStr.padStart(10) + '  ' + validStr)
  }

  if (hasFailures) {
    console.log('\n*** Some measurements excluded due to errors, timeouts, or incorrect verdicts.')
    console.log('    Investigate before treating results as representative.\n')
  }

  const output = { env, config: { reps: REPS, warmup: WARMUP, cold: includeCold, pollIntervalMs: POLL_INTERVAL }, results: allResults }
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(output, null, 2))
    console.log(`\nResults written to ${jsonPath}`)
  }

  return output
}

main().catch(e => { console.error(e); process.exit(1) })
