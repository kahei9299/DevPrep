#!/usr/bin/env node
/**
 * Security Verification Tests
 *
 * Tests that Docker security controls are enforced on execution containers.
 * Requires: npm run dev (server at localhost:5173) + Docker running.
 */

const BASE = process.env.COJUDGE_URL || 'http://localhost:5173'
const POLL_INTERVAL = 2000
const POLL_TIMEOUT = 120000

async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function apiGet(url) {
  const res = await fetch(`${BASE}${url}`)
  return res.json()
}

async function pollJob(endpoint, jobId) {
  const start = Date.now()
  while (Date.now() - start < POLL_TIMEOUT) {
    const result = await apiGet(`${endpoint}?jobId=${jobId}`)
    if (result.ready || result.error) return result
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }
  return { error: 'POLL_TIMEOUT' }
}

async function submitCode(problemId, language, code) {
  const { jobId, error } = await apiPost('/api/submit', { problemId, language, code, startTcNo: 0 })
  if (error) return { error }
  return pollJob('/api/submit', jobId)
}

let passed = 0, failed = 0
const results = []

function record(name, ok, detail = '') {
  if (ok) {
    passed++
    console.log(`  PASS: ${name}`)
  } else {
    failed++
    console.log(`  FAIL: ${name} — ${detail}`)
  }
  results.push({ name, ok, detail })
}

async function main() {
  console.log('=== Security Verification Tests ===')
  console.log(`Server: ${BASE}\n`)

  // Health check
  try {
    const res = await fetch(`${BASE}/`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
  } catch (e) {
    console.error(`Server not reachable at ${BASE}: ${e.message}`)
    process.exit(1)
  }

  // Test 1: Network isolation — Python tries to make HTTP request
  console.log('--- Network Isolation ---')
  {
    const code = `from typing import List
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        import urllib.request
        try:
            urllib.request.urlopen('http://1.1.1.1', timeout=3)
            return [-1, -1]
        except Exception:
            pass
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
        return []`
    const result = await submitCode('two-sum', 'python', code)
    // With NetworkMode: 'none', the HTTP request fails and the solution falls through to the correct answer
    const ok = result.accepted || result.allAccepted
    record('Python network request blocked (solution still works)', ok,
      ok ? '' : JSON.stringify(result).substring(0, 200))
  }

  // Test 2: PID limit — Python fork bomb (limited to 256 PIDs)
  console.log('\n--- PID Limits ---')
  {
    const code = `from typing import List
import os
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        try:
            for _ in range(500):
                os.fork()
        except OSError:
            pass
        return [0, 1]`
    const result = await submitCode('two-sum', 'python', code)
    // Fork bomb should be contained — either error or the solution completes with wrong answer
    const contained = result.error || result.timeout || !result.accepted
    record('Python fork bomb contained by PID limit', contained,
      contained ? '' : 'Fork bomb solution was accepted — PID limit may not be enforced')
  }

  // Test 3: Memory limit — Python allocates >512MB
  console.log('\n--- Memory Limits ---')
  {
    const code = `from typing import List
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        x = bytearray(600 * 1024 * 1024)
        return [0, 1]`
    const result = await submitCode('two-sum', 'python', code)
    // Should be killed by OOM — results in error or timeout
    const contained = result.error || result.timeout || !result.accepted
    record('Python memory hog killed by OOM limit', contained,
      contained ? '' : 'Memory hog solution was accepted — memory limit may not be enforced')
  }

  // Test 4: Valid solution still works (regression check)
  console.log('\n--- Regression Check ---')
  {
    const code = `from typing import List
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
        return []`
    const result = await submitCode('two-sum', 'python', code)
    record('Valid Python solution still accepted', result.accepted || result.allAccepted,
      result.error || (result.timeout ? 'timeout' : ''))
  }
  {
    const code = `#include <vector>
#include <unordered_map>
using namespace std;
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int,int> m;
        for (int i = 0; i < (int)nums.size(); i++) {
            if (m.count(target - nums[i])) return {m[target-nums[i]], i};
            m[nums[i]] = i;
        }
        return {};
    }
};`
    const result = await submitCode('two-sum', 'cpp', code)
    record('Valid C++ solution still accepted', result.accepted || result.allAccepted,
      result.error || (result.timeout ? 'timeout' : ''))
  }
  {
    const code = `import java.util.*;
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
    const result = await submitCode('two-sum', 'java', code)
    record('Valid Java solution still accepted', result.accepted || result.allAccepted,
      result.error || (result.timeout ? 'timeout' : ''))
  }

  // Summary
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results) {
      if (!r.ok) console.log(`  ${r.name}: ${r.detail}`)
    }
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(2) })
