import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../store/AppStore'
import { ERROR_TYPE_META } from '../data/mockData'
import { Icon, Badge, EmptyState, ProgressBar, staggerContainer, fadeUpItem } from '../components/ui'

const STATUS_META = {
  pending_review: { label: 'To Review', tone: 'amber' },
  reviewing: { label: 'Reviewing', tone: 'teal' },
  mastered: { label: 'Mastered', tone: 'green' },
}

const filterChips = [
  { key: 'all', label: 'All' },
  { key: 'pending_review', label: 'To Review' },
  { key: 'mastered', label: 'Mastered' },
  { key: 'repeated', label: 'Repeated Errors' },
]

function ErrorCard({ item }) {
  const navigate = useNavigate()
  const { markErrorMastered, showToast } = useApp()
  const [expanded, setExpanded] = useState(false)
  const status = STATUS_META[item.status]
  // PRD §4.3: "Mark as mastered" only available after a successful redo
  const canMaster = item.redoHistory.some((r) => r.isCorrect) && item.status !== 'mastered'
  const meta = ERROR_TYPE_META[item.errorType] || {}

  return (
    <motion.div variants={fadeUpItem} className="zb-card !p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone="teal">{item.subject}</Badge>
          <span className="zb-badge" style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}>{meta.label}</span>
          <span className="font-mono text-xs text-warm-stone">{item.firstOccurredAt.slice(5)}</span>
          {item.repeatCount > 1 && <Badge tone="amber">{item.repeatCount}× error</Badge>}
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>

      <p className="font-medium mt-3 leading-6">{item.questionSummary}</p>
      <p className="text-sm text-warm-stone mt-1.5 leading-6">Cause: {item.errorDescription}</p>
      <p className="text-xs mt-2">
        Topic: <span className="text-deep-teal cursor-pointer hover:underline" onClick={() => navigate('/profile')}>{item.relatedTopic}</span>
      </p>

      {/* Expanded full analysis */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="mt-4 pt-4 border-t border-whisper-line grid md:grid-cols-2 gap-3 text-sm">
              <div className="bg-error-red/5 rounded-comp p-3">
                <p className="text-xs font-semibold text-error-red mb-1">Your answer back then</p>
                <p className="text-warm-stone">{item.studentAnswer}</p>
              </div>
              <div className="bg-success-green/5 rounded-comp p-3">
                <p className="text-xs font-semibold text-success-green mb-1">Correct answer</p>
                <p className="text-warm-stone">{item.correctAnswer}</p>
              </div>
            </div>
            <div className="bg-warm-paper rounded-comp p-3 mt-3 text-sm text-warm-stone leading-6">
              <span className="font-semibold text-deep-ink">AI analysis: </span>{item.analysis}
            </div>
            {item.redoHistory.length > 0 && (
              <p className="text-xs text-warm-stone mt-2">Redo history: {item.redoHistory.length} attempt(s), latest {item.redoHistory[item.redoHistory.length - 1].isCorrect ? '✓ correct' : '✗ wrong'}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 mt-4">
        {item.status !== 'mastered' && (
          <button className="zb-btn-primary !h-9" onClick={() => navigate(`/errors/review/${item.id}`)}>
            <Icon name="replay" size={16} /> Redo it
          </button>
        )}
        <button className="zb-btn-ghost !h-9" onClick={() => setExpanded(!expanded)}>
          <Icon name={expanded ? 'expand_less' : 'expand_more'} size={16} /> {expanded ? 'Collapse analysis' : 'View analysis'}
        </button>
        <button
          className={`zb-btn-ghost !h-9 ${canMaster ? 'text-success-green border-success-green/30' : 'opacity-40 pointer-events-none'}`}
          title={canMaster ? 'Mark as mastered' : 'Available after a successful redo'}
          onClick={() => markErrorMastered(item.id)}
        >
          <Icon name="check_circle" size={16} /> Mark as mastered
        </button>
      </div>
    </motion.div>
  )
}

export default function Errors() {
  const { errors } = useApp()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [subject, setSubject] = useState('all')

  const subjects = useMemo(() => [...new Set(errors.map((e) => e.subject))], [errors])

  const filtered = errors.filter((e) => {
    if (subject !== 'all' && e.subject !== subject) return false
    if (filter === 'pending_review') return e.status === 'pending_review'
    if (filter === 'mastered') return e.status === 'mastered'
    if (filter === 'repeated') return e.repeatCount >= 2
    return true
  })

  const counts = {
    pending: errors.filter((e) => e.status === 'pending_review').length,
    reviewing: errors.filter((e) => e.status === 'reviewing').length,
    mastered: errors.filter((e) => e.status === 'mastered').length,
  }
  const masteryRate = Math.round((counts.mastered / Math.max(1, errors.length)) * 100)

  return (
    <div className="max-w-content mx-auto px-4 lg:px-0 py-8">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Error Book <span className="font-mono text-warm-stone text-lg">{errors.length} total</span>
        </h1>
        <select className="zb-input !w-auto !h-9 text-sm" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="all">All subjects</option>
          {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Mastery progress */}
      <div className="zb-card !p-5 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">Mastery progress</p>
          <span className="font-mono text-sm text-deep-teal">{masteryRate}%</span>
        </div>
        <ProgressBar value={masteryRate} />
        <p className="text-xs text-warm-stone mt-2">
          To review <span className="font-mono">{counts.pending}</span> · Reviewing <span className="font-mono">{counts.reviewing}</span> · Mastered <span className="font-mono">{counts.mastered}</span>
        </p>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 mb-5">
        {filterChips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === c.key ? 'bg-deep-teal text-white' : 'bg-pure-surface border border-whisper-line text-warm-stone hover:bg-teal-tint'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="workspace_premium"
          title="Great — no matching errors here"
          desc="Keep it up, or take on new challenges in the question bank."
          action={<button className="zb-btn-primary" onClick={() => navigate('/bank')}>Go to Question Bank →</button>}
        />
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-3">
          {filtered.map((item) => <ErrorCard key={item.id} item={item} />)}
        </motion.div>
      )}
    </div>
  )
}
