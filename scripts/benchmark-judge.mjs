#!/usr/bin/env node
/**
 * Judge Performance Benchmark
 *
 * Measures end-to-end latency for Run and Submit across Python, C++, and Java.
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

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BASE = process.env.COJUDGE_URL || 'http://localhost:5173'
const POLL_INTERVAL = 100
const POLL_TIMEOUT = 120_000

// ─── CLI args ───

const args = process.argv.slice(2)
function getArg(name) {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 ? args[idx + 1] : null
}
const filterProblem = getArg('problem')
const filterLang = getArg('lang')
const REPS = parseInt(getArg('reps') || '5', 10)
const WARMUP = parseInt(getArg('warmup') || '2', 10)
const includeCold = args.includes('--cold')
const jsonPath = getArg('json')

// ─── Solutions for benchmark problems ───

const SOLUTIONS = {
  'two-sum': {
    python: `from typing import List
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
        return []`,
    cpp: `#include <vector>
#include <unordered_map>
using namespace std;
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int,int> m;
        for (int i = 0; i < nums.size(); i++) {
            if (m.count(target - nums[i])) return {m[target-nums[i]], i};
            m[nums[i]] = i;
        }
        return {};
    }
};`,
    java: `import java.util.*;
class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer,Integer> m = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            if (m.containsKey(target - nums[i])) return new int[]{m.get(target-nums[i]), i};
            m.put(nums[i], i);
        }
        return new int[]{};
    }
}`
  },
  'binary-search': {
    python: `from typing import List
class Solution:
    def search(self, nums: List[int], target: int) -> int:
        lo, hi = 0, len(nums) - 1
        while lo <= hi:
            mid = (lo + hi) // 2
            if nums[mid] == target: return mid
            elif nums[mid] < target: lo = mid + 1
            else: hi = mid - 1
        return -1`,
    cpp: `#include <vector>
using namespace std;
class Solution {
public:
    int search(vector<int>& nums, int target) {
        int lo = 0, hi = nums.size() - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (nums[mid] == target) return mid;
            else if (nums[mid] < target) lo = mid + 1;
            else hi = mid - 1;
        }
        return -1;
    }
};`,
    java: `class Solution {
    public int search(int[] nums, int target) {
        int lo = 0, hi = nums.length - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;
            if (nums[mid] == target) return mid;
            else if (nums[mid] < target) lo = mid + 1;
            else hi = mid - 1;
        }
        return -1;
    }
}`
  },
  'group-anagrams': {
    python: `from typing import List
class Solution:
    def groupAnagrams(self, strs: List[str]) -> List[List[str]]:
        d = {}
        for s in strs:
            k = ''.join(sorted(s))
            d.setdefault(k, []).append(s)
        return list(d.values())`,
    cpp: `#include <vector>
#include <string>
#include <unordered_map>
#include <algorithm>
using namespace std;
class Solution {
public:
    vector<vector<string>> groupAnagrams(vector<string>& strs) {
        unordered_map<string, vector<string>> m;
        for (auto& s : strs) { string k = s; sort(k.begin(), k.end()); m[k].push_back(s); }
        vector<vector<string>> res;
        for (auto& [_, v] : m) res.push_back(v);
        return res;
    }
};`,
    java: `import java.util.*;
class Solution {
    public List<List<String>> groupAnagrams(String[] strs) {
        Map<String, List<String>> m = new HashMap<>();
        for (String s : strs) {
            char[] c = s.toCharArray();
            Arrays.sort(c);
            String k = new String(c);
            m.computeIfAbsent(k, x -> new ArrayList<>()).add(s);
        }
        return new ArrayList<>(m.values());
    }
}`
  },
  'lru-cache': {
    python: `class LRUCache:
    def __init__(self, capacity: int):
        from collections import OrderedDict
        self.cap = capacity
        self.d = OrderedDict()
    def get(self, key: int) -> int:
        if key not in self.d: return -1
        self.d.move_to_end(key)
        return self.d[key]
    def put(self, key: int, value: int) -> None:
        if key in self.d: self.d.move_to_end(key)
        self.d[key] = value
        if len(self.d) > self.cap: self.d.popitem(last=False)`,
    cpp: `#include <unordered_map>
#include <list>
using namespace std;
class LRUCache {
    int cap;
    list<pair<int,int>> lst;
    unordered_map<int, list<pair<int,int>>::iterator> m;
public:
    LRUCache(int capacity) : cap(capacity) {}
    int get(int key) {
        if (!m.count(key)) return -1;
        lst.splice(lst.end(), lst, m[key]);
        return m[key]->second;
    }
    void put(int key, int value) {
        if (m.count(key)) { lst.splice(lst.end(), lst, m[key]); m[key]->second = value; return; }
        if ((int)lst.size() == cap) { m.erase(lst.front().first); lst.pop_front(); }
        lst.push_back({key, value});
        m[key] = prev(lst.end());
    }
};`,
    java: `import java.util.*;
class LRUCache {
    int cap;
    LinkedHashMap<Integer,Integer> m;
    public LRUCache(int capacity) {
        cap = capacity;
        m = new LinkedHashMap<>(capacity, 0.75f, true) {
            protected boolean removeEldestEntry(Map.Entry e) { return size() > cap; }
        };
    }
    public int get(int key) { return m.getOrDefault(key, -1); }
    public void put(int key, int value) { m.put(key, value); }
}`
  },
  'minimum-window-substring': {
    python: `class Solution:
    def minWindow(self, s: str, t: str) -> str:
        from collections import Counter
        need = Counter(t)
        missing = len(t)
        lo = start = end = 0
        for hi, c in enumerate(s, 1):
            if need[c] > 0: missing -= 1
            need[c] -= 1
            if missing == 0:
                while need[s[lo]] < 0:
                    need[s[lo]] += 1
                    lo += 1
                if not end or hi - lo <= end - start:
                    start, end = lo, hi
                need[s[lo]] += 1
                missing += 1
                lo += 1
        return s[start:end]`,
    cpp: `#include <string>
#include <unordered_map>
using namespace std;
class Solution {
public:
    string minWindow(string s, string t) {
        unordered_map<char,int> need;
        for (char c : t) need[c]++;
        int missing = t.size(), lo = 0, start = 0, len = INT_MAX;
        for (int hi = 0; hi < (int)s.size(); hi++) {
            if (need[s[hi]]-- > 0) missing--;
            while (!missing) {
                if (hi - lo + 1 < len) { len = hi - lo + 1; start = lo; }
                if (++need[s[lo++]] > 0) missing++;
            }
        }
        return len == INT_MAX ? "" : s.substr(start, len);
    }
};`,
    java: `class Solution {
    public String minWindow(String s, String t) {
        int[] need = new int[128];
        for (char c : t.toCharArray()) need[c]++;
        int missing = t.length(), lo = 0, start = 0, len = Integer.MAX_VALUE;
        for (int hi = 0; hi < s.length(); hi++) {
            if (need[s.charAt(hi)]-- > 0) missing--;
            while (missing == 0) {
                if (hi - lo + 1 < len) { len = hi - lo + 1; start = lo; }
                if (++need[s.charAt(lo++)] > 0) missing++;
            }
        }
        return len == Integer.MAX_VALUE ? "" : s.substring(start, start + len);
    }
}`
  }
}

const LANGUAGES = ['python', 'cpp', 'java']

// ─── API helpers ───

async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`)
  return { status: res.status, ...(await res.json()) }
}

async function pollJob(endpoint, jobId) {
  const start = Date.now()
  let polls = 0
  while (Date.now() - start < POLL_TIMEOUT) {
    const result = await apiGet(`${endpoint}?jobId=${jobId}`)
    polls++
    if (result.ready || result.error) return { ...result, polls, pollTimeMs: Date.now() - start }
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }
  return { error: 'POLL_TIMEOUT', polls, pollTimeMs: Date.now() - start }
}

// ─── Timed run/submit ───

async function timedRun(problemId, language, code, testCases) {
  const t0 = performance.now()
  const postResult = await apiPost('/api/run', { problemId, language, code, testCases })
  const tPost = performance.now()
  if (postResult.error || !postResult.jobId) {
    return { error: postResult.error || 'No jobId', totalMs: performance.now() - t0 }
  }
  const result = await pollJob('/api/run', postResult.jobId)
  const tDone = performance.now()
  return {
    totalMs: tDone - t0,
    postMs: tPost - t0,
    pollMs: tDone - tPost,
    polls: result.polls,
    executionTimeMs: result.executionTimeMs,
    memoryKB: result.memoryKB,
    passed: Array.isArray(result.results) && result.results.every(r => r.isCorrect),
    timeout: !!result.timeout,
    error: result.error || null
  }
}

async function timedSubmit(problemId, language, code) {
  const t0 = performance.now()
  const postResult = await apiPost('/api/submit', { problemId, language, code, startTcNo: 0 })
  const tPost = performance.now()
  if (postResult.error || !postResult.jobId) {
    return { error: postResult.error || 'No jobId', totalMs: performance.now() - t0 }
  }
  const result = await pollJob('/api/submit', postResult.jobId)
  const tDone = performance.now()
  return {
    totalMs: tDone - t0,
    postMs: tPost - t0,
    pollMs: tDone - tPost,
    polls: result.polls,
    allAccepted: !!result.allAccepted,
    totalTc: result.totalTc,
    passedTc: result.passedTc,
    executionTimeMs: result.executionTimeMs,
    memoryKB: result.memoryKB,
    timeout: !!result.timeout,
    error: result.error || null
  }
}

// ─── Statistics ───

function median(arr) {
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function p95(arr) {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(Math.ceil(s.length * 0.95) - 1, s.length - 1)]
}

// ─── Environment info ───

function getEnvInfo() {
  const info = { timestamp: new Date().toISOString(), arch: process.arch, platform: process.platform }
  try { info.dockerVersion = execSync('docker version --format "{{.Server.Version}}"', { encoding: 'utf-8' }).trim() } catch { info.dockerVersion = 'unknown' }
  try { info.nodeVersion = process.version } catch {}
  try {
    const cpuInfo = execSync('sysctl -n machdep.cpu.brand_string 2>/dev/null || cat /proc/cpuinfo 2>/dev/null | head -5', { encoding: 'utf-8' }).trim()
    info.cpu = cpuInfo.split('\n')[0]
  } catch {}
  try { info.totalMemoryGB = Math.round(require('os').totalmem() / 1024 / 1024 / 1024) } catch {}
  return info
}

// ─── Load test cases from problem metadata ───

function loadTestCases(problemId) {
  const metaPath = join(__dirname, '..', 'problems', problemId, 'metadata.json')
  if (!existsSync(metaPath)) return []
  const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
  return meta.testCases || []
}

function countOfficialTests(problemId) {
  const testsPath = join(__dirname, '..', 'problems', problemId, 'official-tests.json')
  if (!existsSync(testsPath)) return 0
  return JSON.parse(readFileSync(testsPath, 'utf-8')).length
}

// ─── Main ───

async function main() {
  console.log('=== Judge Performance Benchmark ===\n')

  const env = getEnvInfo()
  console.log(`Host: ${env.platform}/${env.arch}, Docker ${env.dockerVersion}, Node ${env.nodeVersion}`)
  console.log(`CPU: ${env.cpu || 'unknown'}, Memory: ${env.totalMemoryGB || '?'} GB`)
  console.log(`Reps: ${REPS}, Warmup: ${WARMUP}, Cold: ${includeCold}\n`)

  const problems = filterProblem ? [filterProblem] : Object.keys(SOLUTIONS)
  const languages = filterLang ? [filterLang] : LANGUAGES
  const allResults = []

  for (const problemId of problems) {
    const testCases = loadTestCases(problemId)
    const officialTestCount = countOfficialTests(problemId)
    console.log(`\n── ${problemId} (${testCases.length} sample, ${officialTestCount} hidden) ──`)

    for (const lang of languages) {
      const code = SOLUTIONS[problemId]?.[lang]
      if (!code) { console.log(`  ${lang}: no solution, skipping`); continue }

      const scenario = { problemId, language: lang, sampleTests: testCases.length, hiddenTests: officialTestCount }

      // Warmup
      for (let w = 0; w < WARMUP; w++) {
        process.stdout.write(`  ${lang} warmup ${w + 1}/${WARMUP}...`)
        await timedRun(problemId, lang, code, testCases)
        console.log(' done')
      }

      // Run benchmark
      const runSamples = []
      for (let i = 0; i < REPS; i++) {
        process.stdout.write(`  ${lang} run ${i + 1}/${REPS}...`)
        const r = await timedRun(problemId, lang, code, testCases)
        runSamples.push(r)
        console.log(` ${r.totalMs.toFixed(0)}ms${r.passed ? '' : ' FAIL'}${r.error ? ` (${r.error})` : ''}`)
      }

      // Submit benchmark
      const submitSamples = []
      for (let i = 0; i < REPS; i++) {
        process.stdout.write(`  ${lang} submit ${i + 1}/${REPS}...`)
        const s = await timedSubmit(problemId, lang, code)
        submitSamples.push(s)
        console.log(` ${s.totalMs.toFixed(0)}ms${s.allAccepted ? '' : ' FAIL'}${s.error ? ` (${s.error})` : ''}`)
      }

      const runTimes = runSamples.filter(r => !r.error).map(r => r.totalMs)
      const submitTimes = submitSamples.filter(s => !s.error).map(s => s.totalMs)

      const result = {
        ...scenario,
        run: {
          samples: runSamples,
          medianMs: runTimes.length ? median(runTimes) : null,
          p95Ms: runTimes.length >= 5 ? p95(runTimes) : null,
          minMs: runTimes.length ? Math.min(...runTimes) : null,
          maxMs: runTimes.length ? Math.max(...runTimes) : null,
          medianPolls: runSamples.length ? median(runSamples.map(r => r.polls || 0)) : null,
          errors: runSamples.filter(r => r.error).length
        },
        submit: {
          samples: submitSamples,
          medianMs: submitTimes.length ? median(submitTimes) : null,
          p95Ms: submitTimes.length >= 5 ? p95(submitTimes) : null,
          minMs: submitTimes.length ? Math.min(...submitTimes) : null,
          maxMs: submitTimes.length ? Math.max(...submitTimes) : null,
          medianPolls: submitSamples.length ? median(submitSamples.map(s => s.polls || 0)) : null,
          errors: submitSamples.filter(s => s.error).length
        }
      }
      allResults.push(result)

      if (runTimes.length) {
        console.log(`  ${lang} RUN  median=${median(runTimes).toFixed(0)}ms min=${Math.min(...runTimes).toFixed(0)}ms max=${Math.max(...runTimes).toFixed(0)}ms`)
      }
      if (submitTimes.length) {
        console.log(`  ${lang} SUB  median=${median(submitTimes).toFixed(0)}ms min=${Math.min(...submitTimes).toFixed(0)}ms max=${Math.max(...submitTimes).toFixed(0)}ms`)
      }
    }
  }

  // Summary table
  console.log('\n\n=== Summary (median ms) ===\n')
  console.log('Problem'.padEnd(35) + 'Lang'.padEnd(8) + 'Run'.padStart(8) + 'Submit'.padStart(10))
  console.log('-'.repeat(61))
  for (const r of allResults) {
    const runStr = r.run.medianMs != null ? r.run.medianMs.toFixed(0) : 'ERR'
    const subStr = r.submit.medianMs != null ? r.submit.medianMs.toFixed(0) : 'ERR'
    console.log(r.problemId.padEnd(35) + r.language.padEnd(8) + runStr.padStart(8) + subStr.padStart(10))
  }

  const output = { env, config: { reps: REPS, warmup: WARMUP, cold: includeCold, pollIntervalMs: POLL_INTERVAL }, results: allResults }
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(output, null, 2))
    console.log(`\nResults written to ${jsonPath}`)
  }

  return output
}

main().catch(e => { console.error(e); process.exit(1) })
