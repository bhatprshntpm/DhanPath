import { useState, useRef } from 'react'
import { ChevronRight, ChevronLeft, X, Upload, CheckCircle, Loader2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { calcHealthScore, HEALTH_LABELS } from '../lib/healthScore'
import { fmtINR } from '../lib/calc'
import { parseCASPDF, casResultToHoldings, casResultToTransactions, casResultToSnapshot } from '../lib/casParser'
import { parseBankCSV, bankTxnsToAppTransactions } from '../lib/bankCSVParser'
import { parseEquityCSV, equityHoldingsToAppHoldings, equityTradesToAppTransactions } from '../lib/equityCSVParser'
import { parseEPFPDF, epfToSnapshot, epfToTransactions } from '../lib/epfParser'

const ONBOARDING_KEY = 'dhanpath-onboarded'

const GOALS = [
  { id: 'fi',       label: 'Financial Independence',  sub: 'Build a corpus that funds your lifestyle forever' },
  { id: 'debt',     label: 'Debt Freedom',             sub: 'Clear all loans and live without financial burden' },
  { id: 'wealth',   label: 'Wealth Creation',          sub: 'Systematically grow your net worth over time' },
  { id: 'retire',   label: 'Retirement Planning',      sub: 'Ensure you never outlive your savings' },
  { id: 'track',    label: 'Track & Understand',       sub: 'Get clarity on where your money goes' },
]

type ParseStatus = 'idle' | 'parsing' | 'done' | 'error'

interface FileZoneState {
  file:    File | null
  status:  ParseStatus
  summary: string
  data:    any
}

const EMPTY_ZONE: FileZoneState = { file: null, status: 'idle', summary: '', data: null }

function FileDropZone({
  label, hint, accept, state, onFile, password, onPassword,
}: {
  label: string; hint: string; accept: string
  state: FileZoneState
  onFile: (f: File) => void
  password?: string
  onPassword?: (p: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const isDone  = state.status === 'done'
  const isParsing = state.status === 'parsing'

  return (
    <div
      className={`relative flex flex-col gap-2 p-4 rounded-2xl border-2 transition-all cursor-pointer
        ${isDone ? 'border-emerald-300 bg-emerald-50' : 'border-dashed border-surface-200 hover:border-amber-300 hover:bg-amber-50/30 bg-white'}`}
      onClick={() => !isDone && ref.current?.click()}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
    >
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />

      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5
          ${isDone ? 'bg-emerald-100' : 'bg-surface-100'}`}>
          {isParsing ? <Loader2 size={16} className="animate-spin text-amber-500" />
            : isDone ? <CheckCircle size={16} className="text-emerald-600" />
            : <Upload size={16} className="text-surface-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${isDone ? 'text-emerald-700' : 'text-surface-800'}`}>{label}</p>
          <p className="text-xs text-surface-400 mt-0.5 leading-relaxed">{isDone ? state.summary : hint}</p>
          {state.file && !isDone && (
            <p className="text-xs text-amber-600 mt-1 truncate">{state.file.name}</p>
          )}
        </div>
        {isDone && (
          <button onClick={e => { e.stopPropagation(); onFile(null as any) }}
            className="text-surface-300 hover:text-rose-400 shrink-0">
            <X size={14}/>
          </button>
        )}
      </div>

      {onPassword && state.file && !isDone && (
        <input
          className="input-field text-sm font-mono mt-1"
          placeholder="PDF password (PAN or date of birth DDMMYYYY)"
          value={password ?? ''} maxLength={20}
          onChange={e => onPassword(e.target.value)}
          onClick={e => e.stopPropagation()}
        />
      )}
    </div>
  )
}

function ScoreReveal({ onDone }: { onDone: () => void }) {
  const { data } = useApp()
  const score = calcHealthScore(data)
  const label = HEALTH_LABELS[score.grade]
  const hasData = data.snapshots.length > 0 || data.transactions.length > 0

  const r = 54, circ = 2 * Math.PI * r
  const dash = hasData ? (score.total / 100) * circ : 0

  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <p className="text-base font-semibold text-surface-800 text-center">
        {hasData ? 'Your Financial Health Index' : 'Dashboard ready — add data to see your score'}
      </p>

      <div className="relative">
        <svg width={140} height={140} className="-rotate-90">
          <circle cx={70} cy={70} r={r} fill="none" stroke="#f5f5f4" strokeWidth={14} />
          <circle cx={70} cy={70} r={r} fill="none" stroke={hasData ? score.color : '#e7e5e4'}
            strokeWidth={14} strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 1.2s ease-out' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {hasData
            ? <><span className="text-4xl font-bold" style={{ color: score.color }}>{score.total}</span>
                <span className="text-xs text-surface-300">/ 100</span></>
            : <span className="text-2xl font-bold text-surface-300">—</span>}
        </div>
      </div>

      {hasData && (
        <div className="text-center">
          <p className="text-xl font-bold" style={{ color: score.color }}>{score.grade} — {label.text}</p>
          <p className="text-sm text-surface-400 mt-1">{label.sub}</p>
        </div>
      )}

      <div className="w-full bg-surface-50 rounded-2xl p-4 text-xs text-surface-500 text-center border border-surface-100">
        All data is stored locally on your device. Nothing is sent to any server.
      </div>

      <button onClick={onDone} className="btn-primary w-full flex items-center justify-center gap-2">
        Open my dashboard <ChevronRight size={16} />
      </button>
    </div>
  )
}

export default function OnboardingWizard({ forceOpen, onClose }: { forceOpen?: boolean; onClose?: () => void } = {}) {
  const { data, updateSettings, updateScenario, addHolding, addTransaction, addSnapshot } = useApp()
  const [open, setOpen]         = useState(() => !localStorage.getItem(ONBOARDING_KEY))
  const [step, setStep]         = useState(0)
  const [showScore, setShowScore] = useState(false)

  const [name, setName]         = useState('')
  const [age, setAge]           = useState(28)
  const [goal, setGoal]         = useState('')

  const [bankZone, setBankZone]   = useState<FileZoneState>({ ...EMPTY_ZONE })
  const [casZone,  setCasZone]    = useState<FileZoneState>({ ...EMPTY_ZONE })
  const [casPass,  setCasPass]    = useState('')
  const [kiteZone, setKiteZone]   = useState<FileZoneState>({ ...EMPTY_ZONE })
  const [epfZone,  setEpfZone]    = useState<FileZoneState>({ ...EMPTY_ZONE })

  const isOpen = forceOpen ?? open

  async function handleBank(file: File | null) {
    if (!file) { setBankZone({ ...EMPTY_ZONE }); return }
    setBankZone(z => ({ ...z, file, status: 'parsing', summary: '' }))
    try {
      const text = await file.text()
      const r    = parseBankCSV(text)
      if (r.status === 'success') {
        setBankZone({ file, status: 'done', summary: `${r.transactions.length} transactions · ${r.bank} · ${r.dateRange.from?.slice(0,7)} to ${r.dateRange.to?.slice(0,7)}`, data: r })
      } else {
        setBankZone({ file, status: 'error', summary: r.message, data: null })
      }
    } catch (e: any) {
      setBankZone({ file, status: 'error', summary: String(e?.message), data: null })
    }
  }

  async function handleCAS(file: File | null, passwordOverride?: string) {
    if (!file) { setCasZone({ ...EMPTY_ZONE }); return }
    setCasZone(z => ({ ...z, file, status: 'parsing', summary: '' }))
    try {
      const pass = passwordOverride ?? casPass
      const r = await parseCASPDF(file, pass || undefined)
      if (r.status === 'success') {
        setCasZone({ file, status: 'done', summary: `${r.funds.length} funds · Portfolio ${fmtINR(r.totalValue)} · ${r.format}`, data: r })
      } else if (r.status === 'password_required') {
        setCasZone(z => ({ ...z, status: 'idle', summary: r.message, data: null }))
      } else {
        setCasZone({ file, status: 'error', summary: r.message, data: null })
      }
    } catch (e: any) {
      setCasZone({ file, status: 'error', summary: String(e?.message), data: null })
    }
  }

  async function handleKite(file: File | null) {
    if (!file) { setKiteZone({ ...EMPTY_ZONE }); return }
    setKiteZone(z => ({ ...z, file, status: 'parsing', summary: '' }))
    try {
      const text = await file.text()
      const r    = parseEquityCSV(text)
      if (r.status === 'success') {
        setKiteZone({ file, status: 'done', summary: `${r.holdings.length} holdings · ${fmtINR(r.totalValue)} · ${r.broker}`, data: r })
      } else {
        setKiteZone({ file, status: 'error', summary: r.message, data: null })
      }
    } catch (e: any) {
      setKiteZone({ file, status: 'error', summary: String(e?.message), data: null })
    }
  }

  async function handleEPF(file: File | null) {
    if (!file) { setEpfZone({ ...EMPTY_ZONE }); return }
    setEpfZone(z => ({ ...z, file, status: 'parsing', summary: '' }))
    try {
      const r = await parseEPFPDF(file)
      if (r.status === 'success') {
        setEpfZone({ file, status: 'done', summary: `EPF balance ${fmtINR(r.totalBalance)} · ${r.entries.length} months`, data: r })
      } else {
        setEpfZone({ file, status: 'error', summary: r.message, data: null })
      }
    } catch (e: any) {
      setEpfZone({ file, status: 'error', summary: String(e?.message), data: null })
    }
  }

  const anyImported = [bankZone, casZone, kiteZone, epfZone].some(z => z.status === 'done')
  const anyParsing  = [bankZone, casZone, kiteZone, epfZone].some(z => z.status === 'parsing')

  function applyImports() {
    updateSettings({ name: name || 'My Finances', currentAge: age, currency: 'INR' })

    const baseline = data.scenarios.find(s => s.id === 'baseline')
    if (baseline && bankZone.data?.transactions?.length) {
      const txns = bankZone.data.transactions
      const credits = txns.filter((t: any) => t.credit > 0)
      const debits  = txns.filter((t: any) => t.debit  > 0)
      const avgIncome  = credits.length ? credits.reduce((a: number, t: any) => a + t.credit, 0) / credits.length : 0
      const avgExpenses = debits.length ? debits.reduce((a: number, t: any) => a + t.debit, 0) / debits.length : 0
      if (avgIncome > 0) {
        updateScenario({ ...baseline, assumptions: { ...baseline.assumptions, monthlyIncome: Math.round(avgIncome), monthlyExpenses: Math.round(avgExpenses) } })
      }
    }

    if (bankZone.data?.status === 'success') {
      bankTxnsToAppTransactions(bankZone.data.transactions).forEach((t: any) => addTransaction(t))
    }
    if (casZone.data?.status === 'success') {
      casResultToHoldings(casZone.data).forEach((h: any) => addHolding(h))
      casResultToTransactions(casZone.data).forEach((t: any) => addTransaction(t))
      addSnapshot(casResultToSnapshot(casZone.data))
    }
    if (kiteZone.data?.status === 'success') {
      equityHoldingsToAppHoldings(kiteZone.data.holdings).forEach((h: any) => addHolding(h))
      equityTradesToAppTransactions(kiteZone.data.transactions).forEach((t: any) => addTransaction(t))
    }
    if (epfZone.data?.status === 'success') {
      addSnapshot(epfToSnapshot(epfZone.data))
      epfToTransactions(epfZone.data).forEach((t: any) => addTransaction(t))
    }
  }

  function done() {
    localStorage.setItem(ONBOARDING_KEY, '1')
    setOpen(false)
    onClose?.()
  }

  function goToStep3() {
    applyImports()
    setShowScore(true)
  }

  if (!isOpen) return null

  const steps = [
    { title: 'Tell us about yourself', sub: 'A few details to personalise your plan' },
    { title: 'Connect your data',      sub: 'Upload files to auto-populate your dashboard — no manual entry needed' },
    { title: 'Your financial picture', sub: '' },
  ]

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="p-6 sm:p-8">

          {/* Progress + close */}
          {!showScore && (
            <div className="flex items-center justify-between mb-6">
              <div className="flex gap-2">
                {steps.map((_, i) => (
                  <div key={i} className={`h-1 rounded-full transition-all duration-300
                    ${i === step ? 'w-8 bg-amber-500' : i < step ? 'w-4 bg-amber-300' : 'w-4 bg-surface-200'}`} />
                ))}
              </div>
              <button onClick={done} className="text-surface-300 hover:text-surface-600 transition-colors">
                <X size={18}/>
              </button>
            </div>
          )}

          {showScore ? (
            <ScoreReveal onDone={done} />
          ) : (
            <div className="flex flex-col gap-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-300 mb-1">
                  Step {step + 1} of {steps.length}
                </p>
                <h2 className="text-xl font-bold text-surface-800">{steps[step].title}</h2>
                {steps[step].sub && <p className="text-sm text-surface-400 mt-1">{steps[step].sub}</p>}
              </div>

              {/* Step 0 — Name, Age, Goal */}
              {step === 0 && (
                <div className="flex flex-col gap-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-surface-400 uppercase tracking-widest block mb-1.5">Name</label>
                      <input className="input-field" placeholder="e.g. Prashant"
                        value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-surface-400 uppercase tracking-widest block mb-1.5">Age</label>
                      <input className="input-field" type="number" min={18} max={80}
                        value={age} onChange={e => setAge(parseInt(e.target.value) || 28)} />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-surface-400 uppercase tracking-widest block mb-2">
                      Primary Financial Goal
                    </label>
                    <div className="flex flex-col gap-2">
                      {GOALS.map(g => (
                        <button key={g.id} onClick={() => setGoal(g.id)}
                          className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all
                            ${goal === g.id
                              ? 'border-amber-400 bg-amber-50'
                              : 'border-surface-100 hover:border-surface-200 bg-white'}`}>
                          <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 transition-all
                            ${goal === g.id ? 'border-amber-500 bg-amber-500' : 'border-surface-300'}`} />
                          <div>
                            <p className={`text-sm font-semibold ${goal === g.id ? 'text-amber-800' : 'text-surface-800'}`}>{g.label}</p>
                            <p className="text-xs text-surface-400 mt-0.5">{g.sub}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 1 — Import zones */}
              {step === 1 && (
                <div className="flex flex-col gap-3">
                  <FileDropZone
                    label="Bank Statement"
                    hint="CSV from HDFC, ICICI, SBI, Axis or Kotak — auto-detects your bank and categorises transactions"
                    accept=".csv,.xlsx"
                    state={bankZone}
                    onFile={handleBank}
                  />
                  <FileDropZone
                    label="Mutual Fund Statement (CAS)"
                    hint="CAMS or KFintech CAS PDF — imports your mutual fund portfolio and SIP history"
                    accept=".pdf"
                    state={casZone}
                    onFile={handleCAS}
                    password={casPass}
                    onPassword={p => { setCasPass(p); if (casZone.file) handleCAS(casZone.file, p) }}
                  />
                  <FileDropZone
                    label="Equity Holdings"
                    hint="Zerodha, Groww, Angel One, Upstox — CSV export from your broker's portfolio page"
                    accept=".csv"
                    state={kiteZone}
                    onFile={handleKite}
                  />
                  <FileDropZone
                    label="EPF Passbook"
                    hint="EPFO member passbook PDF — imports your provident fund balance and contribution history"
                    accept=".pdf"
                    state={epfZone}
                    onFile={handleEPF}
                  />

                  {anyImported && (
                    <div className="mt-1 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs text-emerald-700 font-medium text-center">
                      {[bankZone, casZone, kiteZone, epfZone].filter(z => z.status === 'done').length} source{[bankZone, casZone, kiteZone, epfZone].filter(z => z.status === 'done').length !== 1 ? 's' : ''} connected — your dashboard will be pre-populated
                    </div>
                  )}
                </div>
              )}

              {/* Navigation */}
              <div className="flex gap-3 pt-2">
                {step > 0 && (
                  <button onClick={() => setStep(s => s - 1)} className="btn-ghost flex items-center gap-1.5">
                    <ChevronLeft size={15}/> Back
                  </button>
                )}
                {step < steps.length - 1 ? (
                  <button onClick={() => setStep(s => s + 1)}
                    disabled={step === 0 && !goal}
                    className="btn-primary flex-1 flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                    Continue <ChevronRight size={15}/>
                  </button>
                ) : (
                  <button onClick={goToStep3} disabled={anyParsing}
                    className="btn-primary flex-1 flex items-center justify-center gap-1.5 disabled:opacity-50">
                    {anyParsing ? <><Loader2 size={14} className="animate-spin"/> Processing...</> : <>See my dashboard <ChevronRight size={15}/></>}
                  </button>
                )}
              </div>

              <button onClick={done}
                className="text-center text-xs text-surface-300 hover:text-surface-600 transition-colors -mt-2">
                Skip setup — I'll add data later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
