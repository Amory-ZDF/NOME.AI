import 'dotenv/config'

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseEnv } from '../src/config/env.js'
import {
  exerciseSetSchema,
  type ExerciseSet,
  type Question,
} from '../src/contracts/student-contracts.js'
import { createPrisma } from '../src/db/client.js'
import { toInputJson } from '../src/db/json.js'

// ---------------------------------------------------------------------------
// Question-bank importer.
//
// Reads a structured question-bank JSON file the user hand-author from their
// exam papers (no OCR/splitting here), fills safe defaults, validates against
// exerciseSetSchema, and upserts each question as its own single-question
// `bank` exercise set.
//
// The bank is a question pool, not a paper replay: each imported set is split
// into one exercise set per question (set id = question id), so the bank list
// and every "similar question" recommendation open exactly one question instead
// of a whole chapter.
//
// Usage:
//   npm run db:import-questions -- --file prisma/question-bank.json
//   npm run db:import-questions -- --list-nodes
// ---------------------------------------------------------------------------

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url))
const DEFAULT_BANK_FILE = 'prisma/question-bank.json'
// Knowledge graph lives in the sibling Python service; used only to warn when
// a knowledgeNodeId slug is not found (import still succeeds — the Python
// agent's exact-match lookup is the final authority).
const DEFAULT_GRAPH_FILE = '../backend/data/as_physics_graph.json'

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const ERROR_TYPE_OPTIONS = [
  'knowledge',
  'method',
  'calculation',
  'reading',
  'execution',
  'expression',
  'habit',
] as const

type QuestionType = Question['type']
type ErrorType = Question['errorType']

const QUESTION_TYPE_OPTIONS: QuestionType[] = [
  'choice',
  'calculation',
  'proof',
  'fill_blank',
  'reading',
  'writing',
]

// Generic progressive 5-level hints (AS Physics). Users may override per
// question. The live agent's progressive_hint skill generates finer hints at
// runtime; these are the static fallback shown before an AI diagnosis.
function defaultHints(): Question['hints'] {
  return [
    { level: 1, title: 'Clarify', content: 'Identify the physical quantities given and what the question asks you to find.' },
    { level: 2, title: 'Knowledge', content: 'Recall the relevant concept or definition for this topic.' },
    { level: 3, title: 'Formula', content: 'Choose the relationship or equation that links the given quantities to the unknown.' },
    { level: 4, title: 'Method', content: 'Substitute the known values with consistent units and solve step by step.' },
    { level: 5, title: 'Solution', content: 'Compute the final value and check its units and significant figures.' },
  ]
}

// ---------------------------------------------------------------------------
// Input parsing (loose: fields are optional; defaults are filled before
// exerciseSetSchema validation).
// ---------------------------------------------------------------------------

interface RawHint {
  level?: unknown
  title?: unknown
  content?: unknown
}

interface RawQuestion {
  id?: unknown
  type?: unknown
  topic?: unknown
  difficulty?: unknown
  content?: unknown
  options?: unknown
  correctIndex?: unknown
  acceptKeywords?: unknown
  correctDisplay?: unknown
  markScheme?: unknown
  errorType?: unknown
  hints?: unknown
  knowledgeNodeId?: unknown
  chapter?: unknown
  source?: unknown
  sourceDetail?: unknown
  understandingExplanation?: unknown
  scoringExplanation?: unknown
  markSchemePoints?: unknown
  passageEvidence?: unknown
  errorPattern?: unknown
  image?: unknown
  imageDescription?: unknown
}

interface RawSet {
  id?: unknown
  title?: unknown
  topic?: unknown
  questions?: unknown
}

interface RawBankFile {
  subject?: unknown
  exerciseSets?: unknown
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const result = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return result.length > 0 ? result : undefined
}

function parseQuestionType(value: unknown): QuestionType | undefined {
  const s = asString(value)
  if (s === undefined) return undefined
  return (QUESTION_TYPE_OPTIONS as string[]).includes(s) ? (s as QuestionType) : undefined
}

function parseErrorType(value: unknown): ErrorType | undefined {
  const s = asString(value)
  if (s === undefined) return undefined
  return (ERROR_TYPE_OPTIONS as string[]).includes(s) ? (s as ErrorType) : undefined
}

function parseHints(value: unknown): Question['hints'] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const hints: RawHint[] = value
  const result = hints
    .map((hint, index) => {
      const level = asNumber(hint.level) ?? index + 1
      const title = asString(hint.title)
      const content = asString(hint.content)
      if (title === undefined || content === undefined) return null
      if (level < 1 || level > 5) return null
      return { level, title, content }
    })
    .filter((hint): hint is Question['hints'][number] => hint !== null)
  return result.length > 0 ? result : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// ---------------------------------------------------------------------------
// Normalisation: raw -> validated ExerciseSet
// ---------------------------------------------------------------------------

function parseSource(value: unknown): Question['source'] {
  const s = asString(value)
  if (s === undefined) return undefined
  return ['past_exam', 'mock', 'teacher_upload'].includes(s)
    ? (s as Question['source'])
    : undefined
}

function parseMarkScheme(value: unknown): Question['markScheme'] {
  const s = asString(value)
  if (s !== undefined) return s
  if (Array.isArray(value) && value.length > 0 && value.every(isRecord)) {
    return value as Question['markScheme']
  }
  return undefined
}

function normalizeQuestion(raw: RawQuestion, setTopic: string | undefined, index: number): Question {
  const type = parseQuestionType(raw.type)
  if (type === undefined) throw new Error(`Question at index ${index} has an invalid/missing "type"`)
  const id = asString(raw.id)
  if (id === undefined) throw new Error(`Question at index ${index} has an invalid/missing "id"`)
  const topic = asString(raw.topic) ?? setTopic
  if (topic === undefined) throw new Error(`Question "${id}" has no topic and its set has no topic`)
  const difficulty = asNumber(raw.difficulty)
  if (difficulty === undefined) throw new Error(`Question "${id}" has an invalid/missing "difficulty"`)
  const content = asString(raw.content)
  if (content === undefined) throw new Error(`Question "${id}" has an invalid/missing "content"`)

  const options = asStringArray(raw.options)
  const correctIndex = asNumber(raw.correctIndex)
  const markScheme = parseMarkScheme(raw.markScheme)
  const correctDisplay = asString(raw.correctDisplay)

  // Free-response questions need a gradeable standard: markScheme, or a concise
  // correct answer. Choice questions derive it from options[correctIndex].
  if (type !== 'choice' && markScheme === undefined && correctDisplay === undefined) {
    throw new Error(`Free-response question "${id}" requires "markScheme" (or "correctDisplay")`)
  }

  return {
    id,
    order: index + 1,
    type,
    topic,
    difficulty,
    content,
    ...(options === undefined ? {} : { options }),
    ...(correctIndex === undefined ? {} : { correctIndex }),
    ...(asStringArray(raw.acceptKeywords) === undefined ? {} : { acceptKeywords: asStringArray(raw.acceptKeywords) }),
    ...(correctDisplay === undefined ? {} : { correctDisplay }),
    ...(markScheme === undefined ? {} : { markScheme }),
    ...(parseErrorType(raw.errorType) === undefined ? {} : { errorType: parseErrorType(raw.errorType) }),
    hints: parseHints(raw.hints) ?? defaultHints(),
    ...(asString(raw.knowledgeNodeId) === undefined ? {} : { knowledgeNodeId: asString(raw.knowledgeNodeId) }),
    ...(asString(raw.chapter) === undefined ? {} : { chapter: asString(raw.chapter) }),
    ...(parseSource(raw.source) === undefined ? {} : { source: parseSource(raw.source) }),
    ...(asString(raw.sourceDetail) === undefined ? {} : { sourceDetail: asString(raw.sourceDetail) }),
    ...(asString(raw.understandingExplanation) === undefined ? {} : { understandingExplanation: asString(raw.understandingExplanation) }),
    ...(asString(raw.scoringExplanation) === undefined ? {} : { scoringExplanation: asString(raw.scoringExplanation) }),
    ...(isRecord(raw.markSchemePoints) || Array.isArray(raw.markSchemePoints) ? { markSchemePoints: raw.markSchemePoints as ExerciseSet['questions'][number]['markSchemePoints'] } : {}),
    ...(asString(raw.passageEvidence) === undefined ? {} : { passageEvidence: asString(raw.passageEvidence) }),
    ...(asString(raw.errorPattern) === undefined ? {} : { errorPattern: asString(raw.errorPattern) }),
    ...(asString(raw.image) === undefined ? {} : { image: asString(raw.image) }),
    ...(asString(raw.imageDescription) === undefined ? {} : { imageDescription: asString(raw.imageDescription) }),
  }
}

function normalizeSet(raw: RawSet, subject: string): ExerciseSet {
  const id = asString(raw.id)
  if (id === undefined) throw new Error('An exercise set has an invalid/missing "id"')
  const title = asString(raw.title)
  if (title === undefined) throw new Error(`Exercise set "${id}" has an invalid/missing "title"`)
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    throw new Error(`Exercise set "${id}" has no questions`)
  }
  const setTopic = asString(raw.topic)
  const questions = raw.questions.map((question, index) => {
    if (!isRecord(question)) throw new Error(`Exercise set "${id}" question ${index} is not an object`)
    return normalizeQuestion(question as RawQuestion, setTopic, index)
  })
  return exerciseSetSchema.parse({
    id,
    taskId: null,
    title,
    subject: subject || 'AS Physics',
    questions,
  })
}

// Split a paper set into one single-question bank set per question. Each set
// keeps the paper set's title/subject and takes the question id as its set id,
// so the bank list opens one question at a time (and session provenance's
// per-question evidence match keeps working unchanged).
function toSingleQuestionSets(set: ExerciseSet): ExerciseSet[] {
  return set.questions.map((question) =>
    exerciseSetSchema.parse({
      ...set,
      id: question.id,
      taskId: null,
      questions: [question],
    }),
  )
}

// ---------------------------------------------------------------------------
// Graph node ids (for warnings + --list-nodes)
// ---------------------------------------------------------------------------

interface GraphEntity {
  id: string
  name: string
  type: string
}

function loadGraphEntities(graphPath: string): GraphEntity[] {
  try {
    const raw = JSON.parse(readFileSync(graphPath, 'utf-8'))
    if (!isRecord(raw) || !Array.isArray(raw.entities)) return []
    return raw.entities.filter(
      (entity): entity is GraphEntity =>
        isRecord(entity) && typeof entity.id === 'string' && typeof entity.type === 'string',
    )
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { file: string; graph: string; listNodes: boolean } {
  let file = DEFAULT_BANK_FILE
  let graph = DEFAULT_GRAPH_FILE
  let listNodes = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--list-nodes') listNodes = true
    else if (arg === '--file' && argv[index + 1] !== undefined) { file = argv[index + 1]; index += 1 }
    else if (arg === '--graph' && argv[index + 1] !== undefined) { graph = argv[index + 1]; index += 1 }
  }
  return { file, graph, listNodes }
}

function resolveFromCwd(path: string): string {
  return resolve(process.cwd(), path)
}

function listNodes(graphPath: string): void {
  const entities = loadGraphEntities(resolveFromCwd(graphPath))
  if (entities.length === 0) {
    console.error(`No graph nodes found at ${graphPath}`)
    process.exitCode = 1
    return
  }
  const byType = new Map<string, string[]>()
  for (const entity of entities) {
    const list = byType.get(entity.type) ?? []
    list.push(`${entity.id}  —  ${entity.name}`)
    byType.set(entity.type, list)
  }
  for (const [type, entries] of [...byType.entries()].sort()) {
    console.log(`[${type}] (${entries.length})`)
    for (const entry of entries) console.log(`  ${entry}`)
  }
}

async function runImport(filePath: string, graphPath: string): Promise<void> {
  const env = parseEnv(process.env)
  const prisma = createPrisma(env.DATABASE_URL)

  try {
    const raw = JSON.parse(readFileSync(resolveFromCwd(filePath), 'utf-8')) as RawBankFile
    if (!isRecord(raw) || !Array.isArray(raw.exerciseSets) || raw.exerciseSets.length === 0) {
      throw new Error('Question bank must contain a non-empty "exerciseSets" array')
    }
    const subject = asString(raw.subject) ?? 'AS Physics'

    const entities = loadGraphEntities(resolveFromCwd(graphPath))
    const knownNodeIds = new Set(entities.map((entity) => entity.id))

    const sets = raw.exerciseSets.map((set, index) => {
      if (!isRecord(set)) throw new Error(`exerciseSets[${index}] is not an object`)
      return normalizeSet(set as RawSet, subject)
    })

    for (const set of sets) {
      const unknownNodes = new Set<string>()
      for (const question of set.questions) {
        if (question.knowledgeNodeId !== undefined && !knownNodeIds.has(question.knowledgeNodeId)) {
          unknownNodes.add(question.knowledgeNodeId)
        }
      }
      if (unknownNodes.size > 0) {
        console.warn(
          `WARN set "${set.id}" references unknown knowledge-node slugs: ${[...unknownNodes].join(', ')}. ` +
          'Import proceeds; the Python agent will not find a weak link for these.',
        )
      }

      // The bank is a question pool: split the paper set into one exercise set
      // per question (set id = question id) so each entry and each "similar
      // question" recommendation opens exactly one question, not the whole set.
      // Drop the paper-level set row (if a previous import stored it) so a
      // re-import doesn't leave a duplicate whole-chapter entry behind.
      await prisma.exerciseSet.deleteMany({
        where: { studentId: env.STUDENT_ID, id: set.id ?? '', kind: 'bank' },
      })

      for (const single of toSingleQuestionSets(set)) {
        const setId = single.id ?? ''
        const setPayload = toInputJson(single)
        await prisma.exerciseSet.upsert({
          where: { studentId_id: { studentId: env.STUDENT_ID, id: setId } },
          update: { payload: setPayload },
          create: {
            id: setId,
            studentId: env.STUDENT_ID,
            taskId: null,
            kind: 'bank',
            payload: setPayload,
          },
        })
        console.log(`Imported bank set "${setId}" (1 question)`)
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}

async function main(): Promise<void> {
  const { file, graph, listNodes: shouldListNodes } = parseArgs(process.argv.slice(2))
  if (shouldListNodes) {
    listNodes(graph)
    return
  }
  await runImport(file, graph)
}

main().catch((error) => {
  console.error('Question import failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
