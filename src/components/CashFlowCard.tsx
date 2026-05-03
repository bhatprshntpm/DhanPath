import { useState } from 'react'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import { useApp } from '../context/AppContext'
import { monthlyCashFlow, fmtINR } from '../lib/calc'
import EmptyState from './EmptyState'

const EXPENSE_CATEGORIES = ['Housing','Food','Transport','Healthcare','Entertainment','Savings','Subscriptions','Other']
const INCOME_CATEGORIES  = ['Salary','Bonus','Freelance','Dividends','Other']
const COLORS = ['#f59e0b','#6366f1','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#a8a29e']

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function monthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-')
  const shortYear = year.slice(2)
  return `${MONTH_NAMES[parseInt(month) - 1]} '${shortYear}`
}

export default function CashFlowCard() {
  const { data, addTransaction } = useApp()
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState({ date: '', amount: '', category: 'Food', type: 'expense' as 'income'|'expense', note: '' })

  const last6: { label: string; income: number; expenses: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    const month = d.toISOString().slice(0, 7)
    const cf    = monthlyCashFlow(data.transactions, month)
    last6.push({ label: monthLabel(month), income: cf.income, expenses: cf.expenses })
  }

  const thisMonth = new Date().toISOString().slice(0, 7)
  const { income, expenses, net } = monthlyCashFlow(data.transactions, thisMonth)
  const savingsRate = income > 0 ? Math.round((net / income) * 100) : 0

  const byCategory: Record<string, number> = {}
  data.transactions
    .filter(t => t.type === 'expense' && t.date.startsWith(thisMonth))
    .forEach(t => { byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount })
  const catData = Object.entries(byCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.date || !form.amount) return
    addTransaction({ ...form, amount: parseFloat(form.amount) })
    setForm({ date: '', amount: '', category: 'Food', type: 'expense', note: '' })
  }

  const currentMonthName = monthLabel(thisMonth)

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Cash Flow</p>
          <p className="text-xs text-surface-300">{currentMonthName}</p>
        </div>
        <button data-expand="cashflow" className="btn-ghost" onClick={() => setExpanded(v => !v)}>
          {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        </button>
      </div>

      {data.transactions.length === 0 && !expanded ? (
        <EmptyState
          title="No transaction history"
          description="Upload your bank statement to automatically populate your income and expenditure — no manual entry required."
          cta="Upload bank statement"
          onCta={() => setExpanded(true)}
          footnote="Supports HDFC · ICICI · SBI · Axis · Kotak"
        />
      ) : (
        <>
          {/* This month summary */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-300">Income</span>
              <span className="text-sm font-bold text-emerald-600">{fmtINR(income)}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-300">Expenses</span>
              <span className="text-sm font-bold text-rose-500">{fmtINR(expenses)}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-surface-300">Saved</span>
              <span className={`text-sm font-bold ${net >= 0 ? 'text-surface-800' : 'text-rose-500'}`}>
                {fmtINR(net)}
                {income > 0 && <span className="text-[10px] font-normal text-surface-300 ml-1">({savingsRate}%)</span>}
              </span>
            </div>
          </div>

          {/* 6-month bar chart with readable labels */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-2">Last 6 Months</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={last6} barSize={8} barCategoryGap="30%">
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#a8a29e' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(v: any) => [fmtINR(v as number), '']}
                  labelStyle={{ fontSize: 11, fontWeight: 600, color: '#292524' }}
                  contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e7e5e4' }}
                />
                <Bar dataKey="income"   name="Income"   fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 mt-1">
              <span className="flex items-center gap-1.5 text-[10px] text-surface-400">
                <span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block"/>Income
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-surface-400">
                <span className="w-2 h-2 rounded-sm bg-rose-500 inline-block"/>Expenses
              </span>
            </div>
          </div>
        </>
      )}

      {expanded && (
        <div className="flex flex-col gap-4 pt-3 border-t border-surface-100 animate-fade-up">

          {/* Expenditure breakdown */}
          {catData.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-2">
                Expenditure Breakdown — {currentMonthName}
              </p>
              <ResponsiveContainer width="100%" height={Math.max(catData.length * 24, 80)}>
                <BarChart data={catData} layout="vertical" barSize={10}>
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    tick={{ fontSize: 11, fill: '#78716c' }}
                    tickLine={false}
                    axisLine={false}
                    width={90}
                  />
                  <Tooltip
                    formatter={(v: any) => [fmtINR(v as number), 'Amount']}
                    contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e7e5e4' }}
                  />
                  <Bar dataKey="value" radius={[0,4,4,0]}>
                    {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Recent transactions */}
          {data.transactions.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-2">Recent Transactions</p>
              <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
                {[...data.transactions].reverse().slice(0, 20).map(t => (
                  <div key={t.id} className="flex justify-between items-center text-xs py-1.5 border-b border-surface-50">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.type === 'income' ? 'bg-emerald-500' : 'bg-rose-400'}`}/>
                      <div className="min-w-0">
                        <span className="font-medium text-surface-800">{t.category}</span>
                        {t.note && <span className="text-surface-300 ml-1 truncate">· {t.note.slice(0,35)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-[10px] text-surface-300">{t.date.slice(0,7)}</span>
                      <span className={`font-semibold ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {t.type === 'income' ? '+' : '-'}{fmtINR(t.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add transaction form */}
          <form onSubmit={submit} className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-surface-300 uppercase tracking-widest">Add Transaction</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="input-field" type="date" value={form.date} onChange={e => setForm(v=>({...v, date: e.target.value}))} />
              <input className="input-field" type="number" placeholder="Amount (₹)" value={form.amount} onChange={e => setForm(v=>({...v, amount: e.target.value}))} />
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
        </div>
      )}
    </div>
  )
}
