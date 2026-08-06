const SOURCE_SCORE = { teacher_assigned: 0, error_review: 1, ai_recommended: 2 }
const PRIORITY_SCORE = { P0: 0, P1: 1, P2: 2 }

const dueTime = (dueAt) => {
  if (!dueAt) return Infinity

  const time = new Date(dueAt).getTime()
  return Number.isNaN(time) ? Infinity : time
}

export const isTaskOverdue = (task, now) => (
  task.status === 'pending' && dueTime(task.dueAt) < new Date(now).getTime()
)

export function rankTasks(tasks, { now = new Date(), availableMinutes = Infinity, weakTopics = [] } = {}) {
  return [...tasks].sort((a, b) => {
    const aWeak = (a.topicIds ?? []).some((topic) => weakTopics.includes(topic))
    const bWeak = (b.topicIds ?? []).some((topic) => weakTopics.includes(topic))
    const aDueTime = dueTime(a.dueAt)
    const bDueTime = dueTime(b.dueAt)
    const values = [
      Number(a.status === 'completed') - Number(b.status === 'completed'),
      (SOURCE_SCORE[a.type] ?? 9) - (SOURCE_SCORE[b.type] ?? 9),
      Number(isTaskOverdue(b, now)) - Number(isTaskOverdue(a, now)),
      (PRIORITY_SCORE[a.priority] ?? 9) - (PRIORITY_SCORE[b.priority] ?? 9),
      Number(a.estimatedMinutes > availableMinutes) - Number(b.estimatedMinutes > availableMinutes),
      Number(!aWeak) - Number(!bWeak),
      aDueTime === bDueTime ? 0 : aDueTime - bDueTime,
    ]

    return values.find((value) => value !== 0) ?? String(a.id).localeCompare(String(b.id))
  })
}

export function filterTasks(tasks, filter, now = new Date()) {
  if (filter === 'pending') return tasks.filter((task) => task.status === 'pending')
  if (filter === 'overdue') return tasks.filter((task) => isTaskOverdue(task, now))
  if (filter === 'completed') return tasks.filter((task) => task.status === 'completed')
  return tasks
}

export function getNextTask(tasks, context) {
  return rankTasks(filterTasks(tasks, 'pending', context?.now), context)[0] ?? null
}
