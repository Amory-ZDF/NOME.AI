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

// ---------- AI tutoring panel ----------
function AiPanel({
  q,
  subject,
  state,
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

  // State 2: wrong answer — progressive hint unlock
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-error-red/5 border border-error-red/20 rounded-comp p-3 text-sm">
        <p className="text-error-red font-medium flex items-center gap-1.5">
          <Icon name="cancel" size={16} /> That answer isn&apos;t quite right
        </p>
        <p className="text-warm-stone text-xs mt-1">Don&apos;t be discouraged — mistakes are part of learning. Level 1 hint unlocked.</p>
      </div>

      <div className="flex flex-col gap-2.5 max-h-[38vh] overflow-y-auto pr-1">
        {q.hints.map((hint) => {
          const unlocked = hint.level <= state.hintLevel
          const isCurrent = hint.level === state.hintLevel
          return (
            <motion.div
              key={hint.level}
              initial={isCurrent ? { opacity: 0, height: 0 } : false}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.2 }}
              className={`rounded-comp border p-3 ${isCurrent ? 'border-deep-teal/50 bg-teal-tint' : 'border-whisper-line'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                {unlocked
                  ? <span className="w-5 h-5 rounded-full bg-deep-teal text-white text-xs flex items-center justify-center font-mono">{hint.level}</span>
                  : <Icon name="lock" size={14} className="text-warm-stone/60" />}
                <span className={`text-xs font-semibold ${unlocked ? 'text-deep-teal' : 'text-warm-stone/60'}`}>
                  {unlocked ? `L${hint.level} · ${hint.title}` : `L${hint.level} · Locked hint`}
                </span>
              </div>
              <p className={`text-sm leading-6 text-deep-ink ${unlocked ? '' : 'hint-locked'}`}>
                {unlocked ? hint.content : 'Unlock this level to view the hint.'}
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

// ---------- Exercise page ----------
export default function Exercise({ bankMode = false }) {
  const { taskId, qId } = useParams()
  const navigate = useNavigate()
  const {
    showToast,
    loadExerciseSet,
    saveSession,
    generateVariant,
    isActionPending,
  } = useApp()
  const loadKey = bankMode ? `bank:${qId}` : `task:${taskId}`
  const timer = useTimer(loadKey)
  const mountedRef = useRef(false)
  const currentLoadKeyRef = useRef(loadKey)
  currentLoadKeyRef.current = loadKey
  const secondsRef = useRef(0)
  const submitTransactionRef = useRef(false)
  const [submitTransactionPending, setSubmitTransactionPending] = useState(false)
  const [loadStatus, setLoadStatus] = useState('loading')
  const [loadError, setLoadError] = useState(null)
  const [set, setExerciseSet] = useState(null)
  const [settledLoadKey, setSettledLoadKey] = useState(null)
  const [current, setCurrent] = useState(0)
  const [progressById, setProgressById] = useState({})
  const [variantTasks, setVariantTasks] = useState({})
  const [loadRetry, setLoadRetry] = useState(0)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const isCurrentPage = (key) => mountedRef.current && currentLoadKeyRef.current === key

  useEffect(() => {
    let active = true
    setLoadStatus('loading')
    setLoadError(null)
    setExerciseSet(null)
    setSettledLoadKey(null)
    setCurrent(0)
    setProgressById({})
    setVariantTasks({})
    secondsRef.current = 0
    submitTransactionRef.current = false
    setSubmitTransactionPending(false)

    const request = bankMode
      ? loadExerciseSet({ bankSetId: qId })
      : loadExerciseSet({ taskId })

    request.then((loadedSet) => {
      if (!active || !isCurrentPage(loadKey)) return
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
      if (!active || !isCurrentPage(loadKey)) return
      setLoadError(error)
      setSettledLoadKey(loadKey)
      setLoadStatus('error')
    })

    return () => { active = false }
  }, [bankMode, loadExerciseSet, loadKey, loadRetry, qId, taskId])

  useEffect(() => {
    const interval = setInterval(() => { secondsRef.current += 1 }, 1000)
    return () => clearInterval(interval)
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
  const attemptedAll = canSubmitSession(progressById)
  const wholeSetSubmitting = submitTransactionPending
  const variantPending = isActionPending(`exercise:variant:${q.id}`)

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

  // Submit a single question (PRD §2.7)
  const submitQuestion = () => {
    const next = submitAttempt(state, q, state.answer, new Date().toISOString())
    if (next.transitionError) {
      reportTransitionError(next.transitionError)
      return
    }
    updateProgress(q.id, next)
  }

  const unlockHint = () => {
    const next = unlockNextHint(state)
    if (next.transitionError) {
      reportTransitionError(next.transitionError)
      return
    }
    updateProgress(q.id, next)
  }

  const submitAll = async () => {
    if (!canSubmitSession(progressById)) {
      showToast('Attempt every question before submitting the whole set.', 'info')
      return
    }
    if (submitTransactionRef.current) return
    const actionLoadKey = loadKey
    submitTransactionRef.current = true
    setSubmitTransactionPending(true)
    try {
      const persisted = await saveSession(buildSession({
        set,
        progressById,
        elapsedSeconds: secondsRef.current,
      }))
      if (!isCurrentPage(actionLoadKey)) return
      const persistedId = typeof persisted?.sessionId === 'string' ? persisted.sessionId.trim() : ''
      if (!persistedId) {
        showToast('Session saved without a valid reference. Please try submitting again.', 'error')
        return
      }
      navigate(`/summary/${encodeURIComponent(persistedId)}`)
    } catch {
      // AppStore displays persistence failures; retaining local progress allows a retry.
    } finally {
      if (!isCurrentPage(actionLoadKey)) return
      submitTransactionRef.current = false
      setSubmitTransactionPending(false)
    }
  }

  const goNext = () => {
    if (current < questions.length - 1) setCurrent((index) => index + 1)
    else submitAll()
  }

  const createIndependentVariant = async () => {
    const actionLoadKey = loadKey
    try {
      const result = await generateVariant(q)
      if (!isCurrentPage(actionLoadKey)) return
      if (!isCompleteVariantResult(result)) {
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
        </div>
      </div>
    </div>
  )
}
