import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../store/AppStore'
import { Icon, Badge, staggerContainer, fadeUpItem } from '../components/ui'
import { TaskList } from '../features/tasks/TaskList'

// ---------- Greeting ----------
function Greeting() {
  const { tasks, greeting } = useApp()
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
      {greeting && <p className="text-warm-stone italic mt-1 text-sm">"{greeting.message}"</p>}
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
  const { moduleStats } = useApp()
  return (
    <motion.section variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {moduleCards.map((m) => (
        <motion.div key={m.title} variants={fadeUpItem} className="zb-card zb-card-hover !p-5" onClick={() => navigate(m.to)}>
          <Icon name={m.icon} size={24} className="text-deep-teal" />
          <p className="font-semibold mt-2.5">{m.title}</p>
          <p className="text-xs text-warm-stone mt-0.5">{m.desc}</p>
          <p className="font-mono text-xl mt-2 text-deep-ink">
            {moduleStats?.[m.key] ?? 0}<span className="text-sm text-warm-stone ml-1">{m.suffix}</span>
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
  const { learningSummary: s } = useApp()

  if (!s) return null

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
  const { tasks, learningSummary } = useApp()
  const now = new Date()
  return (
    <div className="max-w-content mx-auto px-4 lg:px-0 py-8">
      <Greeting />
      <TaskList tasks={tasks} now={now} availableMinutes={60} weakTopics={learningSummary?.weakTopics ?? []} showNextUp celebrateWhenNoPending />
      <ModuleCards />
      <LearningStatus />
    </div>
  )
}
