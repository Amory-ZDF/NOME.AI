import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useApp } from '../../store/AppStore'
import { Icon, Badge, PriorityBadge, EmptyState, staggerContainer, fadeUpItem } from '../../components/ui'
import { isTaskOverdue, rankTasks } from './taskRules'
import { TaskAdjustmentModal } from './TaskAdjustmentModal'

function TaskItem({ task, isNextUp, onRequestAdjustment }) {
  const navigate = useNavigate()
  const { completeTask, showToast, isActionPending } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const done = task.status === 'completed'

  // Completed tasks remain visible as history with a grey strikethrough.
  const completing = isActionPending(`task:complete:${task.id}`)

  const markDone = async () => {
    try {
      await completeTask(task.id)
    } catch {
      // AppStore rolls back and displays the write failure.
    }
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
        onClick={(event) => {
          event.stopPropagation()
          if (!done && !completing) markDone()
        }}
        disabled={completing}
        role="checkbox"
        aria-checked={done}
        aria-label={`Mark ${task.title} complete`}
      >
        <AnimatePresence>
          {done && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 15 }}><Icon name="check" size={14} className="text-white" /></motion.span>}
        </AnimatePresence>
      </motion.button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium text-[15px] ${done ? 'line-through text-warm-stone' : ''}`}>{task.title}</span>
          {isNextUp && <Badge tone="teal">Next up</Badge>}
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
      <div className="relative" onClick={(event) => event.stopPropagation()}>
        <button
          className="p-1 rounded text-warm-stone/50 hover:text-deep-ink opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={`More options for ${task.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <Icon name="more_horiz" size={18} />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div role="menu" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute right-0 top-7 bg-pure-surface border border-whisper-line rounded-comp py-1 w-36 z-10">
              <button className="w-full text-left px-3 py-2 text-sm text-warm-stone hover:bg-warm-paper hover:text-error-red" role="menuitem" aria-label="I can't complete this task" onClick={() => { setMenuOpen(false); onRequestAdjustment(task) }}>
                Can&apos;t complete — report to teacher
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

export function TaskList({ tasks, limit, now = new Date(), availableMinutes = Infinity, weakTopics = [], showNextUp = false }) {
  const navigate = useNavigate()
  const [adjustmentTask, setAdjustmentTask] = useState(null)

  const sorted = useMemo(() => rankTasks(tasks, { now, availableMinutes, weakTopics }).map((task) => ({
    ...task,
    isOverdue: isTaskOverdue(task, now),
  })), [tasks, now, availableMinutes, weakTopics])

  const shown = limit ? sorted.slice(0, limit) : sorted
  const nextTaskId = showNextUp ? sorted.find((task) => task.status === 'pending')?.id : null

  return (
    <section className="zb-card mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="zb-section-title">Task List</h2>
        <Link to="/tasks" className="text-sm text-deep-teal hover:underline">All tasks →</Link>
      </div>
      {tasks.length === 0 ? (
        <EmptyState
          icon="celebration"
          title="All tasks done for today"
          desc="Excellent execution! Keep the momentum going with a few more questions."
          action={<button className="zb-btn-primary" onClick={() => navigate('/bank')}>Go to Question Bank →</button>}
        />
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="-mx-2">
          {shown.map((task) => <TaskItem key={task.id} task={task} isNextUp={task.id === nextTaskId} onRequestAdjustment={setAdjustmentTask} />)}
        </motion.div>
      )}
      <TaskAdjustmentModal task={adjustmentTask} open={Boolean(adjustmentTask)} onClose={() => setAdjustmentTask(null)} />
    </section>
  )
}
