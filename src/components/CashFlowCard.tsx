import { useState } from 'react'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import { useApp } from '../context/AppContext'
import { monthlyCashFlow, fmt } from '../lib/calc'

const EXPENSE_CATEGORIES = ['Housing','Food','Transport','Healthcare','Entertainment','Savings','Subscriptions','Other']
const INCOME_CATEGORIES  = ['Salary','Bonus','Freelance','Dividends','Other']
const COLORS = ['#f59e0b','#6366f1','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#a8a29e']

export default function CashFlowCard() {
  const { data, addTransaction } = useApp()
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState({ date: '', amount: '', category: 'Food', type: 'expense' as 'income'|'expense', note: '' })

  const last6: { month: string; income: number; expenses: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    const month = d.toISOString().slice(0, 7)
    const cf = monthlyCashFlow(data.transactions, month)
    last6.push({ month: month.slice(5), ...cf })
  }

  const thisMonth = new Date().toISOString().slice(0, 7)
  const { income, expenses, net } = monthlyCashFlow(data.transactions, thisMonth)

  const byCategory: Record<string, number> = {}
  data.transactions.filter(t => t.type === 'expense' && t.date.startsWith(thisMonth))
    .forEach(t => { byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount })
  const catData = Object.entries(byCategory).map(([name, value]) => ({ name, value }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.amount) return
    addTransaction({ ...form, amount: parseFloat(form.amount) })
    setForm({ date: '', amount: '', category: 'Food', type: 'expense', note: '' })
  }

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="section-title">Cash Flow</p>
        <button data-expand="cashflow" className="btn-ghost" onClick={() => setExpanded(v => !v)}>
          {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        </button>
      </div>

      <div className="flex justify-between text-sm">
        <span className="text-emerald-600 font-semibold">{fmt(income)} <span className="text-surface-300 font-normal text-xs">in</span></span>
        <span className="text-rose-500 font-semibold">{fmt(expenses)} <span className="text-surface-300 font-normal text-xs">out</span></span>
        <span className={`font-semibold ${net >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
          {fmt(net)} <span className="text-surface-300 font-normal text-xs">net</span>
        </span>
      </div>

      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={last6} barSize={10}>
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#a8a29e' }} tickLine={false} axisLine={false}/>
          <Tooltip formatter={(v: any) => fmt(v as number)} />
          <Bar dataKey="income"   fill="#10b981" radius={[4,4,0,0]} />
          <Bar dataKey="expenses" fill="#f43f5e" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>

      {expanded && (
        <div className="flex flex-col gap-4 pt-2 border-t border-surface-100 animate-fade-up">
          {catData.length > 0 && (
            <ResponsiveContainer width="100%" height={80}>
              <BarChart data={catData} layout="vertical" barSize={8}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#a8a29e' }} tickLine={false} axisLine={false} width={80}/>
                <Tooltip formatter={(v: any) => fmt(v as number)} />
                <Bar dataKey="value" radius={[0,4,4,0]}>
                  {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          <form onSubmit={submit} className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-surface-300 uppercase tracking-widest">Add Transaction</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="input-field" type="date" value={form.date} onChange={e => setForm(v=>({...v, date: e.target.value}))} />
              <input className="input-field" type="number" placeholder="Amount" value={form.amount} onChange={e => setForm(v=>({...v, amount: e.target.value}))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select className="input-field" value={form.type} onChange={e => setForm(v=>({...v, type: e.target.value as 'income'|'expense', category: e.target.value === 'income' ? 'Salary' : 'Food'}))}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <select className="input-field" value={form.category} onChange={e => setForm(v=>({...v, category: e.target.value}))}>
                {(form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <input className="input-field" placeholder="Note (optional)" value={form.note} onChange={e => setForm(v=>({...v, note: e.target.value}))} />
            <button type="submit" className="btn-primary flex items-center gap-1 justify-center">
              <Plus size={14}/> Add
            </button>
          </form>

          {data.transactions.length > 0 && (
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
              {[...data.transactions].reverse().slice(0, 20).map(t => (
                <div key={t.id} className="flex justify-between items-center text-xs py-1.5 border-b border-surface-50">
                  <div>
                    <span className="font-medium text-surface-800">{t.category}</span>
                    {t.note && <span className="text-surface-300 ml-1">· {t.note}</span>}
                  </div>
                  <span className={t.type === 'income' ? 'text-emerald-600 font-medium' : 'text-rose-500 font-medium'}>
                    {t.type === 'income' ? '+' : '-'}{fmt(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
