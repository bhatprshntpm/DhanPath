import { useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmtINR, netWorth, totalAssets, totalLiabilities } from '../lib/calc'

const CLASS_COLORS: Record<string, string> = {
  'Equity':           '#f59e0b',
  'Debt':             '#3b82f6',
  'Gold':             '#f97316',
  'International':    '#8b5cf6',
  'Cryptocurrency':   '#ec4899',
  'Real Estate':      '#10b981',
  'Cash':             '#a8a29e',
  'EPF / NPS / PPF':  '#6366f1',
  'Other':            '#d6d3d1',
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function shortMonth(yyyyMM: string) {
  const [y, m] = yyyyMM.split('-')
  return `${MONTH_NAMES[parseInt(m) - 1]} '${y.slice(2)}`
}
function fmtDelta(n: number) {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${fmtINR(n)}`
}

// Derive breakdown from snapshot fields when explicit breakdown is missing
function deriveBreakdown(s: any): Record<string, number> {
  if (s.breakdown && Object.keys(s.breakdown).length > 0) return s.breakdown
  const b: Record<string, number> = {}
  if (s.assets.brokerage > 0)  b['Equity']          = s.assets.brokerage
  if (s.assets.retirement > 0) b['EPF / NPS / PPF'] = s.assets.retirement
  if (s.assets.other > 0)      b['Gold']             = s.assets.other
  if (s.assets.checking + s.assets.savings > 0)
    b['Cash'] = s.assets.checking + s.assets.savings
  if (s.assets.realEstate > 0) b['Real Estate']      = s.assets.realEstate
  return b
}

export default function PortfolioHistory() {
  const { data } = useApp()
  const [expanded, setExpanded] = useState<string | null>(null)

  const sorted = useMemo(
    () => [...data.snapshots].sort((a, b) => a.date.localeCompare(b.date)),
    [data.snapshots],
  )

  // All asset classes seen across all snapshots
  const allClasses = useMemo(() => {
    const seen = new Set<string>()
    sorted.forEach(s => Object.keys(deriveBreakdown(s)).forEach(c => seen.add(c)))
    return Array.from(seen)
  }, [sorted])

  // Chart data — one point per snapshot
  const chartData = useMemo(() =>
    sorted.map(s => {
      const bd = deriveBreakdown(s)
      const row: Record<string, any> = { label: shortMonth(s.date) }
      allClasses.forEach(c => { row[c] = bd[c] ?? 0 })
      return row
    }),
  [sorted, allClasses])

  if (sorted.length < 2) return null

  return (
    <div className="card p-5 flex flex-col gap-5">
      <div>
        <p className="section-title">Portfolio History</p>
        <p className="text-xs text-surface-300 mt-0.5">{sorted.length} snapshots · from {shortMonth(sorted[0].date)} to {shortMonth(sorted[sorted.length - 1].date)}</p>
      </div>

      {/* Stacked area chart */}
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a8a29e' }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={v => fmtINR(v)} tick={{ fontSize: 9, fill: '#a8a29e' }} tickLine={false} axisLine={false} width={55} />
          <Tooltip
            formatter={(v: any, name: any) => [fmtINR(v as number), String(name)]}
            contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e7e5e4' }} />
          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
          {allClasses.map(cls => (
            <Area key={cls} type="monotone" dataKey={cls}
              stackId="1" stroke={CLASS_COLORS[cls] ?? '#d6d3d1'}
              fill={CLASS_COLORS[cls] ?? '#d6d3d1'} fillOpacity={0.7}
              strokeWidth={1.5} dot={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      {/* Snapshot comparison table */}
      <div className="flex flex-col divide-y divide-surface-50">
        <div className="grid grid-cols-4 gap-2 pb-2 text-[9px] uppercase tracking-widest font-semibold text-surface-300">
          <span>Period</span><span className="text-right">Net Worth</span>
          <span className="text-right">Change</span><span className="text-right">vs Start</span>
        </div>

        {sorted.map((s, i) => {
          const nw        = netWorth(s)
          const prev      = i > 0 ? netWorth(sorted[i - 1]) : 0
          const delta     = i > 0 ? nw - prev : 0
          const vsFirst   = i > 0 ? nw - netWorth(sorted[0]) : 0
          const isOpen    = expanded === s.id
          const bd        = deriveBreakdown(s)

          return (
            <div key={s.id}>
              <button
                className="w-full grid grid-cols-4 gap-2 py-2.5 text-left hover:bg-surface-50/60 rounded-lg px-1 -mx-1 transition-colors"
                onClick={() => setExpanded(isOpen ? null : s.id)}>
                <span className="text-xs font-semibold text-surface-800 flex items-center gap-1">
                  {isOpen ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
                  {shortMonth(s.date)}
                </span>
                <span className="text-xs font-mono text-right text-surface-800">{fmtINR(nw)}</span>
                <span className={`text-xs font-mono text-right ${delta >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {i === 0 ? '—' : fmtDelta(delta)}
                </span>
                <span className={`text-xs font-mono text-right ${vsFirst >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {i === 0 ? 'start' : fmtDelta(vsFirst)}
                </span>
              </button>

              {isOpen && (
                <div className="ml-4 mb-2 flex flex-col gap-1 animate-fade-up">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 py-2 border-t border-surface-50">
                    {Object.entries(bd).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a).map(([cls, val]) => (
                      <div key={cls} className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] text-surface-600">
                          <span className="w-2 h-2 rounded-full" style={{ background: CLASS_COLORS[cls] ?? '#d6d3d1' }}/>
                          {cls}
                        </span>
                        <span className="text-[11px] font-mono text-surface-700">{fmtINR(val)}</span>
                      </div>
                    ))}
                    {totalLiabilities(s) > 0 && (
                      <div className="flex items-center justify-between col-span-2 pt-1 border-t border-surface-50">
                        <span className="text-[11px] text-rose-500">Liabilities</span>
                        <span className="text-[11px] font-mono text-rose-500">−{fmtINR(totalLiabilities(s))}</span>
                      </div>
                    )}
                    {totalAssets(s) > 0 && (
                      <div className="flex items-center justify-between col-span-2 pt-1 border-t border-surface-100">
                        <span className="text-[11px] font-semibold text-surface-700">Net Worth</span>
                        <span className="text-[11px] font-mono font-semibold text-surface-800">{fmtINR(nw)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
