import { useMemo } from 'react'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useApp } from '../context/AppContext'
import { monthlyCashFlow, fmtINR } from '../lib/calc'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function monthLabel(yyyyMM: string) {
  const [year, m] = yyyyMM.split('-')
  return `${MONTH_NAMES[parseInt(m) - 1]} '${year.slice(2)}`
}

export default function CashFlowOverview() {
  const { data } = useApp()

  const last6 = useMemo(() => {
    const points = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      const month = d.toISOString().slice(0, 7)
      const cf    = monthlyCashFlow(data.transactions, month)
      points.push({ label: monthLabel(month), income: cf.income, expenses: cf.expenses, net: cf.net })
    }
    return points
  }, [data.transactions])

  const thisMonth = new Date().toISOString().slice(0, 7)
  const cf        = monthlyCashFlow(data.transactions, thisMonth)
  const savingsRate = cf.income > 0 ? Math.round((cf.net / cf.income) * 100) : 0

  const currentMonthLabel = monthLabel(thisMonth)

  // Top expense categories this month
  const byCat: Record<string, number> = {}
  data.transactions
    .filter(t => t.type === 'expense' && t.date.startsWith(thisMonth))
    .forEach(t => { byCat[t.category] = (byCat[t.category] ?? 0) + t.amount })
  const topCats = Object.entries(byCat).sort(([,a],[,b]) => b-a).slice(0, 4)

  return (
    <div className="card p-5 flex flex-col gap-4 h-full">
      <div>
        <p className="section-title">Cash Flow</p>
        <p className="text-xs text-surface-300">{currentMonthLabel}</p>
      </div>

      {cf.income === 0 && cf.expenses === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-4">
          <p className="text-sm font-medium text-surface-600">No transactions this month</p>
          <p className="text-xs text-surface-400">Import your bank statement to track spending</p>
        </div>
      ) : (
        <>
          {/* This month summary */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[9px] uppercase tracking-widest font-semibold text-surface-300">Income</p>
              <p className="text-sm font-bold text-emerald-600 mt-0.5">{fmtINR(cf.income)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest font-semibold text-surface-300">Expenses</p>
              <p className="text-sm font-bold text-rose-500 mt-0.5">{fmtINR(cf.expenses)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest font-semibold text-surface-300">Saved</p>
              <p className={`text-sm font-bold mt-0.5 ${cf.net >= 0 ? 'text-surface-800' : 'text-rose-500'}`}>
                {fmtINR(cf.net)}
                {savingsRate > 0 && <span className="text-[10px] font-normal text-surface-300 ml-1">({savingsRate}%)</span>}
              </p>
            </div>
          </div>

          {/* 6-month chart */}
          <ResponsiveContainer width="100%" height={90}>
            <BarChart data={last6} barSize={7} barCategoryGap="30%">
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#a8a29e' }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: any) => [fmtINR(v as number), '']}
                contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e7e5e4' }} />
              <Bar dataKey="income"   fill="#10b981" radius={[3,3,0,0]} />
              <Bar dataKey="expenses" fill="#f43f5e" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-3 -mt-1">
            <span className="flex items-center gap-1 text-[10px] text-surface-400">
              <span className="w-2 h-2 rounded-sm bg-emerald-500"/>Income
            </span>
            <span className="flex items-center gap-1 text-[10px] text-surface-400">
              <span className="w-2 h-2 rounded-sm bg-rose-500"/>Expenses
            </span>
          </div>

          {/* Top categories */}
          {topCats.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-surface-50">
              <p className="text-[9px] uppercase tracking-widest font-semibold text-surface-300">Top Expenditure</p>
              {topCats.map(([cat, val]) => (
                <div key={cat} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-surface-700 font-medium truncate">{cat}</span>
                      <span className="text-surface-500 font-mono shrink-0 ml-2">{fmtINR(val)}</span>
                    </div>
                    <div className="w-full bg-surface-100 rounded-full h-1">
                      <div className="h-1 rounded-full bg-amber-400"
                        style={{ width: `${cf.expenses > 0 ? (val / cf.expenses) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
