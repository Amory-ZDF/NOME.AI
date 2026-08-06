import { useState } from 'react'
import { useApp } from '../store/AppStore'
import { TaskList } from '../features/tasks/TaskList'
import { filterTasks } from '../features/tasks/taskRules'

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
]

export default function Tasks() {
  const { tasks, learningSummary } = useApp()
  const [tab, setTab] = useState('all')
  const now = new Date()

  const filtered = filterTasks(tasks, tab, now)

  return (
    <div className="max-w-content mx-auto px-4 lg:px-0 py-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
        <p className="text-sm text-warm-stone">
          Total <span className="font-mono text-deep-ink">{tasks.length}</span> ·
          Pending <span className="font-mono text-deep-ink"> {tasks.filter((t) => t.status === 'pending').length}</span>
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-deep-teal text-white' : 'bg-pure-surface border border-whisper-line text-warm-stone hover:bg-teal-tint'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <TaskList tasks={filtered} now={now} availableMinutes={60} weakTopics={learningSummary?.weakTopics ?? []} showNextUp />
    </div>
  )
}
