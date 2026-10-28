/**
 * Development-only performance instrumentation.
 * Disabled by default; enable via COJUDGE_PERF=1 environment variable.
 * Logs pipeline stage timings to help identify latency bottlenecks.
 *
 * Never logs user code or hidden-test data — only stage names and durations.
 */

const ENABLED = process.env.COJUDGE_PERF === '1'

export interface PerfTrace {
  id: string
  type: 'run' | 'submit'
  stages: { name: string; ms: number }[]
  totalMs: number
  language: string
  problemId: string
  outcome: 'ok' | 'error' | 'timeout'
}

export class PerfTimer {
  private stages: { name: string; start: number; end?: number }[] = []
  private current: { name: string; start: number } | null = null
  private readonly startTime: number
  readonly id: string
  readonly type: 'run' | 'submit'
  readonly language: string
  readonly problemId: string

  constructor(type: 'run' | 'submit', problemId: string, language: string, id: string) {
    this.startTime = performance.now()
    this.type = type
    this.problemId = problemId
    this.language = language
    this.id = id
  }

  stage(name: string): void {
    if (!ENABLED) return
    if (this.current) {
      this.stages.push({ ...this.current, end: performance.now() })
    }
    this.current = { name, start: performance.now() }
  }

  end(outcome: 'ok' | 'error' | 'timeout' = 'ok'): PerfTrace | null {
    if (!ENABLED) return null
    if (this.current) {
      this.stages.push({ ...this.current, end: performance.now() })
      this.current = null
    }
    const totalMs = performance.now() - this.startTime
    const trace: PerfTrace = {
      id: this.id,
      type: this.type,
      language: this.language,
      problemId: this.problemId,
      stages: this.stages.map(s => ({ name: s.name, ms: (s.end ?? performance.now()) - s.start })),
      totalMs,
      outcome
    }
    const stageStr = trace.stages.map(s => `${s.name}=${s.ms.toFixed(0)}ms`).join(' ')
    const outcomeTag = outcome !== 'ok' ? ` [${outcome}]` : ''
    console.log(`[perf] ${this.type} ${this.problemId}/${this.language} ${totalMs.toFixed(0)}ms${outcomeTag} | ${stageStr}`)
    return trace
  }
}
