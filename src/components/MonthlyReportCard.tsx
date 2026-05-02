import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { monthlyCashFlow, fmtINR } from '../lib/calc'

function letterGrade(pct: number): { grade: string; color: string } {
  if (pct >= 90) return { grade: 'A+', color: 'text-emerald-600' }
  if (pct >= 80) return { grade: 'A',  color: 'text-emerald-600' }
  if (pct >= 70) return { grade: 'B+', color: 'text-amber-600'   }
  if (pct >= 60) return { grade: 'B',  color: 'text-amber-600'   }
  if (pct >= 50) return { grade: 'C+', color: 'text-orange-500'  }
  if (pct >= 40) return { grade: 'C',  color: 'text-orange-500'  }
  return              { grade: 'D',  color: 'text-rose-500'    }
}

export default function MonthlyReportCard() {
  const { data } = useApp()
  const { transactions, scenarios } = data
  const baseline       = scenarios.find(s => s.id === 'baseline') ?? scenarios[0]
  const monthlyIncome  = baseline?.assumptions.monthlyIncome ?? 0
  const monthlyExpBudget = baseline?.assumptions.monthlyExpenses ?? 0

  const now    = new Date()
  const months = useMemo(() => {
    const out = []
    for (let i = 0; i < 2; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      out.push(d.toISOString().slice(0, 7))
    }
    return out
  }, [])

  const thisMonth = months[0]
  const lastMonth = months[1]
  const cf        = monthlyCashFlow(transactions, thisMonth)
  const cfLast    = monthlyCashFlow(transactions, lastMonth)

  if (cf.income === 0 && cf.expenses === 0) return null

  const savingsRate  = cf.income > 0 ? (cf.net / cf.income) * 100 : 0
  const expVsBudget  = monthlyExpBudget > 0 ? (cf.expenses / monthlyExpBudget) * 100 : 100
  const incomeVsTarget = monthlyIncome > 0 ? (cf.income / monthlyIncome) * 100 : 100
  const overallPct   = (Math.min(savingsRate / 25, 1) * 40 + Math.min(100 / expVsBudget, 1) * 40 + Math.min(incomeVsTarget / 100, 1) * 20)
  const { grade, color } = letterGrade(overallPct * 100)

  const expChange  = cfLast.expenses > 0 ? ((cf.expenses - cfLast.expenses) / cfLast.expenses) * 100 : 0
  const monthName  = new Date(thisMonth + '-01').toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  const isBestMonth = cf.net > cfLast.net && cf.net > 0

  const rows = [
    { label: 'Income',   value: fmtINR(cf.income),   status: cf.income >= monthlyIncome * 0.95 ? '✅' : '⚠️',   sub: monthlyIncome > 0 ? `target ${fmtINR(monthlyIncome)}` : '' },
    { label: 'Expenses', value: fmtINR(cf.expenses),  status: expVsBudget <= 100 ? '✅' : '⚠️',                  sub: expChange !== 0 ? `${expChange > 0 ? '+' : ''}${expChange.toFixed(0)}% vs last month` : '' },
    { label: 'Saved',    value: fmtINR(cf.net),        status: cf.net > 0 ? '🎉' : '🚨',                          sub: cf.income > 0 ? `${Math.round(savingsRate)}% savings rate` : '' },
    { label: 'SIP',      value: fmtINR(baseline?.assumptions.extraMonthlySavings ?? 0), status: (baseline?.assumptions.extraMonthlySavings ?? 0) > 0 ? '✅' : '⚠️', sub: 'on track' },
  ]

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Monthly Report Card</p>
          <p className="text-xs text-surface-300">{monthName}</p>
        </div>
        <div className="text-center">
          <p className={`text-3xl font-bold ${color}`}>{grade}</p>
          {isBestMonth && <p className="text-[10px] text-emerald-600 font-semibold">Best month! 🎉</p>}
        </div>
      </div>

      <div className="flex flex-col divide-y divide-surface-50">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between py-2.5">
            <div>
              <span className="text-sm font-medium text-surface-800">{r.label}</span>
              {r.sub && <p className="text-[10px] text-surface-300">{r.sub}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-surface-800 font-mono">{r.value}</span>
              <span className="text-base">{r.status}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={`p-3 rounded-xl text-xs font-medium text-center ${cf.net > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
        {cf.net > 0
          ? `You saved ${fmtINR(cf.net)} this month${isBestMonth ? ' — your personal best! 🏆' : '. Keep it up! 💪'}`
          : `Expenses exceeded income by ${fmtINR(Math.abs(cf.net))}. Try cutting discretionary spending next month.`}
      </div>
    </div>
  )
}
