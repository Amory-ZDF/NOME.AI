import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApp } from '../store/AppStore'
import {
  student, profileOverview, knowledgeGraphData, progressTimeline,
  errorPatternData, achievements, ERROR_TYPE_META,
} from '../data/mockData'
import { Icon, Badge, Modal, ProgressBar, Toggle, staggerContainer, fadeUpItem } from '../components/ui'

const masteryColor = (m) => (m >= 80 ? '#059669' : m >= 60 ? '#0D9488' : m >= 40 ? '#D97706' : '#DC2626')

// ---------- Knowledge graph (SVG) ----------
function KnowledgeGraph() {
  const [subject, setSubject] = useState('A-Level Math')
  const [selected, setSelected] = useState(null)
  const { notes, errors } = useApp()
  const graph = knowledgeGraphData[subject]

  return (
    <section className="zb-card mb-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="zb-section-title">Knowledge Graph</h2>
        <select className="zb-input !w-auto !h-8 text-sm" value={subject} onChange={(e) => { setSubject(e.target.value); setSelected(null) }}>
          {Object.keys(knowledgeGraphData).map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="grid lg:grid-cols-[1fr_260px] gap-4">
        <svg viewBox="0 0 540 320" className="w-full rounded-comp bg-warm-paper/60">
          {graph.edges.map(([a, b]) => {
            const na = graph.nodes.find((n) => n.id === a)
            const nb = graph.nodes.find((n) => n.id === b)
            return <line key={`${a}-${b}`} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke="rgba(120,113,108,0.18)" strokeWidth="1.5" />
          })}
          {graph.nodes.map((n) => {
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
            const node = graph.nodes.find((n) => n.id === selected)
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
function ProgressChart() {
  const W = 560; const H = 180; const P = 28
  const points = progressTimeline.map((d, i) => {
    const x = P + (i / (progressTimeline.length - 1)) * (W - P * 2)
    const y = H - P - ((d.mastery - 40) / 50) * (H - P * 2)
    return { ...d, x, y }
  })
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

  return (
    <section className="zb-card mb-4">
      <h2 className="zb-section-title mb-4">Progress Timeline</h2>
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
        {points.map((p) => (
          <g key={p.date}>
            <circle cx={p.x} cy={p.y} r={p.event ? 5 : 3} fill={p.event ? '#D97706' : '#0D9488'} />
            {p.event && <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="9" fill="#D97706">{p.event}</text>}
            <text x={p.x} y={H - 8} textAnchor="middle" fontSize="8" fill="#78716C" fontFamily="JetBrains Mono">{p.date}</text>
          </g>
        ))}
      </svg>
      <p className="text-sm text-warm-stone mt-2">
        <Icon name="lightbulb" size={15} className="text-alert-amber mr-1" />
        Milestone: <span className="text-deep-ink font-medium">trigonometry went from zero to fluent in 12 days</span> — your fastest-mastered complex topic so far.
      </p>
    </section>
  )
}

// ---------- Error patterns ----------
function ErrorPattern() {
  const entries = Object.entries(errorPatternData.distribution)
  return (
    <section className="zb-card mb-4">
      <h2 className="zb-section-title mb-4">Error Patterns</h2>
      <div className="flex flex-col gap-3 mb-4">
        {entries.map(([type, pct]) => (
          <div key={type} className="flex items-center gap-3">
            <span className="text-sm w-20 shrink-0">{ERROR_TYPE_META[type].label}</span>
            <div className="flex-1 h-4 rounded-full bg-warm-stone/10 overflow-hidden">
              <motion.div className="h-full rounded-full" style={{ backgroundColor: ERROR_TYPE_META[type].color }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: 'spring', stiffness: 100, damping: 20 }} />
            </div>
            <span className="font-mono text-sm w-10 text-right">{pct}%</span>
          </div>
        ))}
      </div>
      <div className="bg-alert-amber/10 border border-alert-amber/20 rounded-comp p-3.5 text-sm leading-6 text-warm-stone">
        <span className="font-semibold text-alert-amber">Insight: </span>{errorPatternData.insight}
      </div>
    </section>
  )
}

// ---------- Achievements ----------
function Achievements() {
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
  const { settings, updateSettings, showToast } = useApp()
  if (!settings) return null
  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-5">
        <div>
          <label className="text-sm font-medium block mb-2">AI tone style</label>
          <input
            type="range" min="0" max="100" value={settings.tone}
            onChange={(e) => updateSettings({ tone: Number(e.target.value) })}
            className="w-full accent-teal-600"
          />
          <div className="flex justify-between text-xs text-warm-stone mt-1">
            <span className={settings.tone < 50 ? 'text-deep-teal font-medium' : ''}>Warm & encouraging</span>
            <span className={settings.tone >= 50 ? 'text-deep-teal font-medium' : ''}>Strict coach</span>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium block mb-2">Daily study goal (hours)</label>
          <input
            type="number" min="1" max="12" className="zb-input max-w-[120px]"
            value={settings.dailyGoalHours}
            onChange={(e) => updateSettings({ dailyGoalHours: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">Reminders</p>
          <Toggle checked={settings.reminderTask} onChange={(v) => updateSettings({ reminderTask: v })} label="Task deadline reminders" />
          <Toggle checked={settings.reminderErrorReview} onChange={(v) => updateSettings({ reminderErrorReview: v })} label="Error review reminders" />
          <Toggle checked={settings.reminderStudyTime} onChange={(v) => updateSettings({ reminderStudyTime: v })} label="Daily study-time reminders" />
        </div>
        <button className="zb-btn-primary" onClick={() => { showToast('Settings saved and applied', 'success'); onClose() }}>Save settings</button>
      </div>
    </Modal>
  )
}

// ---------- Profile page ----------
export default function Profile() {
  const [searchParams] = useSearchParams()
  const [settingsOpen, setSettingsOpen] = useState(searchParams.get('settings') === '1')
  const o = profileOverview

  return (
    <div className="max-w-content mx-auto px-4 lg:px-0 py-8">
      {/* User header */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4 mb-6">
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-deep-teal text-white text-2xl font-semibold flex items-center justify-center">{student.name[0]}</div>
          <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-success-green border-2 border-warm-paper" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{student.name}</h1>
            <Badge tone="teal">Premium Learner</Badge>
          </div>
          <p className="text-sm text-warm-stone mt-0.5">On NOME.AI for {student.joinedDays} days · {student.gradeInfo}</p>
        </div>
        <button className="p-2 rounded-comp text-warm-stone hover:text-deep-ink hover:bg-teal-tint" onClick={() => setSettingsOpen(true)}>
          <Icon name="settings" size={22} />
        </button>
      </motion.div>

      {/* Learning overview */}
      <motion.section variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <motion.div variants={fadeUpItem} className="zb-card !p-5">
          <p className="text-xs text-warm-stone mb-1.5">Mastery score</p>
          <p className="font-mono text-2xl text-deep-teal mb-2">{o.currentScore}%</p>
          <ProgressBar value={(o.currentScore / o.targetScore) * 100} />
          <p className="text-xs text-warm-stone mt-1.5">Target <span className="font-mono">{o.targetScore}%</span></p>
        </motion.div>
        <motion.div variants={fadeUpItem} className="zb-card !p-5">
          <p className="text-xs text-warm-stone mb-1.5">Daily average</p>
          <p className="font-mono text-2xl">{o.dailyHours}<span className="text-sm text-warm-stone">h/day</span></p>
          <p className="text-xs text-success-green mt-1.5">+12% vs last week</p>
        </motion.div>
        <motion.div variants={fadeUpItem} className="zb-card !p-5">
          <p className="text-xs text-warm-stone mb-1.5">Study streak</p>
          <p className="font-mono text-2xl">🔥 {o.streak}<span className="text-sm text-warm-stone"> days</span></p>
          <p className="text-xs text-warm-stone mt-1.5">Personal best: {o.bestStreak} days</p>
        </motion.div>
        <motion.div variants={fadeUpItem} className="zb-card !p-5">
          <p className="text-xs text-warm-stone mb-1.5">Total practice</p>
          <p className="font-mono text-2xl">{o.totalQuestions}<span className="text-sm text-warm-stone"> questions</span></p>
          <p className="text-xs text-warm-stone mt-1.5">Overall accuracy <span className="font-mono">{o.overallAccuracy}%</span></p>
        </motion.div>
      </motion.section>

      <KnowledgeGraph />
      <ProgressChart />
      <ErrorPattern />
      <Achievements />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
