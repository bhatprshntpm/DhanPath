import { useMemo } from 'react'
import { TrendingUp, TrendingDown, Flame } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { netWorth, fmtINR, monthlyCashFlow, fireNumber, yearsToFire } from '../lib/calc'
import { calcHealthScore } from '../lib/healthScore'

export default function HeroSection() {
  const { data } = useApp()
  const { snapshots, transactions, settings, scenarios } = data

  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => a.date.localeCompare(b.date)),
    [snapshots],
  )
  const latest    = sorted.at(-1)
  const prevMonth = sorted.at(-2)
  const yearAgo   = sorted.find(s => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1)
    return s.date >= d.toISOString().slice(0, 7)
  })

  const nwNow = (() => {
    if (data.holdings.length > 0) {
      const investedTotal = data.holdings.reduce((a, h) => a + h.value, 0)
      const cashExtra     = latest ? (latest.assets.checking + latest.assets.savings + latest.assets.realEstate) : 0
      const liabilities   = latest
        ? Object.values(latest.liabilities).reduce((a, b) => a + b, 0)
        : data.debts.reduce((a, d) => a + d.balance, 0)
      return investedTotal + cashExtra - liabilities
    }
    if (latest) return netWorth(latest)
    return 0
  })()

  const nwPrev    = prevMonth ? netWorth(prevMonth) : 0
  const nwYearAgo = yearAgo   ? netWorth(yearAgo)   : 0
  const momChange = nwNow - nwPrev
  const ytdChange = nwNow - nwYearAgo

  const firstSnapshot = sorted.at(0)
  const nwFirst       = firstSnapshot ? netWorth(firstSnapshot) : 0
  const sinceFirst    = nwFirst > 0 ? nwNow - nwFirst : 0
  const sinceFirstPct = nwFirst > 0 ? ((sinceFirst / nwFirst) * 100) : 0
  const firstDate     = firstSnapshot?.date ?? ''

  const hs       = useMemo(() => calcHealthScore(data), [data])
  const hasData  = snapshots.length > 0 || transactions.length > 0
  const thisMonth = new Date().toISOString().slice(0, 7)
  const cf       = monthlyCashFlow(transactions, thisMonth)

  // Prefer settings-based income/savings over transaction-derived (more reliable)
  const income       = settings.monthlyIncome   > 0 ? settings.monthlyIncome   : cf.income
  const expenses     = settings.monthlyExpenses > 0 ? settings.monthlyExpenses : cf.income - cf.net
  const emi          = settings.monthlyEMI      > 0 ? settings.monthlyEMI      : 0
  const sip          = settings.existingSIP     > 0 ? settings.existingSIP     : 0
  const surplus      = income - expenses - emi
  const savingsRate  = income > 0 ? Math.round(((surplus) / income) * 100) : 0
  const investRate   = income > 0 ? Math.round((sip / income) * 100) : 0

  const fireTarget  = fireNumber(settings.monthlyExpenses, settings.safeWithdrawalRate)
  const firePct     = fireTarget > 0 ? Math.min(Math.round((nwNow / fireTarget) * 100), 100) : 0
  const baseline    = scenarios.find(s => s.id === 'baseline') ?? scenarios[0]
  const yrs         = baseline ? yearsToFire(nwNow, settings, baseline, data.goals) : -1
  const retireAge   = yrs >= 0 ? settings.currentAge + yrs : null

  const isUp = momChange >= 0

  return (
    <div className="card p-5 sm:p-7 flex flex-col gap-5">
      {/* Net worth + deltas */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-1">Total Net Worth</p>
          <p className="text-4xl sm:text-5xl font-bold tracking-tight text-surface-900">{fmtINR(nwNow)}</p>

          {nwPrev > 0 && (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className={`flex items-center gap-1 text-sm font-semibold ${isUp ? 'text-emerald-600' : 'text-rose-500'}`}>
                {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {isUp ? '+' : ''}{fmtINR(momChange)} this month
              </span>
              {ytdChange !== 0 && nwYearAgo > 0 && (
                <span className="text-sm text-surface-400">
                  {ytdChange >= 0 ? '+' : ''}{fmtINR(ytdChange)} past 12 months
                </span>
              )}
              {sinceFirst > 0 && sorted.length > 2 && firstDate < (yearAgo?.date ?? '') && (
                <span className="text-sm text-surface-400">
                  {sinceFirst >= 0 ? '+' : ''}{fmtINR(sinceFirst)} ({sinceFirstPct.toFixed(0)}%) since {new Date(firstDate + '-01').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          )}

          {!hasData && (
            <p className="text-sm text-surface-400 mt-2">Import your data to see your real net worth</p>
          )}
        </div>

        {/* Stats pills */}
        <div className="flex flex-wrap gap-2">
          {hasData && hs.total > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-50 border border-surface-100">
              <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Health</span>
              <span className="text-sm font-bold" style={{ color: hs.color }}>{hs.total}</span>
              <span className="text-[10px] text-surface-300">/ 100</span>
            </div>
          )}
          {income > 0 && savingsRate > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-50 border border-surface-100">
              <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Saves</span>
              <span className="text-sm font-bold text-emerald-600">{savingsRate}%</span>
              <span className="text-[10px] text-surface-300">{fmtINR(surplus)}/mo</span>
            </div>
          )}
          {income > 0 && sip > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-50 border border-surface-100">
              <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Invests</span>
              <span className="text-sm font-bold text-amber-600">{investRate}%</span>
              <span className="text-[10px] text-surface-300">{fmtINR(sip)}/mo</span>
            </div>
          )}
          {income > 0 && emi > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-50 border border-surface-100">
              <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">EMI</span>
              <span className="text-sm font-bold text-rose-500">{fmtINR(emi)}/mo</span>
            </div>
          )}
        </div>
      </div>

      {/* FIRE progress — always show when target is set */}
      {fireTarget > 0 && (
        <div className="flex flex-col gap-2 pt-4 border-t border-surface-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame size={14} className="text-amber-500" />
              <span className="text-xs font-semibold text-surface-700">Financial Independence</span>
            </div>
            <span className="text-xs font-semibold text-amber-600 font-mono">
              {firePct}% · {fmtINR(nwNow)} of {fmtINR(fireTarget)}
            </span>
          </div>

          {/* Track */}
          <div className="relative w-full bg-surface-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="h-2.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-700"
              style={{ width: `${firePct}%` }} />
          </div>

          {/* Labels */}
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-surface-300">₹0</span>
            <span className="text-amber-600 font-medium">
              {firePct >= 100
                ? '🎉 Independence achieved'
                : retireAge
                  ? `Retire at age ${retireAge} · ${yrs} yr${yrs !== 1 ? 's' : ''} away`
                  : settings.retirementAge > 0
                    ? `Target age ${settings.retirementAge}`
                    : 'Set expenses & scenarios to project'}
            </span>
            <span className="text-surface-300">{fmtINR(fireTarget)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
