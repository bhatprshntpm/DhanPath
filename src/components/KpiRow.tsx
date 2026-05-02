import { TrendingUp, TrendingDown, Wallet, BarChart3, CreditCard, Flame } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { netWorth, fireNumber, fmt, fmtPct, monthlyCashFlow } from '../lib/calc'

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

  const fire   = fireNumber(settings.monthlyExpenses, settings.safeWithdrawalRate)
  const firePct = Math.min((nw / fire) * 100, 100)

  const kpis = [
    {
      label: 'Net Worth',
      value: fmt(nw),
      change: fmtPct(nwChange),
      up: nwChange >= 0,
      icon: <Wallet size={18} className="text-amber-500" />,
      sub: prev ? `vs ${prev.date.slice(0, 7)}` : 'no prior snapshot',
    },
    {
      label: 'Monthly Cash Flow',
      value: fmt(net),
      change: income > 0 ? `${Math.round((net / income) * 100)}% savings rate` : '—',
      up: net >= 0,
      icon: <BarChart3 size={18} className="text-indigo-500" />,
      sub: `${fmt(income)} in · ${fmt(expenses)} out`,
    },
    {
      label: 'Total Debt',
      value: fmt(data.debts.reduce((a, d) => a + d.balance, 0)),
      change: `${data.debts.length} account${data.debts.length !== 1 ? 's' : ''}`,
      up: false,
      icon: <CreditCard size={18} className="text-rose-500" />,
      sub: data.debts.length ? `Avg ${(data.debts.reduce((a,d)=>a+d.rate,0)/data.debts.length).toFixed(1)}% APR` : 'No debts',
    },
    {
      label: 'FIRE Progress',
      value: `${firePct.toFixed(1)}%`,
      change: `Target ${fmt(fire)}`,
      up: true,
      icon: <Flame size={18} className="text-orange-500" />,
      sub: firePct >= 100 ? '🎉 You\'ve hit FIRE!' : `${fmt(fire - nw)} to go`,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
      {kpis.map((k) => (
        <div key={k.label} className="card px-3 sm:px-5 py-3 sm:py-4 flex flex-col gap-1 animate-fade-up">
          <div className="flex items-center justify-between">
            <span className="kpi-label">{k.label}</span>
            {k.icon}
          </div>
          <div className="kpi-value text-xl sm:text-3xl">{k.value}</div>
          <div className="flex items-center gap-1.5">
            {k.label !== 'Total Debt' && k.label !== 'FIRE Progress' && (
              k.up
                ? <TrendingUp size={13} className="text-emerald-500" />
                : <TrendingDown size={13} className="text-rose-400" />
            )}
            <span className={`text-xs font-medium ${k.up ? 'text-emerald-600' : 'text-rose-500'}`}>
              {k.change}
            </span>
          </div>
          <p className="text-xs text-surface-300">{k.sub}</p>
        </div>
      ))}
    </div>
  )
}
