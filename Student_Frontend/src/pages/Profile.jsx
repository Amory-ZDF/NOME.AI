import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApp } from '../store/AppStore'
import { ERROR_TYPE_META } from '../data/mockData'
import { Icon, Badge, Modal, ProgressBar, Toggle, staggerContainer, fadeUpItem } from '../components/ui'

const masteryColor = (m) => (m >= 80 ? '#059669' : m >= 60 ? '#0D9488' : m >= 40 ? '#D97706' : '#DC2626')

// ---------- Knowledge graph (SVG) ----------
function KnowledgeGraph({ graph }) {
  const [selected, setSelected] = useState(null)
  const { notes, errors } = useApp()
  const nodes = graph?.nodes ?? []
  const edges = graph?.edges ?? []

  return (
    <section className="zb-card mb-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="zb-section-title">Knowledge Graph</h2>
      </div>
      <div className="grid lg:grid-cols-[1fr_260px] gap-4">
        <svg viewBox="0 0 540 320" className="w-full rounded-comp bg-warm-paper/60">
          {edges.map(([a, b]) => {
            const na = nodes.find((n) => n.id === a)
            const nb = nodes.find((n) => n.id === b)
            if (!na || !nb) return null
            return <line key={`${a}-${b}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke="rgba(120,113,108,0.18)" strokeWidth="1.5" />
          })}
          {nodes.map((n) => {
            const r = 14 + n.weight * 0.7
            const active = selected === n.id
            return (
              <g key={n.id} className="cursor-pointer" onClick={() => setSelected(active ? null : n.id)}>
                {active && <circle cx={n.x} cy={n.y} r={r + 6} fill="none" stroke="#0D9488" strokeWidth="2" strokeDasharray="4 3" />}
                <circle cx={n.x} cy={n.y} r={r} fill={masteryColor(n.mastery)} opacity="0.85" />
                <text x={n.x} y={n.y - 3} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="600">{n.name}</text>
                <text x={n.x} y={n.y + 10} textAnchor="middle" fill="#fff" fontSize="10" fontFamily="JetBrains Mono">{n.mastery}%</text>
              </g>
            )
          })}
        </svg>

        {/* Node detail panel */}
        <div className="border border-whisper-line rounded-comp p-4 text-sm">
          {selected ? (() => {
            const node = nodes.find((n) => n.id === selected)
            const relatedNotes = notes.filter((n) => n.linkedTopics.some((t) => t.includes(node.name)) || n.folderPath.includes(node.name))
            const relatedErrors = errors.filter((e) => e.relatedTopic.includes(node.name))
            return (
              <>
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold">{node.name}</p>
                  <span className="font-mono text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: masteryColor(node.mastery) }}>{node.mastery}%</span>
                </div>
                <p className="text-xs text-warm-stone mb-3">Exam weight: {node.weight}% · {node.mastery >= 60 ? 'keep practising to consolidate' : 'needs focused reinforcement'}</p>
                <p className="text-xs font-semibold text-warm-stone mb-1">Related notes</p>
                <p className="text-xs text-deep-ink mb-3">{relatedNotes.length > 0 ? relatedNotes.map((n) => n.title).join(', ') : 'No linked notes yet'}</p>
                <p className="text-xs font-semibold text-warm-stone mb-1">Related errors</p>
                <p className="text-xs text-deep-ink mb-3">{relatedErrors.length > 0 ? `${relatedErrors.length} item(s) (${relatedErrors.map((e) => e.relatedTopic).join(', ')})` : 'No linked errors yet'}</p>
                <a href="#bank" className="text-xs text-deep-teal hover:underline">Practice this topic in the bank →</a>
              </>
            )
          })() : (
            <div className="h-full flex flex-col items-center justify-center text-warm-stone text-xs py-8 text-center gap-2">
              <Icon name="touch_app" size={24} />
              Tap a graph node to see<br />related notes, errors and practice questions
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-4 mt-3 text-xs text-warm-stone flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-success-green" />≥80% Mastered</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-deep-teal" />60-80% Good</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-alert-amber" />40-60% Weak</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-error-red" />&lt;40% Needs work</span>
      </div>
    </section>
  )
}

// ---------- Progress timeline (SVG line chart) ----------
function ProgressChart({ timeline }) {
  const W = 560; const H = 180; const P = 28
  const points = timeline.map((d, i) => {
    const x = P + (i / (timeline.length - 1)) * (W - P * 2)
    const y = H - P - ((d.mastery - 40) / 50) * (H - P * 2)
    return { ...d, x, y }
  })
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  return (
    <section className="zb-card mb-4">
      <h2 className="zb-section-title mb-4">Progress Timeline</h2>
      {timeline.length === 0 ? (
        <p className="text-sm text-warm-stone">No practice sessions yet — your progress will appear here.</p>
      ) : timeline.length === 1 ? (
        <div className="text-sm text-warm-stone">First session recorded on <span className="text-deep-ink font-medium">{timeline[0].date}</span> — keep going to build a trend.</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {[50, 60, 70, 80].map((v) => {
            const y = H - P - ((v - 40) / 50) * (H - P * 2)
            return (
              <g key={v}>
                <line x1={P} y1={y} x2={W - P} y2={y} stroke="rgba(120,113,108,0.12)" />
                <text x={P - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#78716C" fontFamily="JetBrains Mono">{v}</text>
              </g>
            )
          })}
          <path d={`${path} L${points[points.length - 1].x},${H - P} L${points[0].x},${H - P} Z`} fill="rgba(13,148,136,0.07)" />
          <path d={path} fill="none" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" />
          {points.map((p, pointIndex) => (
            // date (month-day) is not unique when several sessions land on the
            // same day, so key by position.
            <g key={`${p.date}-${pointIndex}`}>
              <circle cx={p.x} cy={p.y} r={p.event ? 5 : 3} fill={p.event ? '#D97706' : '#0D9488'} />
              {p.event && <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="9" fill="#D97706">{p.event}</text>}
              <text x={p.x} y={H - 8} textAnchor="middle" fontSize="8" fill="#78716C" fontFamily="JetBrains Mono">{p.date}</text>
            </g>
          ))}
        </svg>
      )}
    </section>
  )
}

// ---------- Error patterns ----------
function ErrorPattern({ errorPatterns }) {
  const entries = Object.entries(errorPatterns.distribution)
  return (
    <section className="zb-card mb-4">
      <h2 className="zb-section-title mb-4">Error Patterns</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-warm-stone">No error patterns yet — review your wrong answers to unlock insights.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3 mb-4">
            {entries.map(([type, pct]) => (
              <div key={type} className="flex items-center gap-3">
                <span className="text-sm w-20 shrink-0">{ERROR_TYPE_META[type]?.label ?? type}</span>
                <div className="flex-1 h-4 rounded-full bg-warm-stone/10 overflow-hidden">
                  <motion.div className="h-full rounded-full" style={{ backgroundColor: ERROR_TYPE_META[type]?.color ?? '#78716C' }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 100, damping: 20 }} />
                </div>
                <span className="font-mono text-sm w-10 text-right">{pct}%</span>
              </div>
            ))}
          </div>
          <div className="bg-alert-amber/10 border border-alert-amber/20 rounded-comp p-3.5 text-sm leading-6 text-warm-stone">
            <span className="font-semibold text-alert-amber">Insight: </span>{errorPatterns.insight}
          </div>
        </>
      )}
    </section>
  )
}

// ---------- Achievements ----------
function Achievements({ achievements }) {
  return (
    <section className="zb-card mb-4">
      <h2 className="zb-section-title mb-4">Achievements</h2>
      <div className="grid grid-cols-4 gap-3">
        {achievements.map((a) => (
          <div key={a.id} className={`flex flex-col items-center text-center rounded-comp border p-3 ${a.earned ? 'border-whisper-line bg-pure-surface' : 'border-dashed border-warm-stone/25 bg-warm-paper/60 opacity-60'}`} title={a.description}>
            <span className="text-2xl mb-1.5">{a.earned ? a.icon : '🔒'}</span>
            <p className="text-xs font-medium leading-4">{a.name}</p>
            {a.earned
              ? <p className="text-[10px] text-warm-stone font-mono mt-1">{a.earnedAt.slice(5)}</p>
              : a.progress && <p className="text-[10px] text-warm-stone font-mono mt-1">{a.progress.current}/{a.progress.target}</p>}
          </div>
        ))}
      </div>
      <p className="text-xs text-warm-stone mt-3">Achievements reward effective learning behaviours (persistence, review, independent solving) — not raw scores.</p>
    </section>
  )
}

// ---------- Settings panel (PRD §7.4) ----------
function SettingsModal({ open, onClose }) {
  const { settings, updateSettings, showToast, isActionPending } = useApp()
  const [draft, setDraft] = useState(settings)
  useEffect(() => {
    if (open && settings) setDraft(settings)
  }, [open, settings])
  if (!settings) return null
  const pending = isActionPending('updateSettings')
  const save = async () => {
    try {
      await updateSettings(draft)
      showToast('Settings saved and applied', 'success')
      onClose()
    } catch {
      // AppStore rolls back and displays the write failure.
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-5">
        <div>
          <label htmlFor="settings-tone" className="text-sm font-medium block mb-2">AI tone style</label>
          <input
            id="settings-tone" type="range" min="0" max="100" value={draft.tone}
            onChange={(e) => setDraft((current) => ({ ...current, tone: Number(e.target.value) }))}
            className="w-full accent-teal-600"
          />
          <div className="flex justify-between text-xs text-warm-stone mt-1">
            <span className={draft.tone < 50 ? 'text-deep-teal font-medium' : ''}>Warm & encouraging</span>
            <span className={draft.tone >= 50 ? 'text-deep-teal font-medium' : ''}>Strict coach</span>
          </div>
        </div>
        <div>
          <label htmlFor="settings-daily-goal" className="text-sm font-medium block mb-2">Daily study goal (hours)</label>
          <input
            id="settings-daily-goal"
            type="number" min="1" max="12" className="zb-input max-w-[120px]"
            value={draft.dailyGoalHours}
            onChange={(e) => setDraft((current) => ({ ...current, dailyGoalHours: Number(e.target.value) }))}
          />
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Reminders</p>
          <Toggle checked={draft.reminderTask} onChange={(v) => setDraft((current) => ({ ...current, reminderTask: v }))} label="Task deadline reminders" />
          <Toggle checked={draft.reminderErrorReview} onChange={(v) => setDraft((current) => ({ ...current, reminderErrorReview: v }))} label="Error review reminders" />
          <Toggle checked={draft.reminderStudyTime} onChange={(v) => setDraft((current) => ({ ...current, reminderStudyTime: v }))} label="Daily study-time reminders" />
        </div>
        <button className="zb-btn-primary" onClick={save} disabled={pending}>Save settings</button>
      </div>
    </Modal>
  )
}

// ---------- Profile page ----------
export default function Profile() {
  const [searchParams] = useSearchParams()
  const [settingsOpen, setSettingsOpen] = useState(searchParams.get('settings') === '1')
  const { student, profile, loadProfile } = useApp()

  useEffect(() => { loadProfile() }, [loadProfile])

  const name = student?.name ?? 'Student'
  const initial = (name[0] ?? 'S').toUpperCase()
  const joinedDays = student?.joinedDays ?? 0
  const gradeInfo = student?.gradeInfo ?? ''
  const o = profile?.profileOverview

  const graphSubject = profile?.knowledgeGraph ? Object.keys(profile.knowledgeGraph)[0] : undefined
  const graph = graphSubject ? profile.knowledgeGraph[graphSubject] : { nodes: [], edges: [] }

  return (
    <div className="max-w-content mx-auto px-4 lg:px-0 py-8">
      {/* User header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 mb-6">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-deep-teal text-white text-2xl font-semibold flex items-center justify-center">{initial}</div>
          <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-success-green border-2 border-warm-paper" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <Badge tone="teal">Premium Learner</Badge>
          </div>
          <p className="text-sm text-warm-stone mt-0.5">On NOME.AI for {joinedDays} days · {gradeInfo}</p>
        </div>
        <button className="p-2 rounded-comp text-warm-stone hover:text-deep-ink hover:bg-teal-tint" onClick={() => setSettingsOpen(true)}>
          <Icon name="settings" size={22} />
        </button>
      </motion.div>

      {/* Learning overview */}
      <motion.section variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <motion.div variants={fadeUpItem} className="zb-card !p-5">
          <p className="text-xs text-warm-stone mb-1.5">Mastery score</p>
          <p className="font-mono text-2xl text-deep-teal mb-2">{o?.currentScore ?? 0}%</p>
          <ProgressBar value={((o?.currentScore ?? 0) / (o?.targetScore || 1)) * 100} />
          <p className="text-xs text-warm-stone mt-1.5">Target <span className="font-mono">{o?.targetScore ?? 0}%</span></p>
        </motion.div>
        <motion.div variants={fadeUpItem} className="zb-card !p-5">
          <p className="text-xs text-warm-stone mb-1.5">Daily average</p>
          <p className="font-mono text-2xl">{o?.dailyHours ?? 0}<span className="text-sm text-warm-stone">h/day</span></p>
          <p className="text-xs text-success-green mt-1.5">+12% vs last week</p>
        </motion.div>
        <motion.div variants={fadeUpItem} className="zb-card !p-5">
          <p className="text-xs text-warm-stone mb-1.5">Study streak</p>
          <p className="font-mono text-2xl">🔥 {o?.streak ?? 0}<span className="text-sm text-warm-stone"> days</span></p>
          <p className="text-xs text-warm-stone mt-1.5">Personal best: {o?.bestStreak ?? 0} days</p>
        </motion.div>
        <motion.div variants={fadeUpItem} className="zb-card !p-5">
          <p className="text-xs text-warm-stone mb-1.5">Total practice</p>
          <p className="font-mono text-2xl">{o?.totalQuestions ?? 0}<span className="text-sm text-warm-stone"> questions</span></p>
          <p className="text-xs text-warm-stone mt-1.5">Overall accuracy <span className="font-mono">{o?.overallAccuracy ?? 0}%</span></p>
        </motion.div>
      </motion.section>

      <KnowledgeGraph graph={graph} />
      <ProgressChart timeline={profile?.progressTimeline ?? []} />
      <ErrorPattern errorPatterns={profile?.errorPatterns ?? { distribution: {}, insight: '' }} />
      <Achievements achievements={profile?.achievements ?? []} />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
