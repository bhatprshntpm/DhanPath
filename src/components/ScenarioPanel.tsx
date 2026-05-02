import { useState } from 'react'
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import { useApp } from '../context/AppContext'
import type { Scenario } from '../types'

const COLORS = ['#f59e0b', '#6366f1', '#10b981', '#ef4444', '#8b5cf6', '#ec4899']

const PRESETS: Omit<Scenario, 'id'>[] = [
  { name: '+20% raise', color: '#10b981', enabled: false, assumptions: { monthlyIncome: 12000, monthlyExpenses: 6000, annualReturn: 9, equityReturn: 12, debtReturn: 7, equityAllocation: 70, extraMonthlySavings: 0, sipStepUp: 10, incomeGrowthRate: 5, inflationRate: 6, lifestyleMultiplier: 1.0 } },
  { name: 'Market crash', color: '#ef4444', enabled: false, assumptions: { monthlyIncome: 10000, monthlyExpenses: 6000, annualReturn: 5, equityReturn: 6, debtReturn: 5, equityAllocation: 50, extraMonthlySavings: 0, sipStepUp: 5, incomeGrowthRate: 3, inflationRate: 7, lifestyleMultiplier: 1.0 } },
  { name: 'Aggressive saver', color: '#8b5cf6', enabled: false, assumptions: { monthlyIncome: 10000, monthlyExpenses: 4000, annualReturn: 11, equityReturn: 14, debtReturn: 7, equityAllocation: 80, extraMonthlySavings: 2000, sipStepUp: 15, incomeGrowthRate: 7, inflationRate: 6, lifestyleMultiplier: 0.8 } },
  { name: 'Retire early', color: '#ec4899', enabled: false, assumptions: { monthlyIncome: 10000, monthlyExpenses: 7000, annualReturn: 9, equityReturn: 12, debtReturn: 7, equityAllocation: 70, extraMonthlySavings: 500, sipStepUp: 10, incomeGrowthRate: 5, inflationRate: 6, lifestyleMultiplier: 1.2 } },
]

const SLIDERS: { label: string; key: string; min: number; max: number; step: number; prefix?: string; suffix?: string }[] = [
  { label: 'Monthly Income',      key: 'monthlyIncome',       min: 0,   max: 50000, step: 500,  prefix: '$' },
  { label: 'Monthly Expenses',    key: 'monthlyExpenses',     min: 0,   max: 30000, step: 250,  prefix: '$' },
  { label: 'Equity Return',       key: 'equityReturn',        min: 0,   max: 25,    step: 0.5,  suffix: '%' },
  { label: 'Debt Return',         key: 'debtReturn',          min: 0,   max: 15,    step: 0.5,  suffix: '%' },
  { label: 'Equity Allocation',   key: 'equityAllocation',    min: 0,   max: 100,   step: 5,    suffix: '%' },
  { label: 'SIP Step-up/yr',      key: 'sipStepUp',           min: 0,   max: 30,    step: 1,    suffix: '%' },
  { label: 'Income Growth/yr',    key: 'incomeGrowthRate',    min: 0,   max: 20,    step: 0.5,  suffix: '%' },
  { label: 'Extra Savings/mo',    key: 'extraMonthlySavings', min: 0,   max: 10000, step: 100,  prefix: '$' },
  { label: 'Lifestyle (Retire)',  key: 'lifestyleMultiplier', min: 0.5, max: 2.0,   step: 0.1,  suffix: 'x' },
]

export default function ScenarioPanel() {
  const { data, addScenario, updateScenario, deleteScenario } = useApp()
  const [editing, setEditing] = useState<string | null>(null)

  const nextColor = COLORS[data.scenarios.length % COLORS.length]

  return (
    <div className="card p-4 sm:p-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="section-title">Scenario Planner</p>
        <span className="text-xs text-surface-300">Sliders update the timeline in real-time</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.filter(p => !data.scenarios.find(s => s.name === p.name)).map(p => (
          <button key={p.name} onClick={() => addScenario({ ...p, enabled: true })}
            className="text-xs px-3 py-1.5 rounded-xl border border-surface-200 hover:border-amber-400 hover:text-amber-600 transition-colors text-surface-800">
            + {p.name}
          </button>
        ))}
        <button onClick={() => addScenario({
          name: 'New Scenario', color: nextColor, enabled: true,
          assumptions: { monthlyIncome: 10000, monthlyExpenses: 6000, annualReturn: 9, equityReturn: 12, debtReturn: 7, equityAllocation: 70, extraMonthlySavings: 0, sipStepUp: 10, incomeGrowthRate: 5, inflationRate: 6, lifestyleMultiplier: 1.0 },
        })} className="btn-primary flex items-center gap-1 text-xs px-3 py-1.5">
          <Plus size={12}/> Custom
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.scenarios.map(s => (
          <div key={s.id} className="border border-surface-100 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }}/>
                {editing === s.id
                  ? <input className="input-field text-sm py-0.5 px-2 w-40" value={s.name}
                      onChange={e => updateScenario({ ...s, name: e.target.value })}
                      onBlur={() => setEditing(null)} autoFocus />
                  : <span className="text-sm font-semibold text-surface-800 cursor-pointer" onClick={() => setEditing(s.id)}>{s.name}</span>
                }
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => updateScenario({ ...s, enabled: !s.enabled })} className="text-surface-300 hover:text-amber-500 transition-colors">
                  {s.enabled ? <Eye size={14}/> : <EyeOff size={14}/>}
                </button>
                {s.id !== 'baseline' && (
                  <button onClick={() => deleteScenario(s.id)} className="text-surface-300 hover:text-rose-400 transition-colors">
                    <Trash2 size={14}/>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {SLIDERS.map(({ label, key, min, max, step, prefix, suffix }) => (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-0.5">
                    <span className="text-surface-300">{label}</span>
                    <span className="font-mono font-medium text-surface-800">
                      {prefix ?? ''}{(s.assumptions as any)[key]}{suffix ?? ''}
                    </span>
                  </div>
                  <input type="range" min={min} max={max} step={step}
                    value={(s.assumptions as any)[key]}
                    onChange={e => updateScenario({ ...s, assumptions: { ...s.assumptions, [key]: parseFloat(e.target.value) } })}
                    className="w-full accent-amber-500"
                    disabled={!s.enabled} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
