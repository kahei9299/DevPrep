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
