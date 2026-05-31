import { useMemo } from 'react'
import {
  AreaChart, Area, ResponsiveContainer, Tooltip, XAxis,
} from 'recharts'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { netWorth, fmtINR, monthlyCashFlow } from '../lib/calc'
import { calcHealthScore } from '../lib/healthScore'
import { fireNumber } from '../lib/calc'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function shortMonth(yyyyMM: string) {
  const [, m] = yyyyMM.split('-')
  return MONTH_NAMES[parseInt(m) - 1]
}

export default function HeroSection() {
  const { data } = useApp()
  const { snapshots, transactions, settings, scenarios } = data

  // Net worth history
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

  const nwNow     = latest    ? netWorth(latest)    : 0
  const nwPrev    = prevMonth ? netWorth(prevMonth)  : 0
  const nwYearAgo = yearAgo   ? netWorth(yearAgo)    : 0
  const momChange = nwNow - nwPrev
  const ytdChange = nwNow - nwYearAgo

  // Sparkline data — last 12 months from snapshots or monthly cashflow
  const sparkData = useMemo(() => {
    if (sorted.length >= 2) {
      return sorted.slice(-12).map(s => ({
        label: shortMonth(s.date),
        value: netWorth(s),
      }))
    }
    // Fall back to cumulative cashflow
    const points = []
    let running = 0
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      const month = d.toISOString().slice(0, 7)
      const cf = monthlyCashFlow(transactions, month)
      running += cf.net
      points.push({ label: shortMonth(month), value: running > 0 ? running : 0 })
    }
    return points
  }, [sorted, transactions])

  // Key stats
  const hs       = useMemo(() => calcHealthScore(data), [data])
  const hasData  = snapshots.length > 0 || transactions.length > 0
  const baseline = scenarios.find(s => s.id === 'baseline') ?? scenarios[0]
  const thisMonth = new Date().toISOString().slice(0, 7)
  const cf       = monthlyCashFlow(transactions, thisMonth)
  const savingsRate = cf.income > 0 ? Math.round((cf.net / cf.income) * 100) : 0

  const fireTarget = fireNumber(settings.monthlyExpenses, settings.safeWithdrawalRate)
  const firePct    = fireTarget > 0 ? Math.min(Math.round((nwNow / fireTarget) * 100), 100) : 0

  const isUp = momChange >= 0

  return (
    <div className="card p-5 sm:p-7 flex flex-col gap-5">
      {/* Net worth + change */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-1">
            Total Net Worth
          </p>
          <p className="text-4xl sm:text-5xl font-bold tracking-tight text-surface-900">
            {fmtINR(nwNow)}
          </p>
          {(momChange !== 0 || nwPrev > 0) && (
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className={`flex items-center gap-1 text-sm font-semibold ${isUp ? 'text-emerald-600' : 'text-rose-500'}`}>
                {isUp ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
                {isUp ? '+' : ''}{fmtINR(momChange)} this month
              </span>
              {ytdChange !== 0 && nwYearAgo > 0 && (
                <span className="text-sm text-surface-400">
                  {ytdChange >= 0 ? '+' : ''}{fmtINR(ytdChange)} past 12 months
                </span>
              )}
            </div>
          )}
          {!hasData && (
            <p className="text-sm text-surface-400 mt-2">
              Import your data or add a snapshot to see your real net worth
            </p>
          )}
        </div>

        {/* Key stats pills */}
        <div className="flex flex-wrap gap-2">
          {hasData && hs.total > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-50 border border-surface-100">
              <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Health</span>
              <span className="text-sm font-bold" style={{ color: hs.color }}>{hs.total}</span>
              <span className="text-[10px] text-surface-300">/ 100</span>
            </div>
          )}
          {firePct > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-50 border border-surface-100">
              <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">FIRE</span>
              <span className="text-sm font-bold text-amber-600">{firePct}%</span>
            </div>
          )}
          {savingsRate > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-50 border border-surface-100">
              <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Saved</span>
              <span className="text-sm font-bold text-emerald-600">{savingsRate}%</span>
            </div>
          )}
          {settings.retirementAge > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-50 border border-surface-100">
              <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Target</span>
              <span className="text-sm font-bold text-surface-700">Age {settings.retirementAge}</span>
            </div>
          )}
        </div>
      </div>

      {/* Sparkline */}
      {sparkData.some(d => d.value > 0) && (
        <div className="-mx-5 sm:-mx-7 px-5 sm:px-7">
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={sparkData} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
              <defs>
                <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#f59e0b" stopOpacity={0.3}/>
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a8a29e' }}
                tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v: any) => [fmtINR(v as number), 'Net Worth']}
                contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e7e5e4' }}
              />
              <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2}
                fill="url(#nwGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* FIRE progress bar */}
      {fireTarget > 0 && (
        <div>
          <div className="flex justify-between text-[10px] text-surface-300 mb-1.5 font-medium">
            <span>Financial Independence Progress</span>
            <span className="font-semibold text-amber-600">{firePct}% · {fmtINR(nwNow)} of {fmtINR(fireTarget)}</span>
          </div>
          <div className="w-full bg-surface-100 rounded-full h-1.5 overflow-hidden">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 transition-all duration-700"
              style={{ width: `${firePct}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}
