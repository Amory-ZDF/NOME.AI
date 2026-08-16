/**
 * Insights data access — read-only PostgreSQL access to the tables the
 * long-term-memory Agent (Python `profile` layer) writes into the shared `nome`
 * DB. This is the "two ends talk through the database" bridge: the Teacher
 * portal reads the SAME rows the agent organized, no in-memory mock.
 *
 * Tables (owned by Python profile/store.py):
 *   student_profiles, student_tags, teacher_reports, student_events
 */

import { Pool } from 'pg'

export interface InsightStudent {
  id: string
  name: string
  accuracy: number | null
  totalAnswered: number
  pressureIndex: number | null
  activeDays: number
  recentNarrative: string | null
  nextFocus: string | null
  intervention: string | null
}

export interface InsightTag {
  id: string
  studentId: string
  label: string
  category: string
  confidence: number
  evidence: string
  status: string
  updatedAt: string
}

export interface InsightReport {
  id: string
  studentId: string
  period: string
  summary: string
  createdAt: string
}

const STUDENT_NAME_MAP: Record<string, string> = {
  'stu-001': '李明',
  'stu-002': '王雅静',
  'stu-003': '赵子豪',
  'stu-004': '陈思雨',
  'stu-005': '刘一帆',
}

// `pg` returns TIMESTAMPTZ columns as JS `Date`; the Zod response schemas
// expect ISO strings, so normalize here at the data boundary.
function toIsoString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export class InsightsRepo {
  private pool: Pool | null = null

  constructor(private readonly url: string | undefined) {}

  get enabled(): boolean {
    return Boolean(this.url)
  }

  async connect(): Promise<void> {
    if (!this.url) return
    this.pool = new Pool({ connectionString: this.url, max: 5 })
    // Validate the connection once at startup.
    await this.pool.query('SELECT 1')
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
      this.pool = null
    }
  }

  private requirePool(): Pool {
    if (!this.pool) throw new Error('InsightsRepo is not connected')
    return this.pool
  }

  async listStudents(): Promise<InsightStudent[]> {
    const pool = this.requirePool()
    const { rows } = await pool.query(
      `SELECT student_id, accuracy, total_answered, pressure_index, active_days,
              recent_narrative, next_focus, intervention
       FROM student_profiles
       ORDER BY student_id`,
    )
    return rows.map((r) => ({
      id: r.student_id,
      name: STUDENT_NAME_MAP[r.student_id] ?? r.student_id,
      accuracy: r.accuracy,
      totalAnswered: r.total_answered,
      pressureIndex: r.pressure_index,
      activeDays: r.active_days,
      recentNarrative: r.recent_narrative,
      nextFocus: r.next_focus,
      intervention: r.intervention,
    }))
  }

  async getStudent(studentId: string): Promise<InsightStudent | null> {
    const pool = this.requirePool()
    const { rows } = await pool.query(
      `SELECT student_id, accuracy, total_answered, pressure_index, active_days,
              recent_narrative, next_focus, intervention
       FROM student_profiles
       WHERE student_id = $1`,
      [studentId],
    )
    if (rows.length === 0) return null
    const r = rows[0]
    return {
      id: r.student_id,
      name: STUDENT_NAME_MAP[r.student_id] ?? r.student_id,
      accuracy: r.accuracy,
      totalAnswered: r.total_answered,
      pressureIndex: r.pressure_index,
      activeDays: r.active_days,
      recentNarrative: r.recent_narrative,
      nextFocus: r.next_focus,
      intervention: r.intervention,
    }
  }

  async listTags(studentId?: string): Promise<InsightTag[]> {
    const pool = this.requirePool()
    const { rows } = await pool.query(
      `SELECT tag_id, student_id, label, category, confidence, evidence, status, updated_at
       FROM student_tags
       ${studentId ? 'WHERE student_id = $1' : ''}
       ORDER BY student_id, confidence DESC`,
      studentId ? [studentId] : [],
    )
    return rows.map((r) => ({
      id: r.tag_id,
      studentId: r.student_id,
      label: r.label,
      category: r.category,
      confidence: r.confidence,
      evidence: r.evidence,
      status: r.status,
      updatedAt: toIsoString(r.updated_at) ?? '',
    }))
  }

  async listReports(studentId?: string, period?: string): Promise<InsightReport[]> {
    const pool = this.requirePool()
    const clauses: string[] = []
    const params: unknown[] = []
    if (studentId) {
      params.push(studentId)
      clauses.push(`student_id = $${params.length}`)
    }
    if (period) {
      params.push(period)
      clauses.push(`period = $${params.length}`)
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const { rows } = await pool.query(
      `SELECT report_id, student_id, period, summary, created_at
       FROM teacher_reports
       ${where}
       ORDER BY created_at DESC`,
      params,
    )
    return rows.map((r) => ({
      id: r.report_id,
      studentId: r.student_id,
      period: r.period,
      summary: r.summary,
      createdAt: toIsoString(r.created_at) ?? '',
    }))
  }
}
