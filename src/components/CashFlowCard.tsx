import { useState, useMemo } from 'react'
import { Plus, ChevronDown, ChevronUp, Search, X, Trash2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import { useApp } from '../context/AppContext'
import { monthlyCashFlow, fmtINR } from '../lib/calc'
import EmptyState from './EmptyState'

const EXPENSE_CATEGORIES = ['Housing','Food','Transport','Healthcare','Entertainment','Savings','Subscriptions','Loan EMI','Utilities','Other']
const INCOME_CATEGORIES  = ['Salary','Bonus','Freelance','Dividends','Other']
const COLORS = ['#f59e0b','#6366f1','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#a8a29e']
const PAGE_SIZE = 25

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function monthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-')
  return `${MONTH_NAMES[parseInt(month) - 1]} '${year.slice(2)}`
}

export default function CashFlowCard() {
  const { data, addTransaction, deleteTransaction } = useApp()
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState({ date: '', amount: '', category: 'Food', type: 'expense' as 'income'|'expense', note: '' })

  // Ledger filters
  const [search,        setSearch]       = useState('')
  const [filterMonth,   setFilterMonth]  = useState('')
  const [filterCat,     setFilterCat]    = useState('')
  const [filterType,    setFilterType]   = useState<'all'|'income'|'expense'>('all')
  const [page,          setPage]         = useState(1)

  // Chart data
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
  const catData = Object.entries(byCategory).sort(([,a],[,b]) => b - a).map(([name, value]) => ({ name, value }))

  // Available months for filter dropdown
  const availableMonths = useMemo(() => {
    const months = new Set(data.transactions.map(t => t.date.slice(0, 7)))
    return [...months].sort((a, b) => b.localeCompare(a))
  }, [data.transactions])

  // All categories present in data
  const availableCategories = useMemo(() => {
    return [...new Set(data.transactions.map(t => t.category))].sort()
  }, [data.transactions])

  // Filtered + searched transactions
  const filtered = useMemo(() => {
    return [...data.transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter(t => {
        if (filterType !== 'all' && t.type !== filterType) return false
        if (filterMonth && !t.date.startsWith(filterMonth)) return false
        if (filterCat && t.category !== filterCat) return false
        if (search) {
          const q = search.toLowerCase()
          return t.category.toLowerCase().includes(q) || t.note.toLowerCase().includes(q)
        }
        return true
      })
  }, [data.transactions, filterType, filterMonth, filterCat, search])

  const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Summary for filtered set
  const filteredIncome   = filtered.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0)
  const filteredExpenses = filtered.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)

  const hasFilters = search || filterMonth || filterCat || filterType !== 'all'

  function clearFilters() {
    setSearch(''); setFilterMonth(''); setFilterCat(''); setFilterType('all'); setPage(1)
  }

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

          {/* 6-month chart */}
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-2">Last 6 Months</p>
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={last6} barSize={8} barCategoryGap="30%">
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a8a29e' }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v: any) => [fmtINR(v as number), '']}
                  contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e7e5e4' }} />
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
        <div className="flex flex-col gap-5 pt-3 border-t border-surface-100 animate-fade-up">

          {/* Expenditure breakdown */}
          {catData.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-2">
                Expenditure Breakdown — {currentMonthName}
              </p>
              <ResponsiveContainer width="100%" height={Math.max(catData.length * 26, 80)}>
                <BarChart data={catData} layout="vertical" barSize={10}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#78716c' }}
                    tickLine={false} axisLine={false} width={90} />
                  <Tooltip formatter={(v: any) => [fmtINR(v as number), 'Amount']}
                    contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e7e5e4' }} />
                  <Bar dataKey="value" radius={[0,4,4,0]}>
                    {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Transaction Ledger */}
          {data.transactions.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300">
                  All Transactions
                  <span className="ml-2 normal-case font-normal text-surface-400">
                    ({filtered.length} of {data.transactions.length})
                  </span>
                </p>
                {hasFilters && (
                  <button onClick={clearFilters} className="text-[10px] text-amber-600 hover:text-amber-700 font-medium flex items-center gap-0.5">
                    <X size={10}/> Clear filters
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex flex-col gap-2">
                {/* Search */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-300" />
                  <input
                    className="input-field pl-8 text-xs py-1.5"
                    placeholder="Search by category or note…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                  />
                </div>

                {/* Filter row */}
                <div className="flex gap-2 flex-wrap">
                  {/* Type */}
                  <div className="flex rounded-xl border border-surface-200 overflow-hidden text-xs">
                    {(['all', 'income', 'expense'] as const).map(t => (
                      <button key={t} onClick={() => { setFilterType(t); setPage(1) }}
                        className={`px-3 py-1.5 font-medium transition-colors ${filterType === t ? 'bg-amber-500 text-white' : 'bg-white text-surface-500 hover:bg-surface-50'}`}>
                        {t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Month */}
                  <select className="input-field text-xs py-1.5 flex-1 min-w-[110px]"
                    value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1) }}>
                    <option value="">All months</option>
                    {availableMonths.map(m => (
                      <option key={m} value={m}>{monthLabel(m)}</option>
                    ))}
                  </select>

                  {/* Category */}
                  <select className="input-field text-xs py-1.5 flex-1 min-w-[110px]"
                    value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1) }}>
                    <option value="">All categories</option>
                    {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Filtered summary */}
                {hasFilters && filtered.length > 0 && (
                  <div className="flex gap-4 px-1 text-xs">
                    <span className="text-emerald-600 font-medium">+{fmtINR(filteredIncome)}</span>
                    <span className="text-rose-500 font-medium">−{fmtINR(filteredExpenses)}</span>
                    <span className={`font-semibold ${filteredIncome - filteredExpenses >= 0 ? 'text-surface-700' : 'text-rose-500'}`}>
                      Net {fmtINR(filteredIncome - filteredExpenses)}
                    </span>
                  </div>
                )}
              </div>

              {/* Transaction list */}
              {paginated.length === 0 ? (
                <p className="text-xs text-surface-400 text-center py-4">No transactions match your filters</p>
              ) : (
                <div className="flex flex-col divide-y divide-surface-50">
                  {paginated.map(t => (
                    <div key={t.id} className="flex items-center justify-between py-2 gap-3 group">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.type === 'income' ? 'bg-emerald-500' : 'bg-rose-400'}`}/>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-surface-800">{t.category}</span>
                            <span className="text-[10px] text-surface-300 bg-surface-100 px-1.5 py-0.5 rounded-full">{t.date.slice(0,7)}</span>
                          </div>
                          {t.note && <p className="text-[10px] text-surface-400 truncate mt-0.5">{t.note}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-bold ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {t.type === 'income' ? '+' : '−'}{fmtINR(t.amount)}
                        </span>
                        <button onClick={() => deleteTransaction(t.id)}
                          className="opacity-0 group-hover:opacity-100 text-surface-300 hover:text-rose-400 transition-all">
                          <Trash2 size={11}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs pt-1">
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                    className="btn-ghost disabled:opacity-30 text-xs px-2 py-1">← Prev</button>
                  <span className="text-surface-400">Page {page} of {totalPages}</span>
                  <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                    className="btn-ghost disabled:opacity-30 text-xs px-2 py-1">Next →</button>
                </div>
              )}
            </div>
          )}

          {/* Add transaction form */}
          <form onSubmit={submit} className="flex flex-col gap-2 pt-2 border-t border-surface-100">
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
