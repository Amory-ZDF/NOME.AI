import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../store/AppStore'
import { exerciseSets, bankExerciseSets, checkAnswer, isThrowaway } from '../data/mockData'
import { Icon, Badge, Stars, MathHTML } from '../components/ui'

// ---------- Timer (PRD §2.6 silent timing) ----------
function useTimer() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

// Hint usage colors (PRD §2.4)
const hintBarColor = (n) => {
  if (n === 0) return 'bg-success-green'
  if (n <= 2) return 'bg-deep-teal'
  if (n <= 4) return 'bg-alert-amber'
  return 'bg-error-red'
}

// ---------- AI tutoring panel ----------
function AiPanel({ q, state, onSubmit, onUnlockHint, onNext, isLast }) {
  const { showToast } = useApp()

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
        {hints >= 1 && (
          <button className="zb-btn-ghost w-full" onClick={() => showToast('Variant question generated — it will be added to your task list', 'success')}>
            <Icon name="refresh" size={16} /> Start variant question (L6)
          </button>
        )}
        <button className="zb-btn-primary w-full" onClick={onNext}>
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
          "Try solving this on your own first.<br />An incomplete attempt is fine — write down your thinking."
        </p>
        <button className="zb-btn-primary w-full" onClick={onSubmit}>
          <Icon name="fact_check" size={16} /> I'm done — check my answer
        </button>
        <button className="zb-btn-ghost w-full" onClick={() => showToast('Submit your attempt first — hints unlock automatically after a wrong answer', 'info')}>
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
          <Icon name="cancel" size={16} /> That answer isn't quite right
        </p>
        <p className="text-warm-stone text-xs mt-1">Don't be discouraged — mistakes are part of learning. Level 1 hint unlocked.</p>
      </div>

      <div className="flex flex-col gap-2.5 max-h-[38vh] overflow-y-auto pr-1">
        {q.hints.map((h) => {
          const unlocked = h.level <= state.hintLevel
          const isCurrent = h.level === state.hintLevel
          return (
            <motion.div
              key={h.level}
              initial={isCurrent ? { opacity: 0, height: 0 } : false}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.2 }}
              className={`rounded-comp border p-3 ${isCurrent ? 'border-deep-teal/50 bg-teal-tint' : 'border-whisper-line'}`}
            >
              <div className="flex items-center gap-2 mb-1">
                {unlocked
                  ? <span className="w-5 h-5 rounded-full bg-deep-teal text-white text-xs flex items-center justify-center font-mono">{h.level}</span>
                  : <Icon name="lock" size={14} className="text-warm-stone/60" />}
                <span className={`text-xs font-semibold ${unlocked ? 'text-deep-teal' : 'text-warm-stone/60'}`}>L{h.level} · {h.title}</span>
              </div>
              <p className={`text-sm leading-6 text-deep-ink ${unlocked ? '' : 'hint-locked'}`}>{h.content}</p>
            </motion.div>
          )
        })}
      </div>

      {state.hintLevel < 5 ? (
        <button className="zb-btn-primary w-full" onClick={onUnlockHint}>
          <Icon name="lock_open" size={16} /> Unlock next hint level (L{state.hintLevel + 1})
        </button>
      ) : (
        <p className="text-xs text-warm-stone text-center">All hints unlocked — review the full solution and try again</p>
      )}
      <button className="zb-btn-ghost w-full" onClick={onSubmit}>
        <Icon name="edit" size={16} /> Edit answer & resubmit
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
        {q.options.map((opt, i) => (
          <label
            key={i}
            className={`flex items-center gap-3 border rounded-comp px-4 py-3 cursor-pointer text-sm transition-colors ${
              state.answer === opt ? 'border-deep-teal bg-teal-tint' : 'border-whisper-line hover:bg-warm-paper'
            }`}
          >
            <input type="radio" name={q.id} className="accent-teal-600" checked={state.answer === opt} onChange={() => onAnswer(opt)} />
            {opt}
          </label>
        ))}
      </div>
    )
  }

  if (q.type === 'fill_blank') {
    return <input className="zb-input max-w-xs font-mono" placeholder="Type your answer…" value={state.answer} onChange={(e) => onAnswer(e.target.value)} />
  }

  // calculation / proof / writing
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-warm-stone">Text and formula input supported</span>
        <button
          className={`text-xs flex items-center gap-1 px-2 py-1 rounded-comp transition-colors ${handwriting ? 'bg-deep-teal text-white' : 'text-warm-stone hover:bg-teal-tint'}`}
          onClick={() => { setHandwriting(!handwriting); onHandwriting?.(!handwriting) }}
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
          value={state.answer}
          onChange={(e) => onAnswer(e.target.value)}
        />
      )}
    </div>
  )
}

// ---------- Exercise page ----------
export default function Exercise({ bankMode = false }) {
  const { taskId, qId } = useParams()
  const navigate = useNavigate()
  const { showToast, saveSession, completeTask, isActionPending } = useApp()
  const timer = useTimer()
  const secondsRef = useRef(0)

  const set = useMemo(() => {
    if (bankMode) return bankExerciseSets[qId]
    const found = Object.values(exerciseSets).find((s) => s.taskId === taskId)
    return found || null
  }, [taskId, qId, bankMode])

  const [current, setCurrent] = useState(0)
  const [states, setStates] = useState(() => {
    if (!set) return {}
    return Object.fromEntries(set.questions.map((q) => [q.id, {
      answer: '', status: 'unanswered', attempts: [], hintLevel: 0, solvedAtHintLevel: null,
    }]))
  })

  useEffect(() => {
    const t = setInterval(() => { secondsRef.current += 1 }, 1000)
    return () => clearInterval(t)
  }, [])

  if (!set) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <Icon name="error_outline" size={40} className="text-warm-stone" />
        <p className="text-warm-stone">This exercise doesn't exist or has expired</p>
        <button className="zb-btn-ghost" onClick={() => navigate('/')}>Back to Home</button>
      </div>
    )
  }

  const questions = set.questions
  const q = questions[current]
  const state = states[q.id]
  const answeredCount = questions.filter((qq) => states[qq.id].status === 'correct').length
  const attemptedAll = questions.every((qq) => states[qq.id].status !== 'unanswered')

  const setState = (id, patch) => setStates((s) => ({ ...s, [id]: { ...s[id], ...patch } }))

  // Submit a single question (PRD §2.7)
  const submitQuestion = () => {
    if (isThrowaway(state.answer)) {
      showToast('Please answer seriously first — empty or random input cannot be submitted', 'error')
      return
    }
    const isCorrect = checkAnswer(q, state.answer)
    const attempt = { answer: state.answer, isCorrect }
    if (isCorrect) {
      setState(q.id, {
        status: 'correct',
        attempts: [...state.attempts, attempt],
        solvedAtHintLevel: state.hintLevel,
      })
    } else {
      setState(q.id, {
        status: 'wrong',
        attempts: [...state.attempts, attempt],
        hintLevel: Math.max(state.hintLevel, 1), // first wrong answer auto-unlocks L1
      })
    }
  }

  const unlockHint = () => {
    if (state.hintLevel >= 5) return
    setState(q.id, { hintLevel: state.hintLevel + 1 })
  }

  const goNext = () => {
    if (current < questions.length - 1) setCurrent(current + 1)
    else submitAll()
  }

  // Submit the whole exercise set (PRD §2.7-6)
  const submitAll = async () => {
    if (isActionPending('saveSession')) return
    const session = {
      taskId: set.taskId,
      taskTitle: set.title,
      subject: set.subject,
      timeSpent: Math.max(1, Math.round(secondsRef.current / 60)),
      timeSpentSeconds: secondsRef.current,
      questions: questions.map((qq) => ({
        ...qq,
        result: {
          status: states[qq.id].status,
          attempts: states[qq.id].attempts,
          hintsUsed: states[qq.id].hintLevel,
          solvedAtHintLevel: states[qq.id].solvedAtHintLevel,
        },
      })),
    }
    try {
      const persisted = await saveSession(session)
      if (set.taskId) await completeTask(set.taskId)
      navigate(`/summary/${persisted.sessionId}`)
    } catch {
      // AppStore rolls back and displays the write failure.
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-warm-paper">
      {/* Top bar */}
      <div className="bg-pure-surface border-b border-whisper-line sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 lg:px-8 h-14 max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <button className="p-1.5 rounded-comp text-warm-stone hover:bg-teal-tint" onClick={() => navigate(bankMode ? '/bank' : '/')}>
              <Icon name="arrow_back" size={20} />
            </button>
            <span className="font-semibold truncate">{set.title}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-warm-stone" title="Elapsed time">Elapsed {timer}</span>
            <button
              className={`zb-btn-primary !h-9 ${attemptedAll ? '' : 'opacity-40 pointer-events-none'}`}
              onClick={submitAll}
              disabled={!attemptedAll || isActionPending('saveSession')}
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
            {questions.map((qq, i) => {
              const st = states[qq.id]
              return (
                <button
                  key={qq.id}
                  onClick={() => setCurrent(i)}
                  title={`Question ${i + 1}`}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    i === current ? 'ring-2 ring-deep-teal ring-offset-1 scale-110' : ''
                  } ${
                    st.status === 'correct' ? 'bg-deep-teal'
                      : st.status === 'wrong' ? 'bg-alert-amber'
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
          <AnswerArea q={q} state={state} onAnswer={(v) => setState(q.id, { answer: v })} />

          {/* Previous / next */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-whisper-line">
            <button className="zb-btn-ghost !h-9" disabled={current === 0} onClick={() => setCurrent(current - 1)}>
              <Icon name="chevron_left" size={16} /> Previous
            </button>
            {state.status === 'correct' ? (
              <button className="zb-btn-primary !h-9" onClick={goNext} disabled={isActionPending('saveSession')}>{current === questions.length - 1 ? 'Finish' : 'Next'} <Icon name="chevron_right" size={16} /></button>
            ) : (
              <button className="zb-btn-primary !h-9" onClick={submitQuestion}>
                <Icon name="fact_check" size={16} /> {state.attempts.length > 0 ? 'Resubmit' : "I'm done — check my answer"}
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
              {[1, 2, 3, 4, 5].map((l) => (
                <span key={l} className={`w-1.5 h-1.5 rounded-full ${l <= state.hintLevel ? 'bg-deep-teal' : 'bg-warm-stone/20'}`} />
              ))}
            </div>
          </div>
          <AiPanel
            q={q}
            state={state}
            onSubmit={submitQuestion}
            onUnlockHint={unlockHint}
            onNext={goNext}
            isLast={current === questions.length - 1}
          />

          {/* Hint usage tracker (PRD §2.4) */}
          <div className="mt-5 pt-4 border-t border-whisper-line">
            <p className="text-xs text-warm-stone mb-2">Hint usage</p>
            <div className="flex items-end gap-1.5 h-8">
              {questions.map((qq, i) => {
                const st = states[qq.id]
                const used = st.status === 'unanswered' ? 0 : st.hintLevel
                return (
                  <button
                    key={qq.id}
                    onClick={() => setCurrent(i)}
                    className={`flex-1 rounded-sm transition-all ${i === current ? 'opacity-100' : 'opacity-70'} ${st.status === 'unanswered' ? 'bg-warm-stone/15' : hintBarColor(used)}`}
                    style={{ height: st.status === 'unanswered' ? '6px' : `${Math.max(20, used * 16)}%` }}
                    title={`Question ${i + 1} · ${st.status === 'unanswered' ? 'not attempted' : `${used} hint level${used === 1 ? '' : 's'}`}`}
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
