import { TrendingUp, TrendingDown, Wallet, BarChart3, CreditCard, Target } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { netWorth, fireNumber, fmtINR, fmtPct, monthlyCashFlow } from '../lib/calc'

export default function KpiRow() {
  const { data } = useApp()
  const { snapshots, transactions, settings } = data

  const sorted   = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  const latest   = sorted[sorted.length - 1]
  const prev     = sorted[sorted.length - 2]
  const nw       = latest ? netWorth(latest) : 0
  const prevNw   = prev   ? netWorth(prev)   : 0
  const nwChange = prevNw ? ((nw - prevNw) / Math.abs(prevNw)) * 100 : 0

  const thisMonth = new Date().toISOString().slice(0, 7)
  const { income, expenses, net } = monthlyCashFlow(transactions, thisMonth)

  const fire    = fireNumber(settings.monthlyExpenses, settings.safeWithdrawalRate)
  const firePct = Math.min((nw / fire) * 100, 100)
  const totalDebt = data.debts.reduce((a, d) => a + d.balance, 0)

  const kpis = [
    {
      label: 'Net Worth',
      value: fmtINR(nw),
      change: snapshots.length ? fmtPct(nwChange) : 'Add a snapshot',
      up: nwChange >= 0,
      showTrend: snapshots.length > 1,
      icon: <Wallet size={16} className="text-amber-500" />,
      sub: prev ? `vs ${prev.date.slice(0, 7)}` : 'No snapshots yet',
    },
    {
      label: 'Monthly Cash Flow',
      value: fmtINR(net),
      change: income > 0 ? `${Math.round((net / income) * 100)}% savings rate` : 'No transactions',
      up: net >= 0,
      showTrend: income > 0,
      icon: <BarChart3 size={16} className="text-indigo-500" />,
      sub: income > 0 ? `${fmtINR(income)} in · ${fmtINR(expenses)} out` : 'Log transactions to track',
    },
    {
      label: 'Total Debt',
      value: fmtINR(totalDebt),
      change: totalDebt === 0 ? 'Debt free' : `${data.debts.length} loan${data.debts.length !== 1 ? 's' : ''}`,
      up: totalDebt === 0,
      showTrend: false,
      icon: <CreditCard size={16} className="text-rose-500" />,
      sub: data.debts.length ? `Avg ${(data.debts.reduce((a,d)=>a+d.rate,0)/data.debts.length).toFixed(1)}% APR` : 'No active loans',
    },
    {
      label: 'FIRE Progress',
      value: `${firePct.toFixed(1)}%`,
      change: `Target ${fmtINR(fire)}`,
      up: firePct > 0,
      showTrend: false,
      icon: <Target size={16} className="text-orange-500" />,
      sub: firePct >= 100 ? 'Financial independence achieved' : `${fmtINR(Math.max(fire - nw, 0))} remaining`,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
      {kpis.map((k) => (
        <div key={k.label} className="card px-3 sm:px-5 py-4 flex flex-col gap-1.5 min-h-[120px]">
          <div className="flex items-center justify-between">
            <span className="kpi-label">{k.label}</span>
            {k.icon}
          </div>
          <div className="kpi-value text-xl sm:text-2xl tracking-tight">{k.value}</div>
          <div className="flex items-center gap-1.5">
            {k.showTrend && (
              k.up
                ? <TrendingUp size={12} className="text-emerald-500 shrink-0" />
                : <TrendingDown size={12} className="text-rose-400 shrink-0" />
            )}
            <span className={`text-xs font-medium truncate ${k.up ? 'text-emerald-600' : 'text-rose-500'}`}>
              {k.change}
            </span>
          </div>
          <p className="text-[11px] text-surface-300 leading-tight">{k.sub}</p>
        </div>
      ))}
    </div>
  )
}
