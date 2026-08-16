import { z } from 'zod'

import { AppError } from '../../common/errors/app-error.js'
import {
  exerciseSetSchema,
  learningSummarySchema,
  questionTypeSchema,
  type ExerciseSet,
  type LearningSummary,
  type Question,
} from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'

const BANK_SOURCE_OPTIONS = ['past_exam', 'mock', 'teacher_upload'] as const

export const bankQuestionSchema = z.strictObject({
  id: z.string().min(1),
  subject: z.string().min(1),
  topic: z.string().min(1),
  chapter: z.string(),
  type: questionTypeSchema,
  difficulty: z.number().int().min(1).max(5),
  source: z.enum(BANK_SOURCE_OPTIONS),
  sourceDetail: z.string(),
  correctRate: z.number().min(0).max(100),
  attemptCount: z.number().int().nonnegative(),
  studentStatus: z.enum(['not_attempted', 'correct', 'wrong']),
  setId: z.string().min(1).nullable(),
  preview: z.string(),
})

export const bankRecommendationSchema = z.strictObject({
  questionId: z.string().min(1),
  reason: z.string().min(1),
})

export const similarQuestionRelationSchema = z.enum(['contrasted', 'sibling', 'child'])

export const similarQuestionSchema = bankQuestionSchema.extend({
  relation: similarQuestionRelationSchema,
  relatedNodeId: z.string(),
  relatedNodeName: z.string(),
})

export type BankQuestion = z.infer<typeof bankQuestionSchema>
export type BankRecommendation = z.infer<typeof bankRecommendationSchema>
export type SimilarQuestion = z.infer<typeof similarQuestionSchema>

interface StoredExerciseSetRow {
  id: string
  studentId: string
  kind: string
  payload: unknown
}

function studentNotFound(): never {
  throw new AppError('Student not found', 404, 'NOT_FOUND')
}

function storedDataInvalid(cause: unknown): never {
  throw new AppError('Internal server error', 500, 'INTERNAL_ERROR', null, { cause })
}

function parseBankSet(row: StoredExerciseSetRow): ExerciseSet {
  try {
    const value = exerciseSetSchema.parse(row.payload)
    if ((value.id !== undefined && value.id !== row.id) || row.kind !== 'bank') {
      throw new Error('Stored bank exercise set metadata mismatch')
    }
    return value
  } catch (cause) {
    return storedDataInvalid(cause instanceof Error ? cause : new Error(String(cause)))
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function previewOf(content: string): string {
  const plain = stripHtml(content)
  return plain.length > 160 ? `${plain.slice(0, 160)}…` : plain
}

function topicsOverlap(left: string, right: string): boolean {
  const a = left.trim().toLowerCase()
  const b = right.trim().toLowerCase()
  if (a.length === 0 || b.length === 0) return false
  return a === b || a.includes(b) || b.includes(a)
}

export class BankService {
  constructor(
    private readonly prisma: StudentPrisma,
    private readonly studentId: string,
    private readonly agentUrl: string,
  ) {}

  private async loadBankSets(): Promise<ExerciseSet[]> {
    const rows = await this.prisma.exerciseSet.findMany({
      where: { studentId: this.studentId, kind: 'bank' },
      orderBy: { id: 'asc' },
    })
    return rows.map((row) => parseBankSet(row))
  }

  private projectQuestion(set: ExerciseSet, question: Question): BankQuestion {
    return {
      id: question.id,
      subject: set.subject,
      topic: question.topic,
      chapter: question.chapter ?? '',
      type: question.type,
      difficulty: question.difficulty,
      source: question.source ?? 'past_exam',
      sourceDetail: question.sourceDetail ?? '',
      correctRate: 0,
      attemptCount: 0,
      studentStatus: 'not_attempted',
      setId: set.id ?? null,
      preview: previewOf(question.content),
    }
  }

  async listQuestions(): Promise<BankQuestion[]> {
    const sets = await this.loadBankSets()
    return sets.flatMap((set) => set.questions.map((question) => this.projectQuestion(set, question)))
  }

  async listRecommendations(): Promise<BankRecommendation[]> {
    const student = await this.prisma.student.findUnique({
      where: { id: this.studentId },
      select: { learningSummary: true },
    })
    if (student === null) studentNotFound()

    let summary: LearningSummary
    try {
      summary = learningSummarySchema.parse(student.learningSummary)
    } catch (cause) {
      return storedDataInvalid(new Error('Invalid stored learning summary', { cause }))
    }

    const sets = await this.loadBankSets()
    const recommendations: BankRecommendation[] = []
    for (const weakTopic of summary.weakTopics) {
      const match = sets
        .flatMap((set) => set.questions.map((question) => ({ question, setId: set.id })))
        .find(({ question }) => topicsOverlap(question.topic, weakTopic))
      if (match !== undefined) {
        recommendations.push({
          questionId: match.question.id,
          reason: `Targets your weak topic: ${weakTopic}`,
        })
      }
    }
    return recommendations
  }

  async listSimilarQuestions(questionId: string): Promise<SimilarQuestion[]> {
    const sets = await this.loadBankSets()

    // 1. Locate the source question across every bank set and its node id.
    let sourceNodeId: string | undefined
    for (const set of sets) {
      const question = set.questions.find((candidate) => candidate.id === questionId)
      if (question !== undefined) {
        sourceNodeId = question.knowledgeNodeId
        break
      }
    }
    if (sourceNodeId === undefined || sourceNodeId === '') {
      throw new AppError('Question has no knowledge node', 404, 'NOT_FOUND')
    }

    // 2. Ask the Python agent for related node ids, grouped by relationship.
    const related = await this.fetchRelatedNodes(sourceNodeId)

    // 3. Reverse-lookup: questions whose node matches a related node.
    const relationByNodeId = new Map<string, { relation: SimilarQuestion['relation']; name: string }>()
    const groupNode = (nodes: Array<{ id: string; name: string }>, relation: SimilarQuestion['relation']) => {
      for (const node of nodes) {
        if (node.id !== sourceNodeId) {
          relationByNodeId.set(node.id, { relation, name: node.name })
        }
      }
    }
    groupNode(related.contrasted, 'contrasted')
    groupNode(related.siblings, 'sibling')
    groupNode(related.children, 'child')

    const results: SimilarQuestion[] = []
    for (const set of sets) {
      for (const question of set.questions) {
        if (question.id === questionId) continue
        const nodeId = question.knowledgeNodeId
        if (nodeId === undefined) continue
        const related = relationByNodeId.get(nodeId)
        if (related === undefined) continue
        results.push({
          ...this.projectQuestion(set, question),
          relation: related.relation,
          relatedNodeId: nodeId,
          relatedNodeName: related.name,
        })
      }
    }

    // Prefer commonly-confused, then same-chapter siblings, then downstream.
    const order: Record<SimilarQuestion['relation'], number> = {
      contrasted: 0,
      sibling: 1,
      child: 2,
    }
    return results.sort((a, b) => order[a.relation] - order[b.relation])
  }

  private async fetchRelatedNodes(nodeId: string): Promise<{
    contrasted: Array<{ id: string; name: string }>
    siblings: Array<{ id: string; name: string }>
    children: Array<{ id: string; name: string }>
  }> {
    const url = `${this.agentUrl}/api/agent/similar-nodes?node_id=${encodeURIComponent(nodeId)}`
    let payload: unknown
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`agent responded ${response.status}`)
      }
      payload = await response.json()
    } catch (cause) {
      // The agent is an optional enrichment — degrade to empty rather than 500.
      return { contrasted: [], siblings: [], children: [] }
    }

    const data = (payload as { data?: unknown })?.data
    const asList = (value: unknown): Array<{ id: string; name: string }> => {
      if (!Array.isArray(value)) return []
      return value
        .map((entry) => (entry as { id?: string; name?: string }) ?? {})
        .filter((entry) => typeof entry.id === 'string' && entry.id !== '')
        .map((entry) => ({ id: entry.id as string, name: entry.name ?? entry.id as string }))
    }
    return {
      contrasted: asList((data as { contrasted?: unknown })?.contrasted),
      siblings: asList((data as { siblings?: unknown })?.siblings),
      children: asList((data as { children?: unknown })?.children),
    }
  }
}
