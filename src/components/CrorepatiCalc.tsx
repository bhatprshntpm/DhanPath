import { useState, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { projectLifetime, fmtINR } from '../lib/calc'

export default function CrorepatiCalc() {
  const { data } = useApp()
  const { settings, scenarios, snapshots } = data
  const baseline  = scenarios.find(s => s.id === 'baseline') ?? scenarios[0]

  const latestNw   = snapshots.length
    ? snapshots[snapshots.length - 1].assets.checking +
      snapshots[snapshots.length - 1].assets.savings +
      snapshots[snapshots.length - 1].assets.brokerage +
      snapshots[snapshots.length - 1].assets.retirement
    : 0

  const autoTarget = Math.ceil((settings.monthlyExpenses * 12 * 25) / 1e7) * 1e7
  const [target, setTarget]     = useState(autoTarget || 100000000)
  const [useAuto, setUseAuto]   = useState(true)
  const finalTarget = useAuto ? autoTarget : target

  const projection = useMemo(() => {
    if (!baseline) return null
    return projectLifetime(latestNw, settings, baseline, [])
  }, [latestNw, settings, baseline])

  const hitPoint = projection?.find(p => p.value >= finalTarget && p.phase === 'accumulation')
  const hitAge   = hitPoint?.age
  const hitYear  = hitPoint?.year
  const yrsAway  = hitYear ? hitYear - new Date().getFullYear() : null
  const pct      = Math.min((latestNw / finalTarget) * 100, 100)

  const milestones = [1e7, 5e7, 1e8, 5e8, 1e9]
    .map(m => {
      const pt = projection?.find(p => p.value >= m && p.phase === 'accumulation')
      return { amount: m, age: pt?.age, year: pt?.year }
    })
    .filter(m => m.amount <= finalTarget * 2)

  return (
    <div className="card p-5 flex flex-col gap-5">
      <div>
        <p className="section-title">Corpus Projections</p>
        <p className="text-xs text-surface-300">When will you reach your target corpus?</p>
      </div>

      {/* Target selector */}
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setUseAuto(true)}
            className={`p-3 rounded-xl border text-xs font-medium transition-colors ${useAuto ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-surface-200 text-surface-800'}`}>
            Auto (25× expenses)<br/>
            <span className="font-bold text-sm">{fmtINR(autoTarget)}</span>
          </button>
          <button onClick={() => setUseAuto(false)}
            className={`p-3 rounded-xl border text-xs font-medium transition-colors ${!useAuto ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-surface-200 text-surface-800'}`}>
            Set my own target
          </button>
        </div>

        {!useAuto && (
          <div>
            <div className="flex flex-wrap gap-2 mb-2">
              {[1e7, 5e7, 1e8, 2e8, 5e8, 1e9].map(v => (
                <button key={v} onClick={() => setTarget(v)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${target === v ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-surface-200 text-surface-800 hover:border-amber-300'}`}>
                  {fmtINR(v)}
                </button>
              ))}
            </div>
            <input className="input-field" type="number" placeholder="Enter custom target (₹)"
              value={target || ''} onChange={e => setTarget(parseInt(e.target.value) || 0)} />
          </div>
        )}
      </div>

      {/* Progress */}
      <div>
        <div className="flex justify-between text-xs mb-2">
          <span className="text-surface-300">Current: <strong className="text-surface-800">{fmtINR(latestNw)}</strong></span>
          <span className="text-amber-600 font-semibold">{pct.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-surface-100 rounded-full h-3 overflow-hidden">
          <div className="h-3 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-700"
            style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-surface-300">₹0</span>
          <span className="text-surface-300">Target: {fmtINR(finalTarget)}</span>
        </div>
      </div>

      {/* Result */}
      <div className={`p-4 rounded-2xl text-center ${hitAge ? 'bg-amber-50 border border-amber-100' : 'bg-surface-50 border border-surface-100'}`}>
        {hitAge ? (
          <>
            <p className="text-xs text-amber-600 mb-1">At current trajectory</p>
            <p className="text-2xl font-bold text-amber-700">Age {hitAge}</p>
            <p className="text-sm text-amber-600">{yrsAway} years from now · {hitYear}</p>
            {pct >= 100 && <p className="text-xs text-emerald-600 font-semibold mt-1">Already achieved!</p>}
          </>
        ) : (
          <p className="text-sm text-surface-300">Set your income & SIP in the Scenario panel to see projections</p>
        )}
      </div>

      {/* Milestone table */}
      {milestones.some(m => m.age) && (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300">Wealth milestones</p>
          {milestones.map(m => (
            <div key={m.amount} className="flex justify-between items-center text-xs py-1.5 border-b border-surface-50">
              <span className="font-medium text-surface-800">{fmtINR(m.amount)}</span>
              {m.age
                ? <span className="text-amber-600 font-medium">Age {m.age} · {m.year}</span>
                : <span className="text-surface-300">—</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
