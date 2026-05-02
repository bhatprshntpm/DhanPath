import { useMemo } from 'react'
import { Calculator, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { requiredMonthlySIP, netWorth, fmt } from '../lib/calc'

export default function SipCalculator() {
  const { data } = useApp()
  const { snapshots, settings, goals, scenarios } = data

  const baseline = scenarios.find(s => s.id === 'baseline') ?? scenarios[0]
  const latestNw = snapshots.length ? netWorth(snapshots[snapshots.length - 1]) : 0

  const requiredSIP = useMemo(() => {
    if (!baseline) return 0
    return requiredMonthlySIP(latestNw, settings, baseline, goals.filter(g => g.enabled && g.priority === 'Must'))
  }, [latestNw, settings, baseline, goals])

  const currentSIP = baseline?.assumptions.extraMonthlySavings ?? 0
  const gap        = requiredSIP - currentSIP
  const isFunded   = gap <= 0
  const mustGoals  = goals.filter(g => g.enabled && g.priority === 'Must')

  if (mustGoals.length === 0) return null

  return (
    <div className={`card p-5 flex flex-col gap-3 border-l-4 ${isFunded ? 'border-l-emerald-400' : 'border-l-rose-400'}`}>
      <div className="flex items-center gap-2">
        <Calculator size={16} className={isFunded ? 'text-emerald-500' : 'text-rose-500'} />
        <p className="section-title mb-0">Required SIP Calculator</p>
      </div>

      <p className="text-xs text-surface-300">
        Minimum monthly extra investment to fund all <strong>{mustGoals.length} Must</strong> goals by target age
      </p>

      <div className="flex items-end gap-6 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-surface-300 font-semibold">Required</p>
          <p className="text-2xl font-semibold text-surface-800 font-mono">{fmt(requiredSIP)}<span className="text-sm font-normal text-surface-300">/mo</span></p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-surface-300 font-semibold">Current</p>
          <p className="text-2xl font-semibold text-surface-800 font-mono">{fmt(currentSIP)}<span className="text-sm font-normal text-surface-300">/mo</span></p>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold ${isFunded ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
          {isFunded
            ? <><CheckCircle size={14}/> Fully funded</>
            : <><AlertTriangle size={14}/> Gap: {fmt(gap)}/mo</>
          }
        </div>
      </div>

      {!isFunded && (
        <p className="text-xs text-surface-300 flex items-center gap-1">
          <TrendingUp size={12} className="text-amber-500"/>
          Increase <em>Extra Savings/mo</em> in the Baseline scenario to {fmt(requiredSIP)}/mo to close the gap
        </p>
      )}
    </div>
  )
}
