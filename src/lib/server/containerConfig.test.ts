import { describe, it, expect } from 'vitest'
import { cojudgeHostConfig, cojudgeDebugHostConfig } from './containerConfig'

describe('cojudgeHostConfig', () => {
  const config = cojudgeHostConfig()

  it('sets memory limit to 512 MB', () => {
    expect(config.Memory).toBe(512 * 1024 * 1024)
  })

  it('disables swap', () => {
    expect(config.MemorySwap).toBe(config.Memory)
  })

  it('limits to 1 CPU core', () => {
    expect(config.NanoCpus).toBe(1_000_000_000)
  })

  it('limits PIDs to 256', () => {
    expect(config.PidsLimit).toBe(256)
  })

  it('disables networking', () => {
    expect(config.NetworkMode).toBe('none')
  })

  it('drops all capabilities', () => {
    expect(config.CapDrop).toEqual(['ALL'])
  })

  it('prevents privilege escalation', () => {
    expect(config.SecurityOpt).toEqual(['no-new-privileges'])
  })
})

describe('cojudgeDebugHostConfig', () => {
  const config = cojudgeDebugHostConfig()

  it('has resource limits matching execution config', () => {
    expect(config.Memory).toBe(512 * 1024 * 1024)
    expect(config.NanoCpus).toBe(1_000_000_000)
    expect(config.PidsLimit).toBe(256)
  })

  it('does not restrict network mode', () => {
    expect(config).not.toHaveProperty('NetworkMode')
  })
})
