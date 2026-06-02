import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts'
import { ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmtINR, netWorth, totalAssets } from '../lib/calc'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function shortMonth(yyyyMM: string) {
  const [y, m] = yyyyMM.split('-')
  return `${MONTH_NAMES[parseInt(m) - 1]} '${y.slice(2)}`
}

// A snapshot is "complete" if it has meaningful multi-source data
// (i.e. not just an EPF-only partial record)
function isComplete(s: any): boolean {
  const a = s.assets
  const hasInvested = (a.brokerage + a.retirement + a.other) > 10000
  const hasBreakdown = s.breakdown && Object.keys(s.breakdown).length > 1
  return hasInvested || hasBreakdown
}

// Deduplicate: for same month keep highest total assets snapshot
function deduplicate(snapshots: any[]): any[] {
  const map = new Map<string, any>()
  for (const s of snapshots) {
    const existing = map.get(s.date)
    if (!existing || totalAssets(s) > totalAssets(existing)) {
      map.set(s.date, s)
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function project(currentNw: number, months: number, annualReturn = 12): number {
  return Math.round(currentNw * Math.pow(1 + annualReturn / 100, months / 12))
}

// ─── Growth projection card (< 3 complete months) ────────────────────────────
function GrowthProjectionCard({ nwNow }: { nwNow: number }) {
  const { data } = useApp()
  const annualReturn = data.scenarios[0]?.assumptions?.annualReturn ?? 12

  if (nwNow <= 0) return null

  const proj1yr  = project(nwNow, 12,  annualReturn)
  const proj3yr  = project(nwNow, 36,  annualReturn)
  const proj5yr  = project(nwNow, 60,  annualReturn)
  const proj10yr = project(nwNow, 120, annualReturn)

  const chartData = [0,3,6,9,12,18,24,30,36,42,48,54,60].map(m => ({
    label: m === 0 ? 'Now' : m < 12 ? `+${m}m` : `+${m/12}yr`,
    value: project(nwNow, m, annualReturn),
  }))

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <TrendingUp size={15} className="text-amber-500" />
        <p className="section-title">Portfolio Growth Projection</p>
      </div>
      <p className="text-xs text-surface-400 -mt-2">
        Based on your current portfolio of <span className="font-semibold text-surface-700">{fmtINR(nwNow)}</span> at {annualReturn}% annual return. History chart unlocks after 3 months of imports.
      </p>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '1 Year',  value: proj1yr  },
          { label: '3 Years', value: proj3yr  },
          { label: '5 Years', value: proj5yr  },
          { label: '10 Years',value: proj10yr },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center p-3 bg-surface-50 rounded-xl border border-surface-100">
            <p className="text-[10px] text-surface-400 uppercase tracking-widest mb-1">{label}</p>
            <p className="text-sm font-bold text-surface-800">{fmtINR(value)}</p>
            <p className="text-[10px] text-emerald-600 font-medium mt-0.5">
              +{fmtINR(value - nwNow)}
            </p>
          </div>
        ))}
      </div>

      {/* Projection curve */}
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={chartData} margin={{ top: 4, bottom: 0, left: 0, right: 8 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#a8a29e' }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={v => fmtINR(v)} tick={{ fontSize: 9, fill: '#a8a29e' }} tickLine={false} axisLine={false} width={52} />
          <Tooltip
            formatter={(v: any) => [fmtINR(v as number), 'Projected']}
            contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e7e5e4' }} />
          <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2}
            strokeDasharray="6 3" dot={false} />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-surface-300 text-center">
        Import Zerodha / EPF monthly to build your actual history
      </p>
    </div>
  )
}

// ─── Full history chart (≥ 3 complete months) ────────────────────────────────
function HistoryChart({ snapshots, nwNow }: { snapshots: any[], nwNow: number }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const { data } = useApp()
  const annualReturn = data.scenarios[0]?.assumptions?.annualReturn ?? 12

  // Build actual + projected points
  const lastDate  = snapshots.at(-1)?.date ?? ''
  const [ly, lm]  = lastDate.split('-').map(Number)

  const actualPoints = snapshots.map(s => ({
    label:    shortMonth(s.date),
    date:     s.date,
    actual:   netWorth(s),
    projected: undefined as number | undefined,
  }))

  // 12-month projection from last known point
  const projPoints = Array.from({ length: 13 }, (_, i) => {
    const d   = new Date(ly, lm - 1 + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const val = project(nwNow, i, annualReturn)
    return { label: shortMonth(key), date: key, actual: i === 0 ? nwNow : undefined, projected: val }
  })

  const chartData = [...actualPoints, ...projPoints.slice(1)]

  return (
    <div className="flex flex-col gap-5">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ top: 4, bottom: 0, left: 0, right: 8 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a8a29e' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={v => fmtINR(v)} tick={{ fontSize: 9, fill: '#a8a29e' }} tickLine={false} axisLine={false} width={55} />
          <Tooltip
            formatter={(v: any, name: any) => [fmtINR(v as number), name === 'actual' ? 'Net Worth' : 'Projected']}
            contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e7e5e4' }} />
          <ReferenceLine x={shortMonth(lastDate)} stroke="#e7e5e4" strokeDasharray="4 2" label={{ value: 'today', fontSize: 9, fill: '#a8a29e' }} />
          <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => v === 'actual' ? 'Net Worth' : 'Projected'} />
          <Line type="monotone" dataKey="actual" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} connectNulls={false} />
          <Line type="monotone" dataKey="projected" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>

      {/* Delta table */}
      <div className="flex flex-col divide-y divide-surface-50">
        <div className="grid grid-cols-4 gap-2 pb-2 text-[9px] uppercase tracking-widest font-semibold text-surface-300">
          <span>Period</span><span className="text-right">Net Worth</span>
          <span className="text-right">Change</span><span className="text-right">vs Start</span>
        </div>
        {snapshots.map((s, i) => {
          const nw      = netWorth(s)
          const prev    = i > 0 ? netWorth(snapshots[i - 1]) : 0
          const delta   = i > 0 ? nw - prev : 0
          const vsFirst = i > 0 ? nw - netWorth(snapshots[0]) : 0
          const isOpen  = expanded === s.id

          return (
            <div key={s.id}>
              <button
                className="w-full grid grid-cols-4 gap-2 py-2.5 text-left hover:bg-surface-50/60 rounded-lg px-1 -mx-1 transition-colors"
                onClick={() => setExpanded(isOpen ? null : s.id)}>
                <span className="text-xs font-semibold text-surface-700 flex items-center gap-1">
                  {isOpen ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
                  {shortMonth(s.date)}
                </span>
                <span className="text-xs font-mono text-right text-surface-800">{fmtINR(nw)}</span>
                <span className={`text-xs font-mono text-right ${delta >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {i === 0 ? '—' : (delta >= 0 ? '+' : '') + fmtINR(delta)}
                </span>
                <span className={`text-xs font-mono text-right ${vsFirst >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {i === 0 ? 'start' : (vsFirst >= 0 ? '+' : '') + fmtINR(vsFirst)}
                </span>
              </button>

              {isOpen && (
                <div className="ml-4 mb-2 pt-2 pb-1 border-t border-surface-50 animate-fade-up">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.entries(s.breakdown ?? {}).filter(([, v]) => (v as number) > 0)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .map(([cls, val]) => (
                        <div key={cls} className="flex items-center justify-between">
                          <span className="text-[11px] text-surface-500">{cls}</span>
                          <span className="text-[11px] font-mono text-surface-700">{fmtINR(val as number)}</span>
                        </div>
                      ))}
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

// ─── Main component ───────────────────────────────────────────────────────────
export default function PortfolioHistory() {
  const { data } = useApp()

  const nwNow = useMemo(() => {
    if (data.holdings.length > 0) {
      const invested  = data.holdings.reduce((a, h) => a + h.value, 0)
      const sorted    = [...data.snapshots].sort((a, b) => a.date.localeCompare(b.date))
      const latest    = sorted.at(-1)
      const cashExtra = latest ? latest.assets.checking + latest.assets.savings + latest.assets.realEstate : 0
      const liab      = latest ? Object.values(latest.liabilities).reduce((a, b) => a + b, 0) : 0
      return invested + cashExtra - liab
    }
    const sorted = [...data.snapshots].sort((a, b) => a.date.localeCompare(b.date))
    return sorted.length ? netWorth(sorted.at(-1)!) : 0
  }, [data])

  // Deduplicate + filter partial snapshots
  const cleanSnapshots = useMemo(() => {
    const deduped = deduplicate(data.snapshots)
    return deduped.filter(isComplete)
  }, [data.snapshots])

  const hasEnoughHistory = cleanSnapshots.length >= 3

  if (nwNow <= 0 && cleanSnapshots.length === 0) return null

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div>
        <p className="section-title">Portfolio Growth</p>
        {hasEnoughHistory && (
          <p className="text-xs text-surface-300 mt-0.5">
            {cleanSnapshots.length} snapshots · {shortMonth(cleanSnapshots[0].date)} → {shortMonth(cleanSnapshots.at(-1)!.date)}
          </p>
        )}
      </div>

      {hasEnoughHistory
        ? <HistoryChart snapshots={cleanSnapshots} nwNow={nwNow} />
        : <GrowthProjectionCard nwNow={nwNow} />
      }
    </div>
  )
}
