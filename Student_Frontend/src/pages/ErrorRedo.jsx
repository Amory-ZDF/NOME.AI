import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApp } from '../store/AppStore'
import { isThrowaway } from '../data/mockData'
import { Icon, Badge, MathHTML } from '../components/ui'

// PRD §4.4 redo mode: single-question focus, no AI hints
export default function ErrorRedo() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { errors, recordRedo, markErrorMastered, showToast, isActionPending } = useApp()
  const item = errors.find((e) => e.id === id)

  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null) // { isCorrect }

  if (!item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <p className="text-warm-stone">Error question not found</p>
        <button className="zb-btn-ghost" onClick={() => navigate('/errors')}>Back to Error Book</button>
      </div>
    )
  }

  const recording = isActionPending(`recordRedo:${item?.id}`)
  const mastering = isActionPending(`markErrorMastered:${item?.id}`)

  const submit = async () => {
    if (isThrowaway(answer)) {
      showToast('Please answer seriously first', 'error')
      return
    }
    const normalized = answer.trim().toLowerCase()
    let isCorrect
    if (item.options && item.correctIndex != null) {
      const letter = ['a', 'b', 'c', 'd'][item.correctIndex]
      isCorrect = normalized === letter || normalized.startsWith(letter)
    } else {
      isCorrect = item.acceptKeywords.some((k) => normalized.includes(k.toLowerCase()))
    }
    try {
      await recordRedo(item.id, { answer, isCorrect, timeSpent: 0 })
      setResult({ isCorrect })
    } catch {
      // AppStore rolls back and displays the write failure.
    }
  }

  return (
    <div className="min-h-screen bg-warm-paper">
      {/* Top bar */}
      <div className="bg-pure-surface border-b border-whisper-line sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 lg:px-8 h-14 max-w-[1200px] mx-auto">
          <div className="flex items-center gap-3">
            <button className="p-1.5 rounded-comp text-warm-stone hover:bg-teal-tint" onClick={() => navigate('/errors')}>
              <Icon name="arrow_back" size={20} />
            </button>
            <span className="font-semibold">Error Redo</span>
            <Badge tone="amber">Independent mode · No AI hints</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-4 lg:px-8 py-6 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 items-start">
        {/* Question */}
        <div className="zb-card">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Badge tone="teal">{item.subject}</Badge>
            <Badge tone="stone">{item.relatedTopic}</Badge>
            {item.repeatCount > 1 && <Badge tone="amber">Previously wrong {item.repeatCount}×</Badge>}
          </div>
          <div className="text-[15px] leading-7 mb-5"><MathHTML html={item.questionContent} /></div>

          {!result ? (
            <>
              <p className="text-sm font-semibold mb-2.5">Your solution</p>
              {item.options ? (
                <div className="flex flex-col gap-2.5">
                  {item.options.map((opt, i) => (
                    <label key={i} className={`flex items-center gap-3 border rounded-comp px-4 py-3 cursor-pointer text-sm transition-colors ${answer === opt ? 'border-deep-teal bg-teal-tint' : 'border-whisper-line hover:bg-warm-paper'}`}>
                      <input type="radio" className="accent-teal-600" checked={answer === opt} onChange={() => setAnswer(opt)} />
                      {opt}
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  className="zb-input !h-36 py-3 resize-none leading-6"
                  placeholder="Write out your full solution independently…"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                />
              )}
              <button className="zb-btn-primary w-full mt-5" onClick={submit} disabled={recording}>
                <Icon name="fact_check" size={16} /> Submit answer
              </button>
            </>
          ) : (
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="bg-error-red/5 rounded-comp p-3">
                <p className="text-xs font-semibold text-error-red mb-1">Your last answer (wrong)</p>
                <p className="text-warm-stone">{item.studentAnswer}</p>
              </div>
              <div className="bg-success-green/5 rounded-comp p-3">
                <p className="text-xs font-semibold text-success-green mb-1">Correct answer</p>
                <p className="text-warm-stone">{item.correctAnswer}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right: independent mode panel */}
        <div className="zb-card sticky top-20">
          <h3 className="font-semibold flex items-center gap-1.5 mb-4">
            <Icon name="self_improvement" size={18} className="text-deep-teal" /> Work Independently
          </h3>

          {!result && (
            <div className="text-sm text-warm-stone leading-7">
              <p className="italic mb-3">"No hints this time. Rely entirely on your own recall of the method — it's the best way to test real mastery."</p>
              <div className="bg-warm-paper rounded-comp p-3 text-xs leading-6">
                <p className="font-semibold text-deep-ink mb-1">Stuck? Here's what to do:</p>
                <p>Recall which note covered this topic, then try deriving from the definition. It's okay if you can't finish — a targeted comparison analysis will appear after you submit.</p>
              </div>
            </div>
          )}

          {result?.isCorrect && (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                className="w-14 h-14 rounded-full bg-success-green/10 flex items-center justify-center mx-auto mb-3"
              >
                <Icon name="check_circle" size={36} className="text-success-green" filled />
              </motion.div>
              <p className="font-semibold text-success-green mb-2">Correct this time!</p>
              <p className="text-sm text-warm-stone leading-6 mb-4">
                Compared to last time, you fixed: {item.errorDescription}
              </p>
              <button className="zb-btn-primary w-full mb-2" disabled={mastering} onClick={async () => {
                try {
                  await markErrorMastered(item.id)
                  navigate('/errors')
                } catch {
                  // AppStore displays the write failure and the page remains in place.
                }
              }}>
                <Icon name="workspace_premium" size={16} /> Mark as mastered
              </button>
              <button className="zb-btn-ghost w-full" onClick={() => navigate('/errors')}>Back to Error Book</button>
            </motion.div>
          )}

          {result && !result.isCorrect && (
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
              <p className="font-semibold text-alert-amber mb-2 flex items-center gap-1.5">
                <Icon name="error" size={18} /> Still incorrect
              </p>
              <div className="bg-warm-paper rounded-comp p-3 text-sm text-warm-stone leading-6 mb-4">
                <p className="font-semibold text-deep-ink mb-1">Targeted analysis</p>
                <p>{item.analysis}</p>
                <p className="mt-2 text-xs text-alert-amber">This is the {item.repeatCount}th mistake on this question — the repeat counter has been updated.</p>
              </div>
              <button className="zb-btn-primary w-full mb-2" onClick={() => { setResult(null); setAnswer('') }}>
                <Icon name="replay" size={16} /> Try again
              </button>
              <button className="zb-btn-ghost w-full" onClick={() => navigate('/errors')}>Back to Error Book</button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
