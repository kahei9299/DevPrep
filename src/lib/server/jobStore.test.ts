import { describe, it, expect, afterEach, vi } from 'vitest'
import { JobStore, genJobId } from './jobStore'

describe('genJobId', () => {
  it('returns a non-empty string', () => {
    expect(genJobId().length).toBeGreaterThan(0)
  })

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, genJobId))
    expect(ids.size).toBe(100)
  })
})

describe('JobStore', () => {
  type TestJob = { id: string; status: string; createdAt: number; completedAt?: number }
  let store: JobStore<TestJob>

  afterEach(() => {
    store?.destroy()
  })

  it('stores and retrieves jobs', () => {
    store = new JobStore()
    const job = { id: 'j1', status: 'running', createdAt: Date.now() }
    store.set('j1', job)
    expect(store.get('j1')).toBe(job)
  })

  it('returns undefined for unknown id', () => {
    store = new JobStore()
    expect(store.get('missing')).toBeUndefined()
  })

  it('markCompleted sets completedAt', () => {
    store = new JobStore()
    const job: TestJob = { id: 'j1', status: 'completed', createdAt: Date.now() }
    store.set('j1', job)
    store.markCompleted(job)
    expect(job.completedAt).toBeGreaterThan(0)
  })

  it('does not remove active jobs prematurely', () => {
    vi.useFakeTimers()
    store = new JobStore()
    const job = { id: 'j1', status: 'running', createdAt: Date.now() }
    store.set('j1', job)
    // Advance 2 minutes — active job should survive
    vi.advanceTimersByTime(2 * 60 * 1000)
    expect(store.get('j1')).toBe(job)
    vi.useRealTimers()
  })

  it('completed jobs survive polling retries for 5 minutes', () => {
    vi.useFakeTimers()
    store = new JobStore()
    const job = { id: 'j1', status: 'completed', createdAt: Date.now() }
    store.set('j1', job)
    store.markCompleted(job)
    // Advance 3 minutes — should still exist
    vi.advanceTimersByTime(3 * 60 * 1000)
    expect(store.get('j1')).toBe(job)
    vi.useRealTimers()
  })

  it('expires completed jobs after TTL', () => {
    vi.useFakeTimers()
    store = new JobStore()
    const job = { id: 'j1', status: 'completed', createdAt: Date.now() }
    store.set('j1', job)
    store.markCompleted(job)
    // Advance 6 minutes — should be swept
    vi.advanceTimersByTime(6 * 60 * 1000)
    expect(store.get('j1')).toBeUndefined()
    vi.useRealTimers()
  })

  it('expires stale active jobs after 10 minutes', () => {
    vi.useFakeTimers()
    store = new JobStore()
    const job = { id: 'j1', status: 'running', createdAt: Date.now() }
    store.set('j1', job)
    // Advance 11 minutes
    vi.advanceTimersByTime(11 * 60 * 1000)
    expect(store.get('j1')).toBeUndefined()
    vi.useRealTimers()
  })
})
