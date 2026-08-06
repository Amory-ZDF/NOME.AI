import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApp } from '../store/AppStore'
import { ERROR_TYPE_META } from '../data/mockData'
import { Icon, Badge, MathHTML, staggerContainer, fadeUpItem } from '../components/ui'

const wrongQuestionsSafe = (session) => (session ? session.questions.filter((q) => q.result.status !== 'correct') : [])

export default function Summary() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { sessions, lastSession, addErrors, errors, showToast, addTask, isActionPending } = useApp()
  const session = sessions[sessionId] || (lastSession?.sessionId === sessionId ? lastSession : null)

  // Error card state (whether already added to error book)
  const errorQuestionIds = useMemo(() => new Set(errors.map((e) => e.questionId)), [errors])

  if (!session) {
    return (
      <div className="max-w-content mx-auto px-4 py-16 text-center">
        <p className="text-warm-stone mb-4">No summary data found for this session</p>
        <button className="zb-btn-primary" onClick={() => navigate('/')}>Back to Home</button>
      </div>
    )
  }

  const total = session.questions.length
  const correctCount = session.questions.filter((q) => q.result.status === 'correct').length
  const accuracy = Math.round((correctCount / total) * 100)
  const accuracyChange = accuracy >= 66 ? 12 : accuracy >= 50 ? 5 : -3
  const independentCount = session.questions.filter((q) => q.result.status === 'correct' && q.result.hintsUsed === 0).length
  const assistedCount = total - independentCount
  const avgHints = (session.questions.reduce((s, q) => s + q.result.hintsUsed, 0) / total).toFixed(1)
  const wrongQuestions = wrongQuestionsSafe(session)

  // Error cause distribution (based on actually wrong questions)
  const distribution = (() => {
    if (!session) return []
    const dist = {}
    wrongQuestionsSafe(session).forEach((q) => { dist[q.errorType] = (dist[q.errorType] || 0) + 1 })
    return Object.entries(dist).map(([type, count]) => ({
      type, count, pct: Math.round((count / Math.max(1, wrongQuestionsSafe(session).length)) * 100),
    }))
  })()

  const buildErrorItem = (q) => ({
    questionId: q.id,
    subject: session.subject,
    errorType: q.errorType,
    questionSummary: q.content.replace(/<[^>]+>/g, '').slice(0, 60) + '…',
    questionContent: q.content,
    errorDescription: `Made an error on "${q.topic}" after ${q.result.attempts.length} attempt(s), using ${q.result.hintsUsed} hint level(s).`,
    relatedTopic: q.topic,
    topicId: q.topic,
    repeatCount: 1,
    status: 'pending_review',
    studentAnswer: q.result.attempts[q.result.attempts.length - 1]?.answer || '(no answer)',
    correctAnswer: q.correctDisplay,
    analysis: `Review the L5 full solution to reinforce "${q.topic}" — retry recommended in 3 days.`,
    acceptKeywords: q.acceptKeywords,
    options: q.options,
    correctIndex: q.correctIndex,
    redoHistory: [],
  })

  return (
    <div className="max-w-content mx-auto px-4 lg:px-0 py-10">
      {/* Result header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
        <p className="flex items-center justify-center gap-1.5 text-success-green font-medium mb-2">
          <Icon name="task_alt" size={20} /> Exercise complete!
        </p>
        <div className="flex items-center justify-center gap-3">
          <span className="font-mono text-5xl font-semibold text-deep-teal">{accuracy}%</span>
          <Badge tone={accuracyChange >= 0 ? 'green' : 'amber'}>
            {accuracyChange >= 0 ? `Up ${accuracyChange}% from last time ↑` : `Down ${-accuracyChange}% from last time ↓`}
          </Badge>
        </div>
        <p className="text-warm-stone text-sm mt-3">
          Time <span className="font-mono">{session.timeSpent}min</span>
          <span className="mx-2">|</span>Solved independently <span className="font-mono">{independentCount}/{total}</span>
          <span className="mx-2">|</span>Hints <span className="font-mono">{avgHints}/question</span>
        </p>
      </motion.div>

      {/* Error cause analysis */}
      <motion.section variants={staggerContainer} initial="hidden" animate="show" className="zb-card mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="zb-section-title">Error Analysis</h2>
          <span className="text-xs text-warm-stone font-mono">{wrongQuestions.length} wrong</span>
        </div>

        {wrongQuestions.length === 0 ? (
          <p className="text-sm text-warm-stone py-4 text-center">
            {independentCount === total
              ? 'No mistakes in this session — all solved independently 🎉'
              : `No unresolved mistakes in this session. ${assistedCount} ${assistedCount === 1 ? 'question was' : 'questions were'} solved with hints or after retrying.`}
          </p>
        ) : (
          <>
            {/* Horizontal stacked bar chart */}
            <div className="flex h-3 rounded-full overflow-hidden mb-2">
              {distribution.map((d) => (
                <div key={d.type} style={{ width: `${d.pct}%`, backgroundColor: ERROR_TYPE_META[d.type]?.color }} title={`${ERROR_TYPE_META[d.type]?.label} ${d.pct}%`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-3 mb-5 text-xs text-warm-stone">
              {distribution.map((d) => (
                <span key={d.type} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ERROR_TYPE_META[d.type]?.color }} />
                  {ERROR_TYPE_META[d.type]?.label} <span className="font-mono">{d.pct}%</span>
                </span>
              ))}
            </div>

            {/* Error detail cards */}
            <div className="flex flex-col gap-3">
              {wrongQuestions.map((q, i) => (
                <motion.div key={q.id} variants={fadeUpItem} className="border border-whisper-line rounded-comp p-4">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge tone="amber">{ERROR_TYPE_META[q.errorType]?.label}</Badge>
                    <span className="text-sm font-medium">Question {q.order}</span>
                    {q.result.attempts.length > 1 && <Badge tone="red">{q.result.attempts.length} attempts</Badge>}
                  </div>
                  <div className="grid md:grid-cols-2 gap-3 text-sm">
                    <div className="bg-error-red/5 rounded-comp p-3">
                      <p className="text-xs font-semibold text-error-red mb-1">Your answer</p>
                      <p className="text-warm-stone leading-6">{q.result.attempts[q.result.attempts.length - 1]?.answer || '(no answer)'}</p>
                    </div>
                    <div className="bg-success-green/5 rounded-comp p-3">
                      <p className="text-xs font-semibold text-success-green mb-1">Correct approach</p>
                      <p className="text-warm-stone leading-6">{q.correctDisplay}</p>
                    </div>
                  </div>
                  <p className="text-xs text-warm-stone mt-2">
                    Topic: <Link to="/profile" className="text-deep-teal hover:underline">{q.topic}</Link>
                  </p>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </motion.section>

      {/* Knowledge links (mini graph) */}
      <motion.section variants={fadeUpItem} initial="hidden" animate="show" className="zb-card mb-4">
        <h2 className="zb-section-title mb-4">Knowledge Links</h2>
        <div className="flex flex-wrap items-center gap-2">
          {[...new Set(session.questions.map((q) => q.topic))].map((topic, i) => (
            <span key={topic} className={`zb-badge ${session.questions.some((q) => q.topic === topic && q.result.status !== 'correct') ? 'bg-alert-amber/10 text-alert-amber' : 'bg-success-green/10 text-success-green'}`}>
              {topic}
            </span>
          ))}
        </div>
        <Link to="/profile" className="inline-block mt-3 text-sm text-deep-teal hover:underline">View the full knowledge graph →</Link>
      </motion.section>

      {/* Error cards */}
      {wrongQuestions.length > 0 && (
        <motion.section variants={fadeUpItem} initial="hidden" animate="show" className="zb-card mb-4">
          <h2 className="zb-section-title mb-4">Error Cards ({wrongQuestions.length})</h2>
          <div className="flex flex-col gap-3">
            {wrongQuestions.map((q) => {
              const added = errorQuestionIds.has(q.id)
              return (
                <div key={q.id} className="border-l-[3px] border-alert-amber border border-whisper-line border-l-[3px] rounded-comp p-4">
                  <p className="text-sm leading-6 mb-2"><MathHTML html={q.content} /></p>
                  <p className="text-xs text-warm-stone mb-1"><span className="font-semibold text-deep-ink">What went wrong: </span>used {q.result.hintsUsed} hint level(s) but still couldn't finish independently</p>
                  <p className="text-xs text-warm-stone mb-3"><span className="font-semibold text-deep-ink">Why: </span>{ERROR_TYPE_META[q.errorType]?.label} · weak mastery of topic "{q.topic}"</p>
                  <button
                    className={`zb-btn !h-8 text-xs ${added ? 'zb-btn-ghost text-success-green' : 'zb-btn-primary'}`}
                    disabled={added || isActionPending('addErrors')}
                    onClick={async () => {
                      try {
                        await addErrors([buildErrorItem(q)])
                        showToast('Added to error book', 'success')
                      } catch {
                        // AppStore rolls back and displays the write failure.
                      }
                    }}
                  >
                    {added ? (<><Icon name="check" size={14} /> In error book</>) : (<><Icon name="bookmarks" size={14} /> Add to error book</>)}
                  </button>
                </div>
              )
            })}
          </div>
        </motion.section>
      )}

      {/* What's next */}
      <motion.section variants={fadeUpItem} initial="hidden" animate="show" className="zb-card">
        <h2 className="zb-section-title mb-2">What's Next</h2>
        <p className="text-sm text-warm-stone mb-4">
          {wrongQuestions.length > 0
            ? `Try 1 variant question to verify mastery — focus on reinforcing "${wrongQuestions[0].topic}".`
            : independentCount < total
              ? 'No unresolved mistakes remain. Review assisted solutions, then try a variant question to confirm independent mastery.'
              : 'Great form! Try harder questions to keep progressing.'}
        </p>
        <div className="flex flex-wrap gap-2 mb-5">
          <button className="zb-btn-primary" onClick={() => navigate('/bank')}>
            <Icon name="refresh" size={16} /> Start variant question
          </button>
          <button className="zb-btn-ghost" disabled={isActionPending('addTask')} onClick={async () => {
            try {
              await addTask({
                title: `Variant drill · ${wrongQuestions[0]?.topic || 'Consolidation'}`,
                type: 'ai_recommended', subject: session.subject, estimatedMinutes: 15,
                dueAt: null, assignedBy: null, priority: 'P2', isOverdue: false, status: 'pending',
              })
              showToast('Added to task list', 'success')
            } catch {
              // AppStore rolls back and displays the write failure.
            }
          }}>
            <Icon name="add_task" size={16} /> Add to task list
          </button>
        </div>
        <div className="flex items-center justify-between pt-4 border-t border-whisper-line">
          <button className="zb-btn-ghost" onClick={() => navigate('/')}>Back to Home</button>
          <Link to="/profile" className="text-sm text-deep-teal hover:underline">View full learning profile →</Link>
        </div>
      </motion.section>
    </div>
  )
}
