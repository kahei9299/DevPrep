export function cojudgeHostConfig() {
  return {
    Memory: 512 * 1024 * 1024,
    MemorySwap: 512 * 1024 * 1024,
    NanoCpus: 1_000_000_000,
    PidsLimit: 256,
    NetworkMode: 'none' as const,
    CapDrop: ['ALL'],
    SecurityOpt: ['no-new-privileges'],
  }
}

// Debug containers omit NetworkMode:'none' because DebugRunner installs
// debugger packages at runtime (GDB via apt-get for C++, Delve via go install
// for Go). These containers are only created during interactive debug sessions,
// never for submission grading. They still get resource limits, capability
// dropping, and no-new-privileges. Debug containers are labelled
// 'cojudge.debug=true' and have a shorter cleanup timeout (5 minutes).
// Risk: user code in a debug session can make network requests. Acceptable
// for single-user local use where the user already has full host access.
export function cojudgeDebugHostConfig() {
  return {
    Memory: 512 * 1024 * 1024,
    MemorySwap: 512 * 1024 * 1024,
    NanoCpus: 1_000_000_000,
    PidsLimit: 256,
    CapDrop: ['ALL'],
    SecurityOpt: ['no-new-privileges'],
  }
}
