import { X, User, Wallet, TrendingUp, Target } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmtINR } from '../lib/calc'

interface Props { open: boolean; onClose: () => void }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-surface-500">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-surface-300 leading-snug">{hint}</p>}
    </div>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 border-b border-surface-100 pb-2">
        <span className="text-surface-400">{icon}</span>
        <p className="text-xs font-bold uppercase tracking-widest text-surface-400">{title}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  )
}

export default function PlanSettings({ open, onClose }: Props) {
  const { data, updateSettings, updateScenario } = useApp()
  const s  = data.settings
  const bl = data.scenarios.find(sc => sc.id === 'baseline' && sc.enabled) ?? data.scenarios.find(sc => sc.enabled)
  const a  = bl?.assumptions

  function set(patch: Partial<typeof s>) { updateSettings(patch) }
  function setAssump(patch: Partial<NonNullable<typeof a>>) {
    if (!bl) return
    updateScenario({ ...bl, assumptions: { ...bl.assumptions, ...patch } })
  }

  const surplus = (a?.monthlyIncome ?? 0) - (s.monthlyExpenses ?? 0) - (s.monthlyEMI ?? 0)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-sm bg-white shadow-2xl flex flex-col animate-slide-in-right overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <p className="font-bold text-surface-900">Plan Settings</p>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-6">

          {/* About you */}
          <Section icon={<User size={13} />} title="About you">
            <Field label="Your name">
              <input className="input-field" value={s.name ?? ''} onChange={e => set({ name: e.target.value })} placeholder="e.g. Prashant" />
            </Field>
            <Field label="Current age">
              <input className="input-field" type="number" min={18} max={80} value={s.currentAge ?? 28} onChange={e => set({ currentAge: +e.target.value })} />
            </Field>
            <Field label="Target retirement age">
              <input className="input-field" type="number" min={30} max={80} value={s.retirementAge ?? 55} onChange={e => set({ retirementAge: +e.target.value })} />
            </Field>
            <Field label="Plan to age" hint="Used to check corpus survives this long">
              <input className="input-field" type="number" min={60} max={120} value={s.lifeExpectancy ?? 85} onChange={e => set({ lifeExpectancy: +e.target.value })} />
            </Field>
          </Section>

          {/* Monthly cash flow */}
          <Section icon={<Wallet size={13} />} title="Monthly cash flow">
            <Field label="Take-home income (₹)" hint="Your post-tax monthly salary">
              <input className="input-field" type="number" placeholder="e.g. 150000" value={a?.monthlyIncome || ''} onChange={e => setAssump({ monthlyIncome: +e.target.value })} />
            </Field>
            <Field label="Monthly expenses (₹)" hint="All living costs — rent, food, bills">
              <input className="input-field" type="number" placeholder="e.g. 70000" value={s.monthlyExpenses || ''} onChange={e => set({ monthlyExpenses: +e.target.value })} />
            </Field>
            <Field label="Monthly SIP (₹)" hint="Total going into MFs / ETFs">
              <input className="input-field" type="number" placeholder="e.g. 25000" value={s.existingSIP || ''} onChange={e => set({ existingSIP: +e.target.value })} />
            </Field>
            <Field label="Total EMIs (₹)" hint="All loan EMIs combined">
              <input className="input-field" type="number" placeholder="e.g. 20000" value={s.monthlyEMI || ''} onChange={e => set({ monthlyEMI: +e.target.value })} />
            </Field>
            {(a?.monthlyIncome ?? 0) > 0 && (
              <div className="col-span-2 grid grid-cols-3 gap-2">
                <div className={`p-2.5 rounded-xl text-center ${surplus >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                  <p className="text-[10px] text-surface-400">Surplus</p>
                  <p className={`text-sm font-bold ${surplus >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{fmtINR(Math.abs(surplus))}</p>
                </div>
                <div className="p-2.5 bg-surface-50 rounded-xl text-center">
                  <p className="text-[10px] text-surface-400">Savings rate</p>
                  <p className="text-sm font-bold text-surface-700">{(a?.monthlyIncome ?? 0) > 0 ? Math.round((Math.max(surplus, 0) / (a?.monthlyIncome ?? 1)) * 100) : 0}%</p>
                </div>
                <div className="p-2.5 bg-amber-50 rounded-xl text-center">
                  <p className="text-[10px] text-surface-400">SIP rate</p>
                  <p className="text-sm font-bold text-amber-600">{(a?.monthlyIncome ?? 0) > 0 ? Math.round(((s.existingSIP ?? 0) / (a?.monthlyIncome ?? 1)) * 100) : 0}%</p>
                </div>
              </div>
            )}
          </Section>

          {/* Return assumptions */}
          <Section icon={<TrendingUp size={13} />} title="Projection assumptions">
            <Field label="Expected return (%)" hint="Indian equity ~12–14% historically">
              <input className="input-field" type="number" min={1} max={30} step={0.5} value={a?.equityReturn ?? 14} onChange={e => setAssump({ equityReturn: +e.target.value, annualReturn: +e.target.value })} />
            </Field>
            <Field label="Inflation (%)" hint="India avg 5–7%. Grows your future costs">
              <input className="input-field" type="number" min={0} max={15} step={0.5} value={s.inflationRate ?? 6} onChange={e => { set({ inflationRate: +e.target.value }); setAssump({ inflationRate: +e.target.value }) }} />
            </Field>
            <Field label="SIP step-up (%/yr)" hint="Annual increase in your SIP amount">
              <input className="input-field" type="number" min={0} max={30} step={1} value={a?.sipStepUp ?? 10} onChange={e => setAssump({ sipStepUp: +e.target.value })} />
            </Field>
            <Field label="Income growth (%/yr)" hint="Expected annual salary increment">
              <input className="input-field" type="number" min={0} max={30} step={1} value={a?.incomeGrowthRate ?? 8} onChange={e => setAssump({ incomeGrowthRate: +e.target.value })} />
            </Field>
            <Field label="Equity allocation (%)" hint="Rest goes to debt instruments">
              <input className="input-field" type="number" min={0} max={100} step={5} value={a?.equityAllocation ?? 70} onChange={e => setAssump({ equityAllocation: +e.target.value })} />
            </Field>
            <Field label="Debt return (%)" hint="FDs, bonds, debt MFs">
              <input className="input-field" type="number" min={0} max={15} step={0.5} value={a?.debtReturn ?? 7} onChange={e => setAssump({ debtReturn: +e.target.value })} />
            </Field>
          </Section>

          {/* Retirement */}
          <Section icon={<Target size={13} />} title="Retirement">
            <Field label="Lifestyle multiplier" hint="1.0 = same spend. 1.2 = spend 20% more in retirement">
              <input className="input-field" type="number" min={0.5} max={3} step={0.1} value={a?.lifestyleMultiplier ?? 1.0} onChange={e => setAssump({ lifestyleMultiplier: +e.target.value })} />
            </Field>
            <Field label="Safe withdrawal rate (%)" hint="Used only for reference — projections use actual expenses">
              <input className="input-field" type="number" min={1} max={10} step={0.5} value={s.safeWithdrawalRate ?? 4} onChange={e => set({ safeWithdrawalRate: +e.target.value })} />
            </Field>
          </Section>
        </div>

        <div className="px-5 py-4 border-t border-surface-100">
          <p className="text-[10px] text-surface-300 text-center">Changes apply instantly to all projections. Your data never leaves this device.</p>
        </div>
      </div>
    </div>
  )
}
