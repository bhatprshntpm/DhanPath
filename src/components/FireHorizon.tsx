import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fireNumber, yearsToFire, netWorth, fmtINR } from '../lib/calc'

export default function FireHorizon() {
  const { data, updateSettings } = useApp()
  const { settings, scenarios, snapshots } = data
  const [showAdvanced, setShowAdvanced] = useState(false)

  const baseline  = scenarios.find(s => s.id === 'baseline') ?? scenarios[0]
  const latestNw  = snapshots.length ? netWorth(snapshots[snapshots.length - 1]) : 0
  const fire      = fireNumber(settings.monthlyExpenses, settings.safeWithdrawalRate)
  const pct       = Math.min((latestNw / fire) * 100, 100)
  const yrs       = baseline ? yearsToFire(latestNw, settings, baseline, data.goals) : -1
  const retireAge = yrs >= 0 ? settings.currentAge + yrs : null

  const primarySliders = [
    { label: 'Current Age',       key: 'currentAge',      value: settings.currentAge,      min: 18,   max: 80,     step: 1,    suffix: ' yrs' },
    { label: 'Target Retirement', key: 'retirementAge',   value: settings.retirementAge,   min: 30,   max: 80,     step: 1,    suffix: ' yrs' },
    { label: 'Monthly Expenses',  key: 'monthlyExpenses', value: settings.monthlyExpenses, min: 5000, max: 500000, step: 1000, prefix: '₹'    },
    { label: 'Planning Horizon',  key: 'lifeExpectancy',  value: settings.lifeExpectancy,  min: 70,   max: 120,    step: 1,    suffix: ' yrs' },
  ]

  const advancedSliders = [
    { label: 'SWR — Safe Withdrawal Rate', key: 'safeWithdrawalRate', value: settings.safeWithdrawalRate, min: 2, max: 6,  step: 0.1, suffix: '%', hint: 'Annual % you can withdraw without depleting corpus. 4% is the standard.' },
    { label: 'Inflation Rate',             key: 'inflationRate',      value: settings.inflationRate,      min: 0, max: 15, step: 0.5, suffix: '%', hint: 'Assumed annual rise in cost of living. Historical India average: 5–7%.' },
  ]

  function Slider({ label, sliderKey, value, min, max, step, prefix, suffix, hint }: any) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-baseline">
          <label className="text-xs text-surface-400 font-medium leading-tight">{label}</label>
          <span className="text-xs font-semibold text-surface-800 font-mono tabular-nums shrink-0 ml-2">
            {prefix ?? ''}{typeof value === 'number' && value % 1 !== 0 ? value.toFixed(1) : value}{suffix ?? ''}
          </span>
        </div>
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => updateSettings({ [sliderKey]: parseFloat(e.target.value) })}
          className="w-full accent-amber-500 h-1.5" />
        {hint && <p className="text-[10px] text-surface-300 leading-relaxed">{hint}</p>}
      </div>
    )
  }

  return (
    <div className="card p-4 sm:p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="section-title">Financial Independence Horizon</p>
        <span className="text-xs text-surface-300 font-mono">{fmtINR(latestNw)} / {fmtINR(fire)}</span>
      </div>

      <div>
        <div className="flex justify-between text-xs text-surface-300 mb-2">
          <span>Progress to independence number</span>
          <span className="font-semibold text-amber-600">{pct.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-surface-100 rounded-full h-3 overflow-hidden">
          <div className="h-3 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-700"
            style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs mt-1.5">
          <span className="text-surface-300">₹0</span>
          <span className="text-amber-600 font-medium">
            {pct >= 100 ? 'Independence achieved' : retireAge ? `Retire at age ${retireAge} · ${yrs} yrs away` : 'Set income in Scenario Analysis to project'}
          </span>
          <span className="text-surface-300">{fmtINR(fire)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-4 border-t border-surface-100">
        {primarySliders.map(({ key, ...rest }) => <Slider key={key} sliderKey={key} {...rest} />)}
      </div>

      <div>
        <button
          onClick={() => setShowAdvanced(v => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-surface-400 hover:text-surface-700 transition-colors">
          {showAdvanced ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
          Advanced Parameters
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-1 gap-4 mt-4 p-4 bg-surface-50 rounded-xl border border-surface-100">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300">
              These use industry-standard defaults. Adjust only if you have a view.
            </p>
            {advancedSliders.map(({ key, ...rest }) => <Slider key={key} sliderKey={key} {...rest} />)}
          </div>
        )}
      </div>
    </div>
  )
}
