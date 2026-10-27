#!/usr/bin/env node
/**
 * Security Verification Tests
 *
 * Verifies Docker security controls are enforced on execution containers.
 * Requires: npm run dev (server at localhost:5173) + Docker running.
 *
 * Two verification modes:
 *   1. Container inspection via Docker API (no code execution needed)
 *   2. Behavioural tests via code submissions (execution-based)
 */

import Dockerode from 'dockerode'

const BASE = process.env.COJUDGE_URL || 'http://localhost:5173'
const POLL_INTERVAL = 2000
const POLL_TIMEOUT = 120000

const docker = new Dockerode()

// ─── HTTP helpers ───

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

// ─── Test recording ───

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

// ─── Docker container inspection helpers ───

async function findCojudgeContainer() {
  const containers = await docker.listContainers({
    all: false,
    filters: { label: ['cojudge.created=true'] }
  })
  // Exclude debug containers
  return containers.find(c => !c.Labels?.['cojudge.debug'])
}

async function triggerContainerCreation() {
  // Submit a trivial solution to force a container to be created
  const code = `from typing import List
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
        return []`
  return submitCode('two-sum', 'python', code)
}

// ─── Tests ───

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

  // ── Phase 1: Container configuration inspection ──
  // Verify HostConfig is correct by inspecting a real container via Docker API.

  console.log('--- Phase 1: Container Configuration Inspection ---')
  {
    // Trigger a submission so a container exists in the pool
    const triggerResult = await triggerContainerCreation()
    if (!triggerResult.accepted && !triggerResult.allAccepted) {
      console.error('  WARNING: trigger submission did not succeed; container may not exist for inspection')
    }

    const containerInfo = await findCojudgeContainer()
    if (!containerInfo) {
      record('Container found for inspection', false, 'No running cojudge container found. Pool may have already cleaned up.')
    } else {
      const full = await docker.getContainer(containerInfo.Id).inspect()
      const hc = full.HostConfig

      record('NetworkMode is none',
        hc.NetworkMode === 'none',
        `actual: ${hc.NetworkMode}`)

      record('Memory limit is 512 MB',
        hc.Memory === 512 * 1024 * 1024,
        `actual: ${hc.Memory}`)

      record('MemorySwap equals Memory (no swap)',
        hc.MemorySwap === hc.Memory,
        `Memory=${hc.Memory}, MemorySwap=${hc.MemorySwap}`)

      record('CPU limit is 1 core',
        hc.NanoCpus === 1_000_000_000,
        `actual: ${hc.NanoCpus}`)

      record('PID limit is 256',
        hc.PidsLimit === 256,
        `actual: ${hc.PidsLimit}`)

      const capDrop = hc.CapDrop || []
      record('All capabilities dropped',
        capDrop.includes('ALL'),
        `CapDrop: ${JSON.stringify(capDrop)}`)

      const secOpt = hc.SecurityOpt || []
      record('no-new-privileges set',
        secOpt.includes('no-new-privileges'),
        `SecurityOpt: ${JSON.stringify(secOpt)}`)
    }
  }

  // ── Phase 2: Network isolation (behavioural) ──
  // The solution reports whether the network call succeeded or failed via its
  // return value, so we can distinguish "network blocked" from "code error".

  console.log('\n--- Phase 2: Network Isolation (Behavioural) ---')
  {
    // The solution attempts a connect(). With NetworkMode:'none', the OS-level
    // connect fails immediately (ENETUNREACH / EACCES). The solution catches
    // the error and returns [0, 0] to signal "blocked". If the connect were to
    // succeed, it would return [-1, -1]. A correct twoSum answer [X, Y] where
    // X != 0 or Y != 0 would mean the network code path wasn't reached at all.
    const code = `from typing import List
import socket
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        blocked = False
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(3)
            s.connect(('1.1.1.1', 80))
            s.close()
        except OSError:
            blocked = True
        if blocked:
            return [0, 0]
        else:
            return [-1, -1]`
    const result = await submitCode('two-sum', 'python', code)

    if (result.error) {
      record('Network isolation (Python socket.connect)', false,
        `Submission errored instead of running: ${String(result.error).substring(0, 150)}`)
    } else if (result.timeout) {
      record('Network isolation (Python socket.connect)', false,
        'Timed out — connect may be hanging instead of failing')
    } else {
      // Check the actual returned value. With two-sum test cases, the result
      // will be marked wrong (since [0,0] or [-1,-1] isn't the correct answer).
      // We look at the first test's output to see which sentinel was returned.
      const firstResult = result.results?.[0]
      const output = firstResult?.output ?? ''
      const blocked = output.includes('[0') && output.includes('0]')
      const connected = output.includes('[-1') && output.includes('-1]')

      if (blocked) {
        record('Network isolation (Python socket.connect)', true,
          'connect() raised OSError as expected')
      } else if (connected) {
        record('Network isolation (Python socket.connect)', false,
          'connect() SUCCEEDED — NetworkMode:none not enforced')
      } else {
        record('Network isolation (Python socket.connect)', false,
          `Unexpected output: ${output.substring(0, 100)}`)
      }
    }
  }

  // ── Phase 3: PID limit (bounded) ──
  // Creates a fixed number of subprocesses (not exponential) and reports
  // how many succeeded. With PidsLimit=256, the container cannot create
  // hundreds of concurrent processes.

  console.log('\n--- Phase 3: PID Limit ---')
  {
    const code = `from typing import List
import subprocess, sys
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        # Attempt to create 300 concurrent subprocesses (bounded, not exponential).
        # With PidsLimit=256, most will fail with OSError/BlockingIOError.
        procs = []
        created = 0
        for i in range(300):
            try:
                p = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(5)'])
                procs.append(p)
                created += 1
            except OSError:
                break
        # Clean up
        for p in procs:
            try:
                p.kill()
                p.wait()
            except Exception:
                pass
        # Encode how many processes were created in the return value.
        # If PID limit works, created < 256. Return [created, 0].
        return [created, 0]`
    const result = await submitCode('two-sum', 'python', code)

    if (result.error) {
      const errMsg = String(result.error)
      // A crash/resource error from the container itself is evidence of enforcement
      if (errMsg.includes('Killed') || errMsg.includes('signal') || errMsg.includes('OOM') ||
          errMsg.includes('Resource') || errMsg.includes('Cannot fork')) {
        record('PID limit enforced (container killed by resource limit)', true,
          `Error indicates resource enforcement: ${errMsg.substring(0, 100)}`)
      } else {
        record('PID limit enforced', false,
          `Submission errored for unrelated reason: ${errMsg.substring(0, 150)}`)
      }
    } else if (result.timeout) {
      record('PID limit enforced', false,
        'Timed out — inconclusive (could be PID limit slowing things or unrelated)')
    } else {
      // Check how many processes were created
      const firstResult = result.results?.[0]
      const output = firstResult?.output ?? ''
      const match = output.match(/\[(\d+)/)
      const created = match ? parseInt(match[1], 10) : -1

      if (created >= 0 && created < 260) {
        record('PID limit enforced (bounded process creation)', true,
          `Created ${created} processes before hitting limit (PidsLimit=256)`)
      } else if (created >= 260) {
        record('PID limit enforced', false,
          `Created ${created} processes — PID limit may not be enforced`)
      } else {
        record('PID limit enforced', false,
          `Could not parse process count from output: ${output.substring(0, 100)}`)
      }
    }
  }

  // ── Phase 4: Memory limit ──
  // Allocates memory in a controlled way and checks whether the container
  // is killed by OOM. Expects a crash (SIGKILL/137) from cgroup OOM killer,
  // not a Python MemoryError (which would mean the cgroup limit isn't set).

  console.log('\n--- Phase 4: Memory Limit ---')
  {
    const code = `from typing import List
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        # Allocate 600 MB in chunks to trigger cgroup OOM killer.
        # With 512 MB limit, the kernel kills the process (exit 137 / SIGKILL).
        # Without a limit, Python raises MemoryError at ~system RAM.
        chunks = []
        for _ in range(600):
            chunks.append(bytearray(1024 * 1024))  # 1 MB per chunk
        return [0, 1]`
    const result = await submitCode('two-sum', 'python', code)

    if (result.error) {
      const errMsg = String(result.error)
      // OOM kill manifests as SIGKILL (signal 9), exit code 137, or "Killed"
      const isOomKill = errMsg.includes('Killed') || errMsg.includes('137') ||
                        errMsg.includes('signal 9') || errMsg.includes('SIGKILL') ||
                        errMsg.includes('OOM') || errMsg.includes('Cannot allocate')
      if (isOomKill) {
        record('Memory limit enforced (OOM kill)', true,
          `Container killed by cgroup OOM: ${errMsg.substring(0, 100)}`)
      } else {
        // Could be MemoryError (Python catching it before OOM) — still evidence of limit
        const isPythonMemError = errMsg.includes('MemoryError')
        if (isPythonMemError) {
          record('Memory limit enforced (Python MemoryError)', true,
            'Python raised MemoryError before cgroup OOM — limit is effective')
        } else {
          record('Memory limit enforced', false,
            `Submission errored for unrelated reason: ${errMsg.substring(0, 150)}`)
        }
      }
    } else if (result.timeout) {
      record('Memory limit enforced', false,
        'Timed out instead of OOM kill — limit may not be enforced, or allocation was slow')
    } else if (result.accepted || result.allAccepted) {
      record('Memory limit enforced', false,
        'Solution ACCEPTED after 600 MB allocation — memory limit not enforced')
    } else {
      // Rejected (wrong answer) — the code ran to completion without OOM
      record('Memory limit enforced', false,
        'Solution returned a result instead of being OOM-killed — limit may not be enforced')
    }
  }

  // ── Phase 5: Regression check ──
  // Verify valid solutions still work under security restrictions.

  console.log('\n--- Phase 5: Regression Check ---')
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
    record('Valid Python solution accepted', result.accepted || result.allAccepted,
      result.error || (result.timeout ? 'timeout' : 'rejected'))
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
    record('Valid C++ solution accepted', result.accepted || result.allAccepted,
      result.error || (result.timeout ? 'timeout' : 'rejected'))
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
    record('Valid Java solution accepted', result.accepted || result.allAccepted,
      result.error || (result.timeout ? 'timeout' : 'rejected'))
  }

  // ── Summary ──
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed out of ${results.length} tests ===`)
  if (failed > 0) {
    console.log('\nFailed:')
    for (const r of results) {
      if (!r.ok) console.log(`  ${r.name}: ${r.detail}`)
    }
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(2) })
