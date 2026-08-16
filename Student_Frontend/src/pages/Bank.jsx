import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Icon, Badge, Stars, ProgressBar, Toggle, Modal, staggerContainer, fadeUpItem } from '../components/ui'
import { useApp } from '../store/AppStore'

const TYPE_LABEL = { choice: 'Multiple Choice', calculation: 'Calculation', proof: 'Proof', reading: 'Reading', writing: 'Writing', fill_blank: 'Fill in Blank' }
const SOURCE_LABEL = { past_exam: 'Past Exam', mock: 'Mock Exam', teacher_upload: 'Teacher Upload' }

function QuestionRow({ q, smart }) {
  const navigate = useNavigate()
  const { showToast } = useApp()
  const barColor = q.correctRate >= 70 ? 'bg-success-green' : q.correctRate >= 45 ? 'bg-alert-amber' : 'bg-error-red'

  return (
    <motion.div variants={fadeUpItem} className="zb-card !p-5 zb-card-hover" onClick={() => {
      if (q.setId) navigate(`/bank/exercise/${q.setId}`)
      else showToast('The practice screen for this question type is under development', 'info')
    }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Stars level={q.difficulty} />
            <Badge tone="teal">{TYPE_LABEL[q.type]}</Badge>
            <Badge tone="stone">{q.sourceDetail}</Badge>
            {q.studentStatus === 'correct' && <Badge tone="green"><Icon name="check" size={12} /> Mastered</Badge>}
            {q.studentStatus === 'wrong' && <Badge tone="red"><Icon name="close" size={12} /> Got wrong before</Badge>}
          </div>
          <p className="text-sm leading-6 mb-2 line-clamp-2">{q.preview}</p>
          <p className="text-xs text-warm-stone font-mono">
            {q.topic} · {q.attemptCount.toLocaleString()} attempts
          </p>
          <div className="flex items-center gap-2 mt-2 max-w-xs">
            <span className="text-xs text-warm-stone shrink-0">Accuracy</span>
            <ProgressBar value={q.correctRate} color={barColor} />
            <span className="font-mono text-xs w-9 text-right">{q.correctRate}%</span>
          </div>
        </div>
        <div className="shrink-0">
          {q.studentStatus === 'not_attempted' && (
            <button className="zb-btn-primary !h-9">Start practice</button>
          )}
          {q.studentStatus === 'correct' && (
            <button className="zb-btn-ghost !h-9 text-success-green border-success-green/30">Practice again</button>
          )}
          {q.studentStatus === 'wrong' && (
            <button className="zb-btn-ghost !h-9 text-alert-amber border-alert-amber/40"><Icon name="replay" size={15} /> Redo</button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function Bank() {
  const navigate = useNavigate()
  const { showToast, addTask, isActionPending, bankQuestions, bankRecommendations, loadBank } = useApp()
  const [subject, setSubject] = useState('All')
  const [difficulty, setDifficulty] = useState('all')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')
  const [smart, setSmart] = useState(true)
  const [search, setSearch] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)

  useEffect(() => { loadBank() }, [loadBank])

  const subjectTabs = useMemo(() => {
    const subjects = [...new Set(bankQuestions.map((q) => q.subject).filter(Boolean))]
    return subjects.length > 0 ? ['All', ...subjects] : ['All']
  }, [bankQuestions])

  const filtered = useMemo(() => bankQuestions.filter((q) => {
    if (subject !== 'All' && q.subject !== subject) return false
    if (difficulty !== 'all' && q.difficulty !== Number(difficulty)) return false
    if (type !== 'all' && q.type !== type) return false
    if (status !== 'all' && q.studentStatus !== status) return false
    if (search && !q.preview.includes(search) && !q.topic.includes(search)) return false
    return true
  }), [subject, difficulty, type, status, search, bankQuestions])

  const recommended = bankRecommendations
    .map((r) => ({ ...r, q: bankQuestions.find((bq) => bq.id === r.questionId) }))
    .filter((r) => r.q && (subject === 'All' || r.q.subject === subject))

  const selectCls = 'zb-input !w-auto !h-9 text-sm'

  const uploadPaper = async () => {
    try {
      await addTask({
        title: 'Confirm AI-split question classification',
        type: 'ai_recommended', subject: 'A-Level Math', estimatedMinutes: 10,
        dueAt: null, assignedBy: null, priority: 'P2', isOverdue: false, status: 'pending',
      })
      showToast('Paper uploaded: the AI is splitting and classifying questions — you\'ll be asked to confirm when done', 'success')
      setUploadOpen(false)
    } catch {
      // AppStore rolls back and displays the write failure.
    }
  }

  return (
    <div className="max-w-content mx-auto px-4 lg:px-0 py-8">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          Question Bank <span className="font-mono text-warm-stone text-lg">{bankQuestions.length} questions</span>
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Icon name="search" size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-warm-stone" />
            <input className="zb-input !w-48 !pl-8" placeholder="Search questions…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button className="zb-btn-primary" onClick={() => setUploadOpen(true)}><Icon name="upload_file" size={16} /> Upload paper</button>
        </div>
      </div>

      {/* Subject tabs */}
      <div className="flex gap-1 border-b border-whisper-line mb-4">
        {subjectTabs.map((s) => (
          <button key={s} onClick={() => setSubject(s)} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${subject === s ? 'border-deep-teal text-deep-teal' : 'border-transparent text-warm-stone hover:text-deep-ink'}`}>
            {s}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2.5 mb-5 flex-wrap">
        <select className={selectCls} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="all">All difficulty</option>
          {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{'★'.repeat(d)}</option>)}
        </select>
        <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All status</option>
          <option value="not_attempted">Not attempted</option>
          <option value="correct">Got right</option>
          <option value="wrong">Got wrong</option>
        </select>
        <div className="ml-auto">
          <Toggle checked={smart} onChange={setSmart} label="Smart Recommend" />
        </div>
      </div>

      {/* Smart recommendations */}
      {smart && recommended.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-teal-tint border border-deep-teal/20 rounded-card p-5 mb-5">
          <p className="font-semibold text-deep-teal flex items-center gap-1.5 mb-1">
            <Icon name="auto_awesome" size={18} /> Recommended for you
          </p>
          <p className="text-xs text-warm-stone mb-3">Dynamically generated from your knowledge graph and recent errors</p>
          <div className="grid md:grid-cols-3 gap-3">
            {recommended.map((r) => (
              <button key={r.questionId} className="bg-pure-surface border border-whisper-line rounded-comp p-3.5 text-left hover:border-deep-teal transition-colors" onClick={() => navigate(`/bank/exercise/${r.q.setId}`)}>
                <p className="text-sm font-medium leading-5 mb-1.5 line-clamp-1">{r.q.topic}</p>
                <p className="text-xs text-warm-stone leading-5 line-clamp-2 mb-2">{r.reason}</p>
                <span className="text-xs text-deep-teal font-medium flex items-center gap-0.5">Start practice <Icon name="chevron_right" size={14} /></span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Question list */}
      {filtered.length === 0 ? (
        <div className="zb-card text-center py-12 text-warm-stone text-sm">No questions match the filters — try loosening them</div>
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="flex flex-col gap-3">
          {filtered.map((q) => <QuestionRow key={q.id} q={q} smart={smart} />)}
        </motion.div>
      )}

      {/* Upload exam paper */}
      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload exam paper">
        <label className="border-2 border-dashed border-warm-stone/30 rounded-card p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-deep-teal hover:bg-teal-tint/40 transition-colors">
          <Icon name="upload_file" size={32} className="text-deep-teal" />
          <p className="text-sm font-medium">Select a paper file (PDF / photo)</p>
          <p className="text-xs text-warm-stone">The AI will automatically split it into individual questions and classify them</p>
          <input type="file" className="hidden" disabled={isActionPending('addTask')} onChange={uploadPaper} />
        </label>
      </Modal>
    </div>
  )
}
