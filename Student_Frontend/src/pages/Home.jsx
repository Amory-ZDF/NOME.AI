import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../store/AppStore'
import { greetingData, moduleStats, learningSummary } from '../data/mockData'
import { Icon, Badge, PriorityBadge, EmptyState, staggerContainer, fadeUpItem } from '../components/ui'

// ---------- Greeting ----------
function Greeting() {
  const { tasks } = useApp()
  const hour = new Date().getHours()
  const period = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const pending = tasks.filter((t) => t.status === 'pending').length
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'long' })
  return (
    <section className="mb-6">
      <h1 className="text-2xl lg:text-[32px] font-bold tracking-tight leading-tight">
        {period}, Alex
      </h1>
      <p className="text-warm-stone mt-1.5 text-sm lg:text-base">
        It's {dateStr} — you have <span className="font-mono font-medium text-deep-ink">{pending}</span> pending task{pending === 1 ? '' : 's'}
      </p>
      <p className="text-warm-stone italic mt-1 text-sm">"{greetingData.message}"</p>
    </section>
  )
}

// ---------- Task item ----------
function TaskItem({ task }) {
  const navigate = useNavigate()
  const { completeTask, removeTask, cannotCompleteTask, showToast } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const done = task.status === 'completed'

  // PRD §1.3: completed tasks turn grey + strikethrough, removed from list after 1s
  const markDone = () => {
    completeTask(task.id)
    setTimeout(() => removeTask(task.id), 1000)
  }

  const openExercise = () => {
    if (done) return
    if (task.exerciseSetId) navigate(`/exercise/${task.id}`)
    else if (task.type === 'error_review') navigate('/errors')
    else showToast('This task will open in the practice module', 'info')
  }

  return (
    <motion.div layout variants={fadeUpItem} className={`group flex items-start gap-3 px-4 py-3.5 rounded-comp transition-colors ${done ? 'opacity-50' : 'hover:bg-teal-tint/60 cursor-pointer'}`} onClick={openExercise}>
      {/* Checkbox (spring animation) */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        className={`mt-0.5 w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
          done ? 'bg-success-green border-success-green' : 'border-warm-stone/40 hover:border-deep-teal'
        }`}
        onClick={(e) => {
          e.stopPropagation()
          if (!done) markDone()
        }}
      >
        <AnimatePresence>
          {done && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}><Icon name="check" size={14} className="text-white" /></motion.span>}
        </AnimatePresence>
      </motion.button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium text-[15px] ${done ? 'line-through text-warm-stone' : ''}`}>{task.title}</span>
          {task.isOverdue && <Badge tone="amber">Overdue</Badge>}
          <Badge tone="stone">{task.subject}</Badge>
          <PriorityBadge priority={task.priority} />
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-warm-stone font-mono">
          <span>{task.estimatedMinutes}min</span>
          <span>·</span>
          <span className={task.isOverdue ? 'text-alert-amber' : ''}>
            {task.dueAt ? `Due ${task.dueAt.slice(5, 10).replace('-', '/')} ${task.dueAt.slice(11, 16)}` : 'No deadline'}
          </span>
          {task.assignedBy && (<><span>·</span><span>{task.assignedBy}</span></>)}
        </div>
        {task.lastAccuracy != null && (
          <p className="text-xs text-warm-stone mt-1">Last accuracy <span className="font-mono text-deep-teal">{task.lastAccuracy}%</span> — try finishing it independently this time</p>
        )}
      </div>

      {/* More actions: cannot complete */}
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button className="p-1 rounded text-warm-stone/50 hover:text-deep-ink opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setMenuOpen(!menuOpen)}>
          <Icon name="more_horiz" size={18} />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute right-0 top-7 bg-pure-surface border border-whisper-line rounded-comp py-1 w-36 z-10">
              <button className="w-full text-left px-3 py-2 text-sm text-warm-stone hover:bg-warm-paper hover:text-error-red" onClick={() => { setMenuOpen(false); cannotCompleteTask(task.id) }}>
                Can't complete — report to teacher
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// ---------- Task list ----------
export function TaskList({ tasks, limit }) {
  const navigate = useNavigate()
  const { removeTask } = useApp()

  // PRD §1.3 sort: overdue first → teacher tasks prioritised → urgent deadlines first
  const sorted = useMemo(() => {
    const pending = tasks.filter((t) => t.status !== 'completed')
    const completed = tasks.filter((t) => t.status === 'completed')
    const score = (t) => (t.isOverdue ? 0 : t.type === 'teacher_assigned' ? 1 : 2)
    pending.sort((a, b) => score(a) - score(b) || ((a.dueAt || '9999') < (b.dueAt || '9999') ? -1 : 1))
    return [...pending, ...completed]
  }, [tasks])

  // Removed from list 1s after completion (scheduled by TaskItem)
  const shown = limit ? sorted.slice(0, limit) : sorted
  const pendingCount = tasks.filter((t) => t.status === 'pending').length

  return (
    <section className="zb-card mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="zb-section-title">Task List</h2>
        <Link to="/tasks" className="text-sm text-deep-teal hover:underline">All tasks →</Link>
      </div>
      {pendingCount === 0 && tasks.every((t) => t.status === 'completed' || t.status === 'removed') ? (
        <EmptyState
          icon="celebration"
          title="All tasks done for today"
          desc="Excellent execution! Keep the momentum going with a few more questions."
          action={<button className="zb-btn-primary" onClick={() => navigate('/bank')}>Go to Question Bank →</button>}
        />
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="-mx-2">
          {shown.map((t) => <TaskItem key={t.id} task={t} />)}
        </motion.div>
      )}
    </section>
  )
}

// ---------- Module cards 2x2 ----------
const moduleCards = [
  { icon: 'edit_note', title: 'Notes', desc: 'AI auto-organised', key: 'notesCount', suffix: 'notes', to: '/notes' },
  { icon: 'practice', title: 'Practice', desc: 'Questions this week', key: 'weeklyExercises', suffix: 'done', to: '/bank' },
  { icon: 'analytics', title: 'Summary', desc: 'Latest accuracy', key: 'latestAccuracy', suffix: '%', to: '/profile' },
  { icon: 'bookmarks', title: 'Error Book', desc: 'Awaiting review', key: 'pendingErrorReview', suffix: 'items', to: '/errors' },
]

function ModuleCards() {
  const navigate = useNavigate()
  return (
    <motion.section variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {moduleCards.map((m) => (
        <motion.div key={m.title} variants={fadeUpItem} className="zb-card zb-card-hover !p-5" onClick={() => navigate(m.to)}>
          <Icon name={m.icon} size={24} className="text-deep-teal" />
          <p className="font-semibold mt-2.5">{m.title}</p>
          <p className="text-xs text-warm-stone mt-0.5">{m.desc}</p>
          <p className="font-mono text-xl mt-2 text-deep-ink">
            {moduleStats[m.key]}<span className="text-sm text-warm-stone ml-1">{m.suffix}</span>
          </p>
        </motion.div>
      ))}
    </motion.section>
  )
}

// ---------- My Learning + heatmap ----------
function heatColor(mastery) {
  if (mastery >= 80) return '#0D9488'
  if (mastery >= 60) return '#5EEAD4'
  if (mastery >= 40) return '#D97706'
  return '#DC2626'
}

function LearningStatus() {
  const navigate = useNavigate()
  const [hover, setHover] = useState(null)
  const s = learningSummary

  return (
    <motion.section variants={fadeUpItem} initial="hidden" animate="show" className="zb-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="zb-section-title">My Learning</h2>
        <Link to="/profile" className="text-sm text-deep-teal hover:underline">Full profile →</Link>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div>
          <p className="text-xs text-warm-stone mb-1">Knowledge mastery</p>
          <p className="font-mono text-2xl text-deep-teal">{s.overallMastery}%</p>
        </div>
        <div>
          <p className="text-xs text-warm-stone mb-1">Tasks done this week</p>
          <p className="font-mono text-2xl">{s.weeklyCompleted}<span className="text-sm text-warm-stone">/{s.weeklyTotal}</span></p>
        </div>
        <div>
          <p className="text-xs text-warm-stone mb-1">Weak topics</p>
          <p className="text-sm font-medium leading-6">{s.weakTopics.join(', ')}</p>
        </div>
      </div>

      {/* Knowledge heatmap 7x4 */}
      <p className="text-xs text-warm-stone mb-2">Knowledge heatmap</p>
      <div className="relative">
        <div className="grid grid-cols-7 gap-1.5">
          {s.knowledgeHeatmap.map((cell) => (
            <div
              key={cell.topicId}
              className="aspect-square rounded-[4px] transition-transform hover:scale-110 cursor-pointer"
              style={{ backgroundColor: heatColor(cell.mastery), opacity: 0.25 + (cell.mastery / 100) * 0.75 }}
              onMouseEnter={() => setHover(cell)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </div>
        <AnimatePresence>
          {hover && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute -top-9 left-1/2 -translate-x-1/2 bg-deep-ink text-white text-xs rounded-comp px-3 py-1.5 whitespace-nowrap z-10">
              {hover.topicName} · Mastery <span className="font-mono">{hover.mastery}%</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-warm-stone">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#0D9488' }} />Mastered</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#5EEAD4' }} />Good</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#D97706' }} />Weak</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#DC2626' }} />Critical</span>
      </div>
    </motion.section>
  )
}

// ---------- Home ----------
export default function Home() {
  const { tasks } = useApp()
  return (
    <div className="max-w-content mx-auto px-4 lg:px-0 py-8">
      <Greeting />
      <TaskList tasks={tasks} />
      <ModuleCards />
      <LearningStatus />
    </div>
  )
}
