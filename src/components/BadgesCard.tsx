import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { calcBadges } from '../lib/badges'

export default function BadgesCard() {
  const { data }   = useApp()
  const badges     = useMemo(() => calcBadges(data), [data])
  const [showAll, setShowAll] = useState(false)

  const unlocked = badges.filter(b => b.unlocked)
  const locked   = badges.filter(b => !b.unlocked)
  const visible  = showAll ? locked : locked.slice(0, 4)

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Achievements</p>
          <p className="text-xs text-surface-300">{unlocked.length} of {badges.length} unlocked</p>
        </div>
        <div className="flex items-center gap-1">
          {[...Array(badges.length)].map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < unlocked.length ? 'bg-amber-400' : 'bg-surface-200'}`} />
          ))}
        </div>
      </div>

      {/* Unlocked */}
      {unlocked.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600">Unlocked 🎉</p>
          <div className="flex flex-wrap gap-2">
            {unlocked.map(b => (
              <div key={b.id} title={b.desc}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-medium text-amber-800">
                <span>{b.emoji}</span>
                <span>{b.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked */}
      <div className="flex flex-col gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-300">Next to unlock</p>
        <div className="flex flex-col gap-2">
          {visible.map(b => (
            <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-50 border border-surface-100">
              <span className="text-xl grayscale opacity-40">{b.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-surface-300">{b.title}</p>
                <p className="text-[10px] text-surface-300 truncate">{b.hint}</p>
              </div>
              <div className="w-4 h-4 rounded-full border-2 border-surface-200 shrink-0" />
            </div>
          ))}
        </div>
        {locked.length > 4 && (
          <button onClick={() => setShowAll(v => !v)} className="text-xs text-amber-600 hover:text-amber-700 font-medium text-center mt-1">
            {showAll ? 'Show less' : `+${locked.length - 4} more to unlock`}
          </button>
        )}
      </div>
    </div>
  )
}
