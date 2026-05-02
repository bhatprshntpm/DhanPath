import { useState, useEffect } from 'react'
import { ChevronRight, ChevronLeft, X, Plus, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { calcHealthScore, HEALTH_LABELS } from '../lib/healthScore'
import { fmtINR } from '../lib/calc'

const ONBOARDING_KEY = 'dhanpath-onboarded'

const LIFE_STAGES = [
  { emoji: '🎓', label: 'Fresh Graduate',  age: 22, income: 40000,  expenses: 25000, sip: 3000  },
  { emoji: '💼', label: 'Young Professional', age: 28, income: 80000,  expenses: 45000, sip: 10000 },
  { emoji: '👨‍👩‍👧', label: 'New Family',      age: 33, income: 120000, expenses: 75000, sip: 15000 },
  { emoji: '🏠', label: 'Mid-Career',       age: 40, income: 180000, expenses: 100000, sip: 25000 },
  { emoji: '🌅', label: 'Pre-Retirement',   age: 52, income: 250000, expenses: 120000, sip: 50000 },
]

interface LoanEntry { type: string; principal: number; rate: number; tenureYears: number; emisPaid: number; emiAmount: number }
const EMPTY_LOAN: LoanEntry = { type: 'Home Loan', principal: 0, rate: 8.5, tenureYears: 20, emisPaid: 0, emiAmount: 0 }
const LOAN_TYPES = ['Home Loan', 'Car Loan', 'Personal Loan', 'Education Loan', 'Other']

function loanBalance(l: LoanEntry): number {
  if (!l.principal || !l.rate || !l.tenureYears) return l.principal
  const r       = l.rate / 100 / 12
  const n       = l.tenureYears * 12
  const paid    = l.emisPaid
  const balance = l.principal * Math.pow(1 + r, paid) - (l.emiAmount || (l.principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1))) * ((Math.pow(1 + r, paid) - 1) / r)
  return Math.max(Math.round(balance), 0)
}

function ScoreReveal({ score, onDone }: { score: ReturnType<typeof calcHealthScore>; onDone: () => void }) {
  const [displayed, setDisplayed] = useState(0)
  const label = HEALTH_LABELS[score.grade]

  useEffect(() => {
    const step = score.total / 60
    let cur = 0
    const t = setInterval(() => {
      cur = Math.min(cur + step, score.total)
      setDisplayed(Math.round(cur))
      if (cur >= score.total) clearInterval(t)
    }, 16)
    return () => clearInterval(t)
  }, [score.total])

  const r = 54, circ = 2 * Math.PI * r
  const dash = (displayed / 100) * circ

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <p className="text-lg font-semibold text-surface-800">Your Financial Health Score</p>

      <div className="relative">
        <svg width={140} height={140} className="-rotate-90">
          <circle cx={70} cy={70} r={r} fill="none" stroke="#f5f5f4" strokeWidth={14} />
          <circle cx={70} cy={70} r={r} fill="none" stroke={score.color} strokeWidth={14}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.05s linear' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold" style={{ color: score.color }}>{displayed}</span>
          <span className="text-xs text-surface-300">/ 100</span>
        </div>
      </div>

      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-1">
          <span className="text-2xl font-bold" style={{ color: score.color }}>{score.grade}</span>
        </div>
        <p className="font-semibold text-surface-800">{label.text}</p>
        <p className="text-sm text-surface-300 mt-1">{label.sub}</p>
      </div>

      <div className="w-full flex flex-col gap-2 px-2">
        {[
          { label: 'Savings Rate',    score: score.savingsRate.score,    max: 25, color: '#10b981' },
          { label: 'Emergency Fund',  score: score.emergencyFund.score,  max: 20, color: '#6366f1' },
          { label: 'Debt Ratio',      score: score.debtRatio.score,      max: 20, color: '#f59e0b' },
          { label: 'Investment Rate', score: score.investmentRate.score, max: 20, color: '#8b5cf6' },
          { label: 'FIRE Progress',   score: score.fireProgress.score,   max: 15, color: '#ef4444' },
        ].map(b => (
          <div key={b.label} className="flex items-center gap-3">
            <span className="text-xs text-surface-300 w-28 shrink-0">{b.label}</span>
            <div className="flex-1 bg-surface-100 rounded-full h-2">
              <div className="h-2 rounded-full transition-all duration-700"
                style={{ width: `${(b.score / b.max) * 100}%`, backgroundColor: b.color }} />
            </div>
            <span className="text-xs font-mono text-surface-300 w-8 text-right">{b.score}/{b.max}</span>
          </div>
        ))}
      </div>

      <button onClick={onDone} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
        View My Dashboard <ChevronRight size={16} />
      </button>
    </div>
  )
}

export default function OnboardingWizard({ forceOpen, onClose }: { forceOpen?: boolean; onClose?: () => void } = {}) {
  const { data, updateSettings, updateScenario, addDebt } = useApp()
  const [open, setOpen]           = useState(() => !localStorage.getItem(ONBOARDING_KEY))
  const [step, setStep]           = useState(0)
  const [showScore, setShowScore] = useState(false)
  const isOpen = forceOpen ?? open

  const [name, setName]         = useState('')
  const [age, setAge]           = useState(28)
  const [income, setIncome]     = useState(100000)
  const [expenses, setExpenses] = useState(60000)
  const [sip, setSip]           = useState(10000)
  const [loans, setLoans]       = useState<LoanEntry[]>([])
  const [fireTarget, setFireTarget] = useState(0)
  const [fireMode, setFireMode] = useState<'auto' | 'manual'>('auto')

  const suggestedFire = Math.round((expenses * 12 * 25) / 1e7) * 1e7

  function applyLifeStage(ls: typeof LIFE_STAGES[0]) {
    setAge(ls.age); setIncome(ls.income); setExpenses(ls.expenses); setSip(ls.sip)
  }

  function addLoan() { setLoans(l => [...l, { ...EMPTY_LOAN }]) }
  function removeLoan(i: number) { setLoans(l => l.filter((_, j) => j !== i)) }
  function updateLoan(i: number, patch: Partial<LoanEntry>) {
    setLoans(l => l.map((x, j) => j === i ? { ...x, ...patch } : x))
  }

  function finish() {
    updateSettings({ name: name || 'My Finances', currentAge: age, monthlyExpenses: expenses, currency: 'INR' })
    const baseline = data.scenarios.find(s => s.id === 'baseline')
    if (baseline) {
      updateScenario({ ...baseline, assumptions: { ...baseline.assumptions, monthlyIncome: income, monthlyExpenses: expenses, extraMonthlySavings: sip } })
    }
    loans.forEach(l => {
      addDebt({ name: l.type, balance: loanBalance(l), rate: l.rate, minPayment: l.emiAmount, color: '#ef4444' })
    })
    setShowScore(true)
  }

  function done() {
    localStorage.setItem(ONBOARDING_KEY, '1')
    setOpen(false)
    onClose?.()
  }

  if (!isOpen) return null

  const steps = [
    { title: "Welcome to DhanPath", sub: "Set up your financial profile" },
    { title: "Your Income",  sub: "What do you earn every month?" },
    { title: "Your Expenses", sub: "What do you spend every month?" },
    { title: "Your Investments", sub: "Are you investing regularly?" },
    { title: "Your Loans",   sub: "Any active loans or EMIs?" },
    { title: "Your Goal",    sub: "What's your financial independence target?" },
  ]

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          {!showScore && (
            <div className="flex items-center justify-between mb-6">
              <div className="flex gap-1.5">
                {steps.map((_, i) => (
                  <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-amber-500' : i < step ? 'w-3 bg-amber-300' : 'w-3 bg-surface-200'}`} />
                ))}
              </div>
              <button onClick={done} className="text-surface-300 hover:text-surface-800 transition-colors">
                <X size={18} />
              </button>
            </div>
          )}

          {showScore ? (
            <ScoreReveal score={calcHealthScore(data)} onDone={done} />
          ) : (
            <div className="flex flex-col gap-6">
              <div>
                <div className="flex items-center justify-center gap-2 mb-4">
                  <img src="/DhanPath/logo.png" alt="DhanPath" className="h-12 w-auto mix-blend-multiply" />
                  <div className="flex flex-col leading-tight">
                    <span className="text-lg font-bold text-[#2d5a27]">DhanPath</span>
                    <span className="text-[10px] text-[#5a8a4a] font-medium">Navigate, Plan, Prosper</span>
                  </div>
                </div>
                <h2 className="text-xl font-bold text-surface-800">{steps[step].title}</h2>
                <p className="text-sm text-surface-300 mt-1">{steps[step].sub}</p>
              </div>

              {/* Step 0: Name + Age + Life Stage */}
              {step === 0 && (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-semibold text-surface-300 uppercase tracking-widest">Your name</label>
                    <input className="input-field mt-1" placeholder="e.g. Prashant" value={name} onChange={e => setName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-surface-300 uppercase tracking-widest">Your age</label>
                    <input className="input-field mt-1" type="number" min={18} max={80} value={age} onChange={e => setAge(parseInt(e.target.value) || 28)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-surface-300 uppercase tracking-widest mb-2 block">Or pick your life stage</label>
                    <div className="grid grid-cols-1 gap-2">
                      {LIFE_STAGES.map(ls => (
                        <button key={ls.label} onClick={() => applyLifeStage(ls)}
                          className="flex items-center gap-3 p-3 rounded-xl border border-surface-100 hover:border-amber-400 hover:bg-amber-50 transition-colors text-left">
                          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-amber-600">{ls.age}</span>
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-surface-800">{ls.label}</div>
                            <div className="text-xs text-surface-300">Age ~{ls.age} · ₹{(ls.income/1000).toFixed(0)}k/mo income</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1: Income */}
              {step === 1 && (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-semibold text-surface-300 uppercase tracking-widest">Monthly take-home salary</label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-300 font-medium">₹</span>
                      <input className="input-field pl-7" type="number" value={income} onChange={e => setIncome(parseInt(e.target.value) || 0)} />
                    </div>
                    <p className="text-xs text-surface-300 mt-1">Include salary + freelance + any other regular income</p>
                  </div>
                  <div className="p-3 bg-amber-50 rounded-xl text-xs text-amber-700">
                    💡 That's <strong>{fmtINR(income * 12)}</strong> per year
                  </div>
                </div>
              )}

              {/* Step 2: Expenses */}
              {step === 2 && (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-semibold text-surface-300 uppercase tracking-widest">Monthly expenses</label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-300 font-medium">₹</span>
                      <input className="input-field pl-7" type="number" value={expenses} onChange={e => setExpenses(parseInt(e.target.value) || 0)} />
                    </div>
                    <p className="text-xs text-surface-300 mt-1">Rent + food + bills + EMIs + everything</p>
                  </div>
                  {income > 0 && (
                    <div className={`p-3 rounded-xl text-xs font-medium ${income - expenses > income * 0.2 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
                      {income - expenses > 0
                        ? `✅ You save ${fmtINR(income - expenses)}/mo (${Math.round(((income - expenses) / income) * 100)}% savings rate)`
                        : `⚠️ Expenses exceed income by ${fmtINR(expenses - income)}`}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: SIP / Investments */}
              {step === 3 && (
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="text-xs font-semibold text-surface-300 uppercase tracking-widest">Monthly SIP / investments</label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-300 font-medium">₹</span>
                      <input className="input-field pl-7" type="number" value={sip} onChange={e => setSip(parseInt(e.target.value) || 0)} />
                    </div>
                    <p className="text-xs text-surface-300 mt-1">Mutual funds, stocks, PPF, NPS — anything you invest monthly</p>
                  </div>
                  <div className="p-3 bg-indigo-50 rounded-xl text-xs text-indigo-700">
                    📈 At 12% returns, <strong>{fmtINR(sip)}/mo</strong> becomes <strong>{fmtINR(Math.round(sip * 12 * ((Math.pow(1.12, 20) - 1) / 0.12)))}</strong> in 20 years
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[5000, 10000, 15000, 25000, 50000, 100000].map(v => (
                      <button key={v} onClick={() => setSip(v)}
                        className={`p-2 rounded-xl border text-xs font-medium transition-colors ${sip === v ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-surface-200 text-surface-800 hover:border-amber-300'}`}>
                        {fmtINR(v)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 4: Loans */}
              {step === 4 && (
                <div className="flex flex-col gap-4">
                  {loans.length === 0 && (
                    <div className="p-4 bg-emerald-50 rounded-xl text-center">
                      <p className="text-emerald-700 font-medium text-sm">No active loans — great start!</p>
                      <p className="text-xs text-emerald-600 mt-1">You can still add them if you have any</p>
                    </div>
                  )}
                  {loans.map((l, i) => (
                    <div key={i} className="border border-surface-100 rounded-2xl p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <select className="input-field text-sm py-1.5 w-40" value={l.type} onChange={e => updateLoan(i, { type: e.target.value })}>
                          {LOAN_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                        <button onClick={() => removeLoan(i)} className="text-surface-300 hover:text-rose-400"><Trash2 size={14}/></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'Principal (₹)', key: 'principal', val: l.principal },
                          { label: 'Rate (%)', key: 'rate', val: l.rate },
                          { label: 'Tenure (yrs)', key: 'tenureYears', val: l.tenureYears },
                          { label: 'EMIs paid', key: 'emisPaid', val: l.emisPaid },
                          { label: 'EMI amount (₹)', key: 'emiAmount', val: l.emiAmount },
                        ].map(f => (
                          <div key={f.key}>
                            <label className="text-[10px] text-surface-300 font-medium">{f.label}</label>
                            <input className="input-field mt-0.5 text-sm" type="number"
                              value={f.val || ''} onChange={e => updateLoan(i, { [f.key]: parseFloat(e.target.value) || 0 })} />
                          </div>
                        ))}
                      </div>
                      {l.principal > 0 && (
                        <p className="text-xs text-rose-500">Outstanding balance: <strong>{fmtINR(loanBalance(l))}</strong></p>
                      )}
                    </div>
                  ))}
                  <button onClick={addLoan} className="btn-ghost flex items-center gap-1 text-sm justify-center border border-dashed border-surface-200">
                    <Plus size={14}/> Add a loan
                  </button>
                </div>
              )}

              {/* Step 5: FIRE target */}
              {step === 5 && (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Auto (25× expenses)', value: 'auto' as const },
                      { label: 'Set my own target', value: 'manual' as const },
                    ].map(m => (
                      <button key={m.value} onClick={() => setFireMode(m.value)}
                        className={`p-3 rounded-xl border text-xs font-medium transition-colors ${fireMode === m.value ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-surface-200 text-surface-800'}`}>
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {fireMode === 'auto' ? (
                    <div className="p-4 bg-amber-50 rounded-xl text-center">
                      <p className="text-xs text-amber-600 mb-1">Based on your expenses ({fmtINR(expenses)}/mo)</p>
                      <p className="text-2xl font-bold text-amber-700">{fmtINR(suggestedFire)}</p>
                      <p className="text-xs text-amber-600 mt-1">= {(expenses * 12).toLocaleString('en-IN')} × 300 months (25 years)</p>
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-semibold text-surface-300 uppercase tracking-widest">Your target corpus</label>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-300 font-medium">₹</span>
                        <input className="input-field pl-7" type="number" placeholder={String(suggestedFire)}
                          value={fireTarget || ''} onChange={e => setFireTarget(parseInt(e.target.value) || 0)} />
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {[1e7, 5e7, 1e8, 2e8, 5e8, 1e9].map(v => (
                          <button key={v} onClick={() => setFireTarget(v)}
                            className={`px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${fireTarget === v ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-surface-200 text-surface-800 hover:border-amber-300'}`}>
                            {fmtINR(v)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Nav buttons */}
              <div className="flex gap-3 mt-2">
                {step > 0 && (
                  <button onClick={() => setStep(s => s - 1)} className="btn-ghost flex items-center gap-1">
                    <ChevronLeft size={16}/> Back
                  </button>
                )}
                {step < steps.length - 1 ? (
                  <button onClick={() => setStep(s => s + 1)} className="btn-primary flex-1 flex items-center justify-center gap-1">
                    Continue <ChevronRight size={16}/>
                  </button>
                ) : (
                  <button onClick={finish} className="btn-primary flex-1 flex items-center justify-center gap-1">
                    See my score
                  </button>
                )}
              </div>
              <button onClick={done} className="text-center text-xs text-surface-300 hover:text-surface-800 transition-colors">
                Skip for now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
