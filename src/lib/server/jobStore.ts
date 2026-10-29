/**
 * TTL-bounded in-memory job store for Run and Submit endpoints.
 * Completed jobs are retained for COMPLETED_TTL_MS so polling retries
 * and repeated result reads work. A sweep runs every SWEEP_INTERVAL_MS.
 */

const COMPLETED_TTL_MS = 5 * 60 * 1000
const ACTIVE_TTL_MS = 10 * 60 * 1000
const SWEEP_INTERVAL_MS = 60 * 1000

export interface BaseJob {
  id: string
  status: string
  createdAt: number
  completedAt?: number
}

export class JobStore<T extends BaseJob> {
  private jobs = new Map<string, T>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.timer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS)
    if (this.timer.unref) this.timer.unref()
  }

  set(id: string, job: T): void {
    this.jobs.set(id, job)
  }

  get(id: string): T | undefined {
    return this.jobs.get(id)
  }

  markCompleted(job: T): void {
    job.completedAt = Date.now()
  }

  private sweep(): void {
    const now = Date.now()
    for (const [id, job] of this.jobs) {
      if (job.completedAt && now - job.completedAt > COMPLETED_TTL_MS) {
        this.jobs.delete(id)
      } else if (!job.completedAt && now - job.createdAt > ACTIVE_TTL_MS) {
        this.jobs.delete(id)
      }
    }
  }

  get size(): number {
    return this.jobs.size
  }

  destroy(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    this.jobs.clear()
  }
}

export function genJobId(): string {
  const g: any = globalThis as any
  if (g.crypto && typeof g.crypto.randomUUID === 'function') return g.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
