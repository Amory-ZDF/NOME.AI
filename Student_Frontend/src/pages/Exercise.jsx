import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApp } from '../store/AppStore'
import {
  buildSession,
  canSubmitSession,
  createQuestionProgress,
  submitAttempt,
  unlockNextHint,
  resolveGrading,
} from '../features/exercise/exerciseEngine'
import { isCompleteVariantResult, isRenderableExerciseSet } from '../features/exercise/exerciseContracts'
import { Icon, Badge, Stars, MathHTML } from '../components/ui'

// ---------- Timer (PRD §2.6 silent timing) ----------
function useTimer(resetKey) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    setSeconds(0)
    const t = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(t)
  }, [resetKey])
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

// Hint usage colors (PRD §2.4)
const hintBarColor = (level) => {
  if (level === 0) return 'bg-success-green'
  if (level <= 2) return 'bg-deep-teal'
  if (level <= 4) return 'bg-alert-amber'
  return 'bg-error-red'
}

const transitionMessages = {
  THROWAWAY: 'Please answer seriously first — empty or random input cannot be submitted',
  ATTEMPT_REQUIRED: 'Submit your attempt first — hints unlock after a wrong answer',
  ALREADY_SOLVED: 'This question is already solved.',
}

function ExplanationSection({ title, children }) {
  if (!children) return null
  return (
    <div className="bg-warm-paper rounded-comp p-3 text-sm leading-6">
      <p className="font-semibold text-deep-ink">{title}</p>
      <p className="text-warm-stone mt-1">{children}</p>
    </div>
  )
}

// ---------- AI diagnosis panel ----------
// Shows the one-shot diagnosis (computed at settlement). The student asks
// follow-up questions through the always-present TutorChat, not a forced reply.
function AgentPanel({ agent }) {
  if (!agent) return null

  if (agent.pending) {
    return (
      <div className="flex items-center gap-2 rounded-comp border border-deep-teal/30 bg-teal-tint p-3 text-sm text-warm-stone" role="status">
        <Icon name="auto_awesome" size={16} className="text-deep-teal" />
        Diagnosing your mistake…
      </div>
    )
  }

  const diagnosis = agent.diagnosis
  if (diagnosis) {
    return (
      <div className="flex flex-col gap-2 rounded-comp border border-warm-stone/15 bg-warm-paper p-3 text-sm">
        <p className="font-semibold text-deep-ink flex items-center gap-1.5">
          <Icon name="fact_check" size={16} className="text-deep-teal" /> What went wrong
        </p>
        {diagnosis.errorType && (
          <div>
            <Badge tone="amber">{diagnosis.errorType}</Badge>
          </div>
        )}
        {diagnosis.whereWrong && <p className="leading-6 text-warm-stone">{diagnosis.whereWrong}</p>}
        {diagnosis.whyWrong && <p className="leading-6 text-warm-stone">{diagnosis.whyWrong}</p>}
      </div>
    )
  }

  return null
}

// ---------- AI tutoring panel ----------
function AiPanel({
  q,
  subject,
  state,
  agent,
  onSubmit,
  onUnlockHint,
  onNext,
  onGenerateVariant,
  variantTask,
  variantPending,
  isLast,
  nextDisabled = false,
}) {
  // State 3: answered correctly
  if (state.status === 'correct') {
    const hints = state.hintLevel
    return (
      <div className="flex flex-col gap-4">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 14 }}
          className="w-14 h-14 rounded-full bg-success-green/10 flex items-center justify-center mx-auto mt-2"
        >
          <Icon name="check_circle" size={36} className="text-success-green" filled />
        </motion.div>
        <p className="text-center font-semibold text-success-green text-lg">Correct!</p>
        <div className="bg-warm-paper rounded-comp p-3 text-sm text-warm-stone leading-6">
          {hints === 0
            ? 'Fully independent — excellent work! You have a solid grasp of this topic.'
            : `You used ${hints} hint level${hints > 1 ? 's' : ''} and hit a wall on ${hints <= 2 ? 'understanding the question' : 'choosing the method'}. Suggested review: ${q.topic}.`}
        </div>

        {subject === 'A-Level Math' && (
          <>
            <ExplanationSection title="Understanding">{q.understandingExplanation}</ExplanationSection>
            <ExplanationSection title="Scoring">{q.scoringExplanation}</ExplanationSection>
          </>
        )}
        {subject === 'IELTS Reading' && (
          <>
            <ExplanationSection title="Passage evidence">{q.passageEvidence}</ExplanationSection>
            <ExplanationSection title="Pattern to avoid">{q.errorPattern}</ExplanationSection>
          </>
        )}

        {variantTask && (
          <div className="bg-teal-tint border border-deep-teal/20 rounded-comp p-3 text-sm" role="status">
            <p className="font-semibold text-deep-teal">Variant task added</p>
            <p className="text-warm-stone mt-1">{variantTask.title}</p>
          </div>
        )}
        <button
          className="zb-btn-ghost w-full"
          onClick={onGenerateVariant}
          disabled={variantPending}
          aria-label="Create independent variant (L6)"
        >
          <Icon name="refresh" size={16} /> {variantPending ? 'Creating independent variant…' : 'Create independent variant (L6)'}
        </button>
        <button className="zb-btn-primary w-full" onClick={onNext} disabled={nextDisabled}>
          {isLast ? 'Review & submit the whole set' : 'Next question →'}
        </button>
      </div>
    )
  }

  // State 1: not yet submitted
  if (state.attempts.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="italic text-warm-stone text-sm leading-6 text-center py-6">
          &quot;Try solving this on your own first.<br />An incomplete attempt is fine — write down your thinking.&quot;
        </p>
        <button className="zb-btn-primary w-full" onClick={onSubmit} aria-label="Submit answer from AI tutor — check my answer">
          <Icon name="fact_check" size={16} /> I&apos;m done — check my answer
        </button>
        <button className="zb-btn-ghost w-full" onClick={onUnlockHint} aria-label="Get a hint">
          I need a hint
        </button>
      </div>
    )
  }

  // State 1.5: free-response answer awaiting LLM grading
  if (state.status === 'ungraded') {
    return (
      <div className="flex items-center gap-2 rounded-comp border border-deep-teal/30 bg-teal-tint p-3 text-sm text-warm-stone" role="status">
        <Icon name="auto_awesome" size={16} className="text-deep-teal" />
        Checking your answer…
      </div>
    )
  }

  // State 2: wrong answer — progressive hint unlock
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-error-red/5 border border-error-red/20 rounded-comp p-3 text-sm">
        <p className="text-error-red font-medium flex items-center gap-1.5">
          <Icon name="cancel" size={16} /> That answer isn&apos;t quite right
        </p>
        <p className="text-warm-stone text-xs mt-1">Don&apos;t be discouraged — mistakes are part of learning.</p>
      </div>

      <AgentPanel agent={agent} />

      <div className="flex flex-col gap-2.5 max-h-[38vh] overflow-y-auto pr-1">
        {q.hints.map((hint) => {
          // The agent returns a sharper hint for one level; slot it in over the
          // static fallback so the full 5-level ladder and lock states stay intact.
          const agentHint = agent?.hints?.find((item) => item.level === hint.level)
          const displayHint = agentHint ? { ...hint, ...agentHint } : hint
          const unlocked = displayHint.level <= state.hintLevel
          const isCurrent = displayHint.level === state.hintLevel
          return (
            <motion.div
              key={displayHint.level}
              initial={isCurrent ? { opacity: 0, height: 0 } : false}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.2 }}
              className={`rounded-comp border p-3 ${isCurrent ? 'border-deep-teal/50 bg-teal-tint' : 'border-whisper-line'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                {unlocked
                  ? <span className="w-5 h-5 rounded-full bg-deep-teal text-white text-xs flex items-center justify-center font-mono">{displayHint.level}</span>
                  : <Icon name="lock" size={14} className="text-warm-stone/60" />}
                <span className={`text-xs font-semibold ${unlocked ? 'text-deep-teal' : 'text-warm-stone/60'}`}>
                  {unlocked ? `L${displayHint.level} · ${displayHint.title}` : `L${displayHint.level} · Locked hint`}
                </span>
              </div>
              <p className={`text-sm leading-6 text-deep-ink ${unlocked ? '' : 'hint-locked'}`}>
                {unlocked ? displayHint.content : 'Unlock this level to view the hint.'}
              </p>
            </motion.div>
          )
        })}
      </div>

      {state.hintLevel < 5 ? (
        <button
          className="zb-btn-primary w-full"
          onClick={onUnlockHint}
          aria-label={`Get a hint — unlock level L${state.hintLevel + 1}`}
        >
          <Icon name="lock_open" size={16} /> Unlock next hint level (L{state.hintLevel + 1})
        </button>
      ) : (
        <p className="text-xs text-warm-stone text-center">All hints unlocked — review the full solution and try again</p>
      )}
      <button className="zb-btn-ghost w-full" onClick={onSubmit} aria-label="Submit answer from AI tutor — check my answer">
        <Icon name="edit" size={16} /> Edit answer &amp; resubmit
      </button>
    </div>
  )
}

// ---------- Answer area ----------
function AnswerArea({ q, state, onAnswer, onHandwriting }) {
  const [handwriting, setHandwriting] = useState(false)

  if (q.type === 'choice') {
    return (
      <div className="flex flex-col gap-2.5">
        {q.options.map((option, index) => (
          <label
            key={option}
            className={`flex items-center gap-3 border rounded-comp px-4 py-3 cursor-pointer text-sm transition-colors ${
              state.answer === option ? 'border-deep-teal bg-teal-tint' : 'border-whisper-line hover:bg-warm-paper'
            }`}
          >
            <input
              type="radio"
              name={q.id}
              className="accent-teal-600"
              checked={state.answer === option}
              onChange={() => onAnswer(option)}
              aria-label={`Your answer ${index + 1}: ${option}`}
            />
            {option}
          </label>
        ))}
      </div>
    )
  }

  if (q.type === 'fill_blank') {
    return (
      <input
        className="zb-input max-w-xs font-mono"
        placeholder="Type your answer…"
        aria-label="Your answer"
        value={state.answer}
        onChange={(event) => onAnswer(event.target.value)}
      />
    )
  }

  // calculation / proof / writing
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-warm-stone">Text and formula input supported</span>
        <button
          type="button"
          className={`text-xs flex items-center gap-1 px-2 py-1 rounded-comp transition-colors ${handwriting ? 'bg-deep-teal text-white' : 'text-warm-stone hover:bg-teal-tint'}`}
          onClick={() => {
            const next = !handwriting
            setHandwriting(next)
            onHandwriting?.(next)
          }}
        >
          <Icon name="stylus" size={14} /> Handwriting
        </button>
      </div>
      {handwriting ? (
        <div className="border-2 border-dashed border-warm-stone/30 rounded-comp h-40 flex flex-col items-center justify-center text-warm-stone text-sm gap-1">
          <Icon name="stylus" size={28} />
          Handwriting canvas (activates on iPad) — demo mode
        </div>
      ) : (
        <textarea
          className="zb-input !h-40 py-3 resize-none leading-6"
          placeholder="Write your solution steps or final answer…"
          aria-label="Your answer"
          value={state.answer}
          onChange={(event) => onAnswer(event.target.value)}
        />
      )}
    </div>
  )
}

function LoadingExercise() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3" role="status" aria-label="Loading exercise">
      <Icon name="hourglass_top" size={40} className="text-warm-stone" />
      <p className="text-warm-stone">Loading exercise…</p>
    </div>
  )
}

function MissingExercise({ error, onBack, onRetry }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <Icon name="error_outline" size={40} className="text-warm-stone" />
      <p className="text-warm-stone">This exercise doesn&apos;t exist or has expired</p>
      {error?.message && <p role="alert" className="text-sm text-error-red">{error.message}</p>}
      <div className="flex items-center gap-2">
        <button className="zb-btn-primary" onClick={onRetry}>Retry loading</button>
        <button className="zb-btn-ghost" onClick={onBack}>Back to Home</button>
      </div>
    </div>
  )
}

// ---------- Always-present tutor chat ----------
// Independent of the diagnosis/counter-question loop: the student can ask the
// agent anything about the current question (or a general question) at any time.
function TutorChat({ question, subject, onSend }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)

  const submit = async () => {
    const text = draft.trim()
    if (!text || pending) return
    const history = messages.map(({ role, content }) => ({ role, content }))
    setMessages((current) => [...current, { role: 'user', content: text }])
    setDraft('')
    setPending(true)
    try {
      const result = await onSend(question, text, history)
      const reply = result?.reply
      if (reply) setMessages((current) => [...current, { role: 'assistant', content: reply }])
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: error?.message || 'Sorry, I could not answer that. Please try again.' },
      ])
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-5 pt-4 border-t border-whisper-line">
      <p className="text-xs font-semibold text-deep-ink mb-2 flex items-center gap-1.5">
        <Icon name="chat" size={14} className="text-deep-teal" /> Ask the tutor
      </p>
      {messages.length > 0 && (
        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1 mb-2">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`rounded-comp px-3 py-2 text-sm leading-6 ${
                message.role === 'user'
                  ? 'bg-deep-teal/10 text-deep-ink self-end ml-6'
                  : 'bg-warm-paper text-warm-stone self-start mr-6'
              }`}
            >
              {message.content}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-start gap-2">
        <textarea
          className="zb-input resize-none flex-1"
          rows={2}
          placeholder={subject === 'A-Level Math'
            ? 'Ask about this question or a concept…'
            : 'Ask the tutor anything…'}
          aria-label="Ask the tutor a question"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <button
          className="zb-btn-primary !h-9 !px-3"
          disabled={!draft.trim() || pending}
          onClick={submit}
          aria-label="Send message to the tutor"
        >
          <Icon name="send" size={16} />
        </button>
      </div>
    </div>
  )
}

// ---------- Exercise page ----------
export default function Exercise({ bankMode = false }) {
  const { taskId, qId } = useParams()
  const navigate = useNavigate()
  const {
    tasks,
    showToast,
    loadExerciseSet,
    saveSession,
    verifyErrorVariant,
    generateVariant,
    diagnoseAnswer,
    requestAgentHint,
    diagnoseQuestion,
    tutorChat,
    isActionPending,
  } = useApp()
  const loadKey = bankMode ? `bank:${qId}` : `task:${taskId}`
  const timer = useTimer(loadKey)
  const mountedRef = useRef(false)
  const pageGenerationRef = useRef(0)
  const currentPageRef = useRef({ loadKey, generation: 0 })
  if (currentPageRef.current.loadKey !== loadKey) {
    pageGenerationRef.current += 1
    currentPageRef.current = { loadKey, generation: pageGenerationRef.current }
  }
  // Wall-clock start instant. The elapsed time is derived from this at submit
  // (not from a setInterval counter, which the browser throttles in background
  // tabs — an undercount would push the backend's computed start instant past
  // the first attempt's submittedAt and fail session validation).
  const startedAtRef = useRef(Date.now())
  const submitTransactionRef = useRef(false)
  const persistedSubmissionRef = useRef(null)
  const [submitTransactionPending, setSubmitTransactionPending] = useState(false)
  const [loadStatus, setLoadStatus] = useState('loading')
  const [loadError, setLoadError] = useState(null)
  const [set, setExerciseSet] = useState(null)
  const [settledLoadKey, setSettledLoadKey] = useState(null)
  const [current, setCurrent] = useState(0)
  const [progressById, setProgressById] = useState({})
  const [variantTasks, setVariantTasks] = useState({})
  const [agentById, setAgentById] = useState({})
  const [loadRetry, setLoadRetry] = useState(0)
  // Dedup for one-shot settlement diagnoses (see runSettlementDiagnosis).
  const settlementDiagnosisRef = useRef({})

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const isCurrentPage = (page) => (
    mountedRef.current
    && currentPageRef.current.loadKey === page.loadKey
    && currentPageRef.current.generation === page.generation
  )

  useEffect(() => {
    let active = true
    pageGenerationRef.current += 1
    const loadPage = { loadKey, generation: pageGenerationRef.current }
    currentPageRef.current = loadPage
    setLoadStatus('loading')
    setLoadError(null)
    setExerciseSet(null)
    setSettledLoadKey(null)
    setCurrent(0)
    setProgressById({})
    setVariantTasks({})
    setAgentById({})
    startedAtRef.current = Date.now()
    submitTransactionRef.current = false
    persistedSubmissionRef.current = null
    setSubmitTransactionPending(false)

    const request = bankMode
      ? loadExerciseSet({ bankSetId: qId })
      : loadExerciseSet({ taskId })

    request.then((loadedSet) => {
      if (!active || !isCurrentPage(loadPage)) return
      if (!isRenderableExerciseSet(loadedSet)) {
        setSettledLoadKey(loadKey)
        setLoadStatus('error')
        setLoadError(new Error('Exercise data is incomplete or invalid.'))
        return
      }
      setExerciseSet(loadedSet)
      setProgressById(Object.fromEntries(
        loadedSet.questions.map((item) => [item.id, createQuestionProgress(item.id)]),
      ))
      setSettledLoadKey(loadKey)
      setLoadStatus('ready')
    }).catch((error) => {
      if (!active || !isCurrentPage(loadPage)) return
      setLoadError(error)
      setSettledLoadKey(loadKey)
      setLoadStatus('error')
    })

    return () => { active = false }
  }, [bankMode, loadExerciseSet, loadKey, loadRetry, qId, taskId])

  useEffect(() => {
    // The display timer (useTimer above) handles the visual count; elapsed time
    // for submission is derived from startedAtRef at submit time instead of a
    // second ticking ref, so a background-throttled interval can't undercount it.
  }, [loadKey])

  if (loadStatus === 'loading' || settledLoadKey !== loadKey) return <LoadingExercise />
  if (loadStatus === 'error' || !set) {
    return (
      <MissingExercise
        error={loadError}
        onBack={() => navigate(bankMode ? '/bank' : '/')}
        onRetry={() => setLoadRetry((attempt) => attempt + 1)}
      />
    )
  }

  const questions = set.questions
  const q = questions[current]
  const state = progressById[q.id]
  // Question context for the tutor chat: include the student's latest answer and
  // the AI's diagnosis (once settled) so "why isn't C correct?" is answerable.
  const tutorChatContext = {
    ...q,
    studentAnswer: state?.answer ?? '',
    diagnosis: state?.diagnosis ?? null,
  }
  const attemptedAll = canSubmitSession(progressById)
  const wholeSetSubmitting = submitTransactionPending
  const variantPending = isActionPending(`exercise:variant:${q.id}`)
  const verificationTask = bankMode
    ? null
    : tasks.find((task) => task.id === taskId)
  const verificationErrorId = typeof verificationTask?.verificationForErrorId === 'string'
    ? verificationTask.verificationForErrorId.trim()
    : ''
  const isLinkedVerificationSet = Boolean(
    verificationErrorId
    && typeof set.id === 'string'
    && set.id
    && verificationTask.exerciseSetId === set.id
    && set.taskId === taskId
    && questions.length === 1,
  )

  const updateProgress = (id, update) => {
    setProgressById((currentProgress) => {
      const previous = currentProgress[id]
      const next = typeof update === 'function' ? update(previous) : { ...previous, ...update }
      return { ...currentProgress, [id]: next }
    })
  }

  const reportTransitionError = (code) => {
    const message = transitionMessages[code] || 'That action is not available yet.'
    showToast(message, code === 'ALREADY_SOLVED' ? 'info' : 'error')
  }

  // Submit a single question (PRD §2.7). Diagnosis is NOT run on wrong answers —
  // it is deferred to settlement (solved-with-hints or still-wrong at submit) so
  // we never re-generate a diagnosis on every wrong attempt.
  const submitQuestion = async () => {
    const next = submitAttempt(state, q, state.answer, new Date().toISOString())
    if (next.transitionError) {
      reportTransitionError(next.transitionError)
      return
    }
    updateProgress(q.id, next)
    if (next.status === 'ungraded') {
      await runGrading(q, next)
    } else if (next.status === 'correct' && next.hintLevel > 0) {
      // Solved after using hints — an assisted solve worth an error-book entry.
      runSettlementDiagnosis(q, next)
    } else if (next.status === 'wrong' && next.hintLevel === 1 && state.hintLevel === 0) {
      // First wrong attempt: surface the agent-generated L1 hint immediately.
      fetchAgentHint(q, next)
    }
  }

  // Free-response grading: the LLM grades the answer against the mark scheme.
  // The same call returns the diagnosis (when wrong) or a bare correct verdict.
  const runGrading = async (question, progress) => {
    const actionPage = currentPageRef.current
    setAgentById((current) => ({ ...current, [question.id]: { pending: true } }))
    try {
      const result = await diagnoseAnswer(question, progress)
      if (!isCurrentPage(actionPage)) return
      const isCorrect = Boolean(result?.isCorrect)
      const resolved = resolveGrading(progress, isCorrect)
      updateProgress(question.id, () => resolved)
      if (isCorrect) {
        setAgentById((current) => ({ ...current, [question.id]: null }))
        if (resolved.hintLevel > 0) {
          // Solved after hints — one-shot diagnosis for the error book.
          runSettlementDiagnosis(question, resolved)
        }
      } else {
        updateProgress(question.id, (current) => ({
          ...current,
          diagnosis: result?.diagnosis ?? null,
        }))
        setAgentById((current) => ({
          ...current,
          [question.id]: {
            diagnosis: result?.diagnosis ?? null,
            hints: result?.hint ? [result.hint] : [],
          },
        }))
        // First wrong (free-response graded by the LLM): surface the agent L1 hint.
        if (resolved.hintLevel === 1 && progress.hintLevel === 0) {
          fetchAgentHint(question, resolved)
        }
      }
    } catch (error) {
      if (!isCurrentPage(actionPage)) return
      showToast(error?.message || 'Grading failed. Please try again.', 'error')
      // Revert to an editable unanswered state so the student can retry.
      updateProgress(question.id, (current) => ({
        ...current,
        status: 'unanswered',
        attempts: current.attempts.slice(0, -1),
      }))
      setAgentById((current) => ({ ...current, [question.id]: null }))
    }
  }

  // One-shot diagnosis when a question's outcome is settled. Stores the result
  // on progress (buildSession flattens it into the error book) and surfaces the
  // "What went wrong" panel. Returns the diagnosis for callers that also need it.
  // Deduped per question: concurrent callers (fire-and-forget on solve + the
  // awaited submit loop) share one request, and the resolved diagnosis is cached
  // so a later submit (whose progress closure may be stale) does not re-diagnose.
  const runSettlementDiagnosis = async (question, progress) => {
    if (progress?.diagnosis) return progress.diagnosis
    const cached = settlementDiagnosisRef.current[question.id]
    if (cached && typeof cached.then === 'function') return cached
    if (cached) return cached
    const actionPage = currentPageRef.current
    setAgentById((current) => ({ ...current, [question.id]: { pending: true } }))
    const run = async () => {
      try {
        const result = await diagnoseQuestion(question, progress)
        if (!isCurrentPage(actionPage)) return null
        const diagnosis = result?.diagnosis ?? null
        if (diagnosis) {
          updateProgress(question.id, (current) => ({ ...current, diagnosis }))
          setAgentById((current) => ({
            ...current,
            [question.id]: { diagnosis, hints: [] },
          }))
        }
        settlementDiagnosisRef.current[question.id] = diagnosis
        return diagnosis
      } catch (error) {
        delete settlementDiagnosisRef.current[question.id]
        if (!isCurrentPage(actionPage)) return null
        showToast(error?.message || 'Diagnosis failed. Please try again.', 'error')
        return null
      }
    }
    const promise = run()
    settlementDiagnosisRef.current[question.id] = promise
    return promise
  }

  // Fetch the agent-generated hint for the level the student just reached and
  // slot it in over the static ladder. The agent generates hint_level + 1, so we
  // send the previously-seen level (progress.hintLevel - 1) to get the new one.
  // Best-effort: the static hint stays if the agent is unavailable or slow.
  const fetchAgentHint = async (question, progress) => {
    const actionPage = currentPageRef.current
    try {
      const result = await requestAgentHint(question, {
        ...progress,
        hintLevel: Math.max(0, progress.hintLevel - 1),
      })
      if (!isCurrentPage(actionPage)) return
      const hint = result?.hint ?? null
      if (hint) {
        setAgentById((current) => ({
          ...current,
          [question.id]: {
            diagnosis: current[question.id]?.diagnosis ?? null,
            hints: [...(current[question.id]?.hints ?? []).filter((item) => item.level !== hint.level), hint],
          },
        }))
      }
    } catch {
      // Best-effort: keep the static ladder.
    }
  }

  const unlockHint = () => {
    const next = unlockNextHint(state)
    if (next.transitionError) {
      reportTransitionError(next.transitionError)
      return
    }
    updateProgress(q.id, next)
    fetchAgentHint(q, next)
  }

  const submitAll = async () => {
    if (!canSubmitSession(progressById)) {
      showToast('Attempt every question before submitting the whole set.', 'info')
      return
    }
    if (submitTransactionRef.current) return
    const actionPage = currentPageRef.current
    const cachedSubmission = persistedSubmissionRef.current?.loadKey === actionPage.loadKey
      && persistedSubmissionRef.current?.generation === actionPage.generation
      ? persistedSubmissionRef.current
      : null
    const currentVerification = isLinkedVerificationSet
      ? {
          errorId: verificationErrorId,
          variantId: set.id,
          isCorrect: progressById[questions[0].id]?.status === 'correct',
        }
      : null
    const actionVerification = cachedSubmission?.verification ?? currentVerification
    submitTransactionRef.current = true
    setSubmitTransactionPending(true)
    try {
      // Settlement diagnosis: any question that needs an error-book entry and
      // still lacks a diagnosis gets its one-shot diagnosis now — both still-
      // wrong questions and assisted solves (correct only after hints).
      const settlementProgress = { ...progressById }
      for (const question of questions) {
        const progress = progressById[question.id]
        const needsDiagnosis = progress
          && !progress.diagnosis
          && (progress.status === 'wrong' || (progress.status === 'correct' && progress.hintLevel > 0))
        if (needsDiagnosis) {
          const diagnosis = await runSettlementDiagnosis(question, progress)
          if (!isCurrentPage(actionPage)) return
          if (diagnosis) settlementProgress[question.id] = { ...progress, diagnosis }
        }
      }
      let persisted = cachedSubmission?.result ?? null
      if (!persisted) {
        persisted = await saveSession(buildSession({
          set,
          progressById: settlementProgress,
          elapsedSeconds: Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000)),
        }))
        if (!isCurrentPage(actionPage)) return
      }
      const persistedId = typeof persisted?.sessionId === 'string' ? persisted.sessionId.trim() : ''
      if (!persistedId) {
        showToast('Session saved without a valid reference. Please try submitting again.', 'error')
        return
      }
      persistedSubmissionRef.current = {
        loadKey: actionPage.loadKey,
        generation: actionPage.generation,
        result: persisted,
        verification: actionVerification,
      }
      if (actionVerification) {
        await verifyErrorVariant(actionVerification.errorId, {
          variantId: actionVerification.variantId,
          isCorrect: actionVerification.isCorrect,
        })
        if (!isCurrentPage(actionPage)) return
      }
      navigate(`/summary/${encodeURIComponent(persistedId)}`)
    } catch {
      // AppStore displays persistence failures; retaining local progress allows a retry.
    } finally {
      if (!isCurrentPage(actionPage)) return
      submitTransactionRef.current = false
      setSubmitTransactionPending(false)
    }
  }

  const goNext = () => {
    if (current < questions.length - 1) setCurrent((index) => index + 1)
    else submitAll()
  }

  const createIndependentVariant = async () => {
    const actionPage = currentPageRef.current
    try {
      const result = await generateVariant(q)
      if (!isCurrentPage(actionPage)) return
      if (!isCompleteVariantResult(result, q.id)) {
        showToast('The generated variant is incomplete. Please try again.', 'error')
        return
      }
      const createdTask = result.task
      setVariantTasks((currentTasks) => ({ ...currentTasks, [q.id]: createdTask }))
      showToast('Variant task added to your task list', 'success')
    } catch {
      // AppStore displays the failure and clears its keyed pending state for retry.
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-warm-paper">
      {/* Top bar */}
      <div className="bg-pure-surface border-b border-whisper-line sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 lg:px-8 h-14 max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="p-1.5 rounded-comp text-warm-stone hover:bg-teal-tint"
              onClick={() => navigate(bankMode ? '/bank' : '/')}
              aria-label={bankMode ? 'Back to Bank' : 'Back to Home'}
            >
              <Icon name="arrow_back" size={20} />
            </button>
            <span className="font-semibold truncate">{set.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-warm-stone" title="Elapsed time">Elapsed {timer}</span>
            <button
              className={`zb-btn-primary !h-9 ${attemptedAll ? '' : 'opacity-40 pointer-events-none'}`}
              onClick={submitAll}
              disabled={!attemptedAll || wholeSetSubmitting}
              title={attemptedAll ? 'Submit the whole exercise set' : 'You can submit after attempting all questions'}
            >
              Submit
            </button>
          </div>
        </div>
        {/* 2px progress bar */}
        <div className="h-0.5 bg-whisper-line">
          <motion.div
            className="h-full bg-deep-teal"
            animate={{ width: `${((current + 1) / questions.length) * 100}%` }}
            transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          />
        </div>
        <div className="max-w-[1200px] mx-auto px-4 lg:px-8 py-2 flex items-center justify-between">
          <span className="text-xs text-warm-stone font-mono">Question {current + 1} of {questions.length}</span>
          {/* Question dot navigation */}
          <div className="flex items-center gap-1.5">
            {questions.map((item, index) => {
              const progress = progressById[item.id]
              const label = `Question ${index + 1}`
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrent(index)}
                  title={label}
                  aria-label={label}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    index === current ? 'ring-2 ring-deep-teal ring-offset-1 scale-110' : ''
                  } ${
                    progress.status === 'correct' ? 'bg-deep-teal'
                      : progress.status === 'wrong' ? 'bg-alert-amber'
                        : 'bg-warm-stone/25'
                  }`}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Main: 60/40 split */}
      <div className="flex-1 max-w-[1200px] mx-auto w-full px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 items-start">
        {/* Left: question area */}
        <motion.div
          key={q.id}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
          className="zb-card"
        >
          <p className="text-xs text-warm-stone mb-3 font-mono">Question {q.order}</p>
          <div className="text-[15px] leading-7 mb-4"><MathHTML html={q.content} /></div>
          <div className="flex items-center gap-2 mb-5">
            <Badge tone="teal">{q.topic}</Badge>
            <Stars level={q.difficulty} />
          </div>

          <p className="text-sm font-semibold mb-2.5">Answer area</p>
          <AnswerArea
            key={q.id}
            q={q}
            state={state}
            onAnswer={(answer) => updateProgress(q.id, (previous) => ({ ...previous, answer }))}
            onHandwriting={(used) => updateProgress(q.id, (previous) => ({
              ...previous,
              handwritingUsed: previous.handwritingUsed || used,
            }))}
          />

          {/* Previous / next */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-whisper-line">
            <button className="zb-btn-ghost !h-9" disabled={current === 0} onClick={() => setCurrent((index) => index - 1)}>
              <Icon name="chevron_left" size={16} /> Previous
            </button>
            {state.status === 'correct' ? (
              <button className="zb-btn-primary !h-9" onClick={goNext} disabled={wholeSetSubmitting}>
                {current === questions.length - 1 ? 'Finish' : 'Next'} <Icon name="chevron_right" size={16} />
              </button>
            ) : (
              <button className="zb-btn-primary !h-9" onClick={submitQuestion} aria-label="Submit answer from answer area — check my answer">
                <Icon name="fact_check" size={16} /> {state.attempts.length > 0 ? 'Resubmit' : 'I\'m done — check my answer'}
              </button>
            )}
          </div>
        </motion.div>

        {/* Right: AI tutoring panel */}
        <div className="zb-card sticky top-32">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-1.5">
              <Icon name="auto_awesome" size={18} className="text-deep-teal" /> AI Tutor
            </h3>
            <div className="flex items-center gap-1" title={`Current hint level L${state.hintLevel}`}>
              {[1, 2, 3, 4, 5].map((level) => (
                <span key={level} className={`w-1.5 h-1.5 rounded-full ${level <= state.hintLevel ? 'bg-deep-teal' : 'bg-warm-stone/20'}`} />
              ))}
            </div>
          </div>
          <AiPanel
            q={q}
            subject={set.subject}
            state={state}
            agent={agentById[q.id]}
            onSubmit={submitQuestion}
            onUnlockHint={unlockHint}
            onNext={goNext}
            onGenerateVariant={createIndependentVariant}
            variantTask={variantTasks[q.id]}
            variantPending={variantPending}
            isLast={current === questions.length - 1}
            nextDisabled={wholeSetSubmitting}
          />

          {/* Hint usage tracker (PRD §2.4) */}
          <div className="mt-5 pt-4 border-t border-whisper-line">
            <p className="text-xs text-warm-stone mb-2">Hint usage</p>
            <div className="flex items-end gap-1.5 h-8">
              {questions.map((item, index) => {
                const progress = progressById[item.id]
                const used = progress.status === 'unanswered' ? 0 : progress.hintLevel
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrent(index)}
                    className={`flex-1 rounded-sm transition-all ${index === current ? 'opacity-100' : 'opacity-70'} ${progress.status === 'unanswered' ? 'bg-warm-stone/15' : hintBarColor(used)}`}
                    style={{ height: progress.status === 'unanswered' ? '6px' : `${Math.max(20, used * 16)}%` }}
                    title={`Question ${index + 1} · ${progress.status === 'unanswered' ? 'not attempted' : `${used} hint level${used === 1 ? '' : 's'}`}`}
                    aria-label={`Question ${index + 1} hint usage`}
                  />
                )
              })}
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-warm-stone/70 font-mono">
              <span>Q1</span><span>Q{questions.length}</span>
            </div>
          </div>

          {/* Always-present tutor chat (PRD: student asks the agent). The
              question carries the student's latest answer + the AI's diagnosis
              (if settled) so the tutor can answer context-specific questions. */}
          <TutorChat
            key={q.id}
            question={tutorChatContext}
            subject={set.subject}
            onSend={tutorChat}
          />
        </div>
      </div>
    </div>
  )
}