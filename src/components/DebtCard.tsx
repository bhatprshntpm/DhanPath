import { useState } from 'react'
import { Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { debtAvalanche, fmt } from '../lib/calc'

const DEBT_COLORS = ['#ef4444','#f59e0b','#6366f1','#10b981','#8b5cf6']

export default function DebtCard() {
  const { data, addDebt, deleteDebt } = useApp()
  const [expanded, setExpanded] = useState(false)
  const [extra, setExtra]       = useState(500)
  const [form, setForm]         = useState({ name: '', balance: '', rate: '', minPayment: '' })

  const totalDebt = data.debts.reduce((a, d) => a + d.balance, 0)
  const { months: avalancheMonths, totalInterest } = debtAvalanche(data.debts, extra)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.balance) return
    const i = data.debts.length
    addDebt({
      ...form,
      balance: parseFloat(form.balance),
      rate: parseFloat(form.rate || '0'),
      minPayment: parseFloat(form.minPayment || '0'),
      color: DEBT_COLORS[i % DEBT_COLORS.length],
    })
    setForm({ name: '', balance: '', rate: '', minPayment: '' })
  }

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="section-title">Debt</p>
        <button className="btn-ghost" onClick={() => setExpanded(v => !v)}>
          {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        </button>
      </div>

      <div>
        <p className="kpi-value text-rose-500">{fmt(totalDebt)}</p>
        {data.debts.length > 0 && (
          <p className="text-xs text-surface-300 mt-0.5">
            Debt-free in ~{Math.ceil(avalancheMonths / 12)} yrs (avalanche + {fmt(extra)}/mo extra)
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {data.debts.map(d => (
          <div key={d.id}>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="font-medium text-surface-800">{d.name}</span>
              <span className="text-surface-300">{d.rate}% APR · {fmt(d.balance)}</span>
            </div>
            <div className="w-full bg-surface-100 rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min((d.balance / Math.max(totalDebt, 1)) * 100, 100)}%`, backgroundColor: d.color }}
              />
            </div>
          </div>
        ))}
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 pt-2 border-t border-surface-100 animate-fade-up">
          <div>
            <label className="text-xs text-surface-300 font-medium">Extra monthly payment: {fmt(extra)}</label>
            <input
              type="range" min={0} max={5000} step={50} value={extra}
              onChange={e => setExtra(Number(e.target.value))}
              className="w-full accent-amber-500 mt-1"
            />
            {data.debts.length > 0 && (
              <p className="text-xs text-emerald-600 mt-1">
                Saves {fmt(totalInterest)} in interest · Done in {Math.ceil(avalancheMonths/12)} yrs {avalancheMonths%12} mo
              </p>
            )}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-surface-300 uppercase tracking-widest">Add Debt</p>
            <input className="input-field" placeholder="Name (e.g. Student Loan)" value={form.name} onChange={e => setForm(v=>({...v,name:e.target.value}))} />
            <div className="grid grid-cols-3 gap-2">
              <input className="input-field" type="number" placeholder="Balance" value={form.balance} onChange={e => setForm(v=>({...v,balance:e.target.value}))} />
              <input className="input-field" type="number" placeholder="APR %" value={form.rate} onChange={e => setForm(v=>({...v,rate:e.target.value}))} />
              <input className="input-field" type="number" placeholder="Min $" value={form.minPayment} onChange={e => setForm(v=>({...v,minPayment:e.target.value}))} />
            </div>
            <button type="submit" className="btn-primary flex items-center gap-1 justify-center">
              <Plus size={14}/> Add
            </button>
          </form>

          {data.debts.length > 0 && (
            <div className="flex flex-col gap-1">
              {data.debts.map(d => (
                <div key={d.id} className="flex justify-between items-center text-xs py-1.5 border-b border-surface-50">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}/>
                    <span className="font-medium text-surface-800">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-rose-500 font-medium">{fmt(d.balance)}</span>
                    <button onClick={() => deleteDebt(d.id)} className="text-surface-300 hover:text-rose-400 transition-colors">
                      <Trash2 size={12}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
