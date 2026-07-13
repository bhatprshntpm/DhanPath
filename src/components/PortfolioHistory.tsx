import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts'
import { ChevronDown, ChevronRight, TrendingUp } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmtINR, totalAssets, totalLiabilities } from '../lib/calc'

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function shortMonth(yyyyMM: string) {
  const [y, m] = yyyyMM.split('-')
  return `${MONTH_NAMES[parseInt(m) - 1]} '${y.slice(2)}`
}

// Deduplicate: for same month keep highest total assets snapshot
function deduplicate(snapshots: any[]): any[] {
  const map = new Map<string, any>()
  for (const s of snapshots) {
    const existing = map.get(s.date)
    if (!existing || totalAssets(s) > totalAssets(existing)) map.set(s.date, s)
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}

// A snapshot has real equity data (not EPF-only)
function hasEquity(s: any): boolean {
  return s.assets.brokerage > 0 || s.assets.other > 0
}

// Forward-fill ALL asset types — any field that was non-zero in a previous
// import is carried forward until a newer import overrides it.
// This means crypto, RSU, real estate, cash all persist across months
// even if only EPF was imported that month.
function applyCarryForward(snapshots: any[]): { s: any; carried: boolean; adjustedNw: number }[] {
  let last = { brokerage: 0, other: 0, checking: 0, savings: 0, realEstate: 0 }

  return snapshots.map(s => {
    const a = s.assets
    const filled = {
      brokerage:  a.brokerage  > 0 ? a.brokerage  : last.brokerage,
      other:      a.other      > 0 ? a.other       : last.other,
      checking:   a.checking   > 0 ? a.checking    : last.checking,
      savings:    a.savings    > 0 ? a.savings     : last.savings,
      realEstate: a.realEstate > 0 ? a.realEstate  : last.realEstate,
    }

    // Update last known values
    if (a.brokerage  > 0) last.brokerage  = a.brokerage
    if (a.other      > 0) last.other      = a.other
    if (a.checking   > 0) last.checking   = a.checking
    if (a.savings    > 0) last.savings    = a.savings
    if (a.realEstate > 0) last.realEstate = a.realEstate

    const carried = (a.brokerage === 0 && last.brokerage > 0)
                 || (a.other     === 0 && last.other     > 0)
                 || (a.checking  === 0 && last.checking  > 0)

    const adjustedNw =
      filled.brokerage + filled.other + filled.checking +
      filled.savings   + filled.realEstate + a.retirement
      - totalLiabilities(s)

    return { s, carried, adjustedNw }
  })
}

function project(base: number, months: number, annualReturn = 12) {
  return Math.round(base * Math.pow(1 + annualReturn / 100, months / 12))
}

// ─── Projection card shown before enough history ──────────────────────────────
function GrowthProjectionCard({ nwNow, annualReturn }: { nwNow: number; annualReturn: number }) {
  if (nwNow <= 0) return null

  const milestones = [
    { label: '1 Year',   value: project(nwNow, 12,  annualReturn) },
    { label: '3 Years',  value: project(nwNow, 36,  annualReturn) },
    { label: '5 Years',  value: project(nwNow, 60,  annualReturn) },
    { label: '10 Years', value: project(nwNow, 120, annualReturn) },
  ]

  const curveData = [0, 3, 6, 9, 12, 18, 24, 30, 36, 42, 48, 54, 60].map(m => ({
    label: m === 0 ? 'Now' : m < 12 ? `+${m}m` : `+${m / 12}yr`,
    value: project(nwNow, m, annualReturn),
  }))

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-surface-400">
        Based on <span className="font-semibold text-surface-700">{fmtINR(nwNow)}</span> at {annualReturn}% annual return.
        Refresh prices monthly to build your history chart. Set a start date in the Zerodha import to go further back.
      </p>

      <div className="grid grid-cols-4 gap-3">
        {milestones.map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center p-3 bg-surface-50 rounded-xl border border-surface-100">
            <p className="text-[10px] text-surface-400 uppercase tracking-widest mb-1">{label}</p>
            <p className="text-sm font-bold text-surface-800">{fmtINR(value)}</p>
            <p className="text-[10px] text-emerald-600 font-medium mt-0.5">+{fmtINR(value - nwNow)}</p>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={curveData} margin={{ top: 4, bottom: 0, left: 0, right: 8 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#a8a29e' }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={v => fmtINR(v)} tick={{ fontSize: 9, fill: '#a8a29e' }} tickLine={false} axisLine={false} width={52} />
          <Tooltip formatter={(v: any) => [fmtINR(v as number), 'Projected']} contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e7e5e4' }} />
          <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={false} />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-surface-300 text-center">
        Re-import Zerodha / EPF each month to build your actual history
      </p>
    </div>
  )
}

// ─── Full history chart ───────────────────────────────────────────────────────
function HistoryChart({ rows, nwNow, annualReturn }: {
  rows: ReturnType<typeof applyCarryForward>
  nwNow: number
  annualReturn: number
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const lastRow   = rows.at(-1)
  const lastDate  = lastRow?.s.date ?? ''
  const [ly, lm]  = lastDate.split('-').map(Number)

  // Actual points
  const actualPoints = rows.map(({ s, adjustedNw }) => ({
    label:     shortMonth(s.date),
    date:      s.date,
    actual:    adjustedNw,
    projected: undefined as number | undefined,
  }))

  // 12-month projection from today's live net worth
  const projPoints = Array.from({ length: 13 }, (_, i) => {
    const d   = new Date(ly, lm - 1 + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return {
      label:     shortMonth(key),
      date:      key,
      actual:    i === 0 ? nwNow : undefined,
      projected: project(nwNow, i, annualReturn),
    }
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
          <ReferenceLine x={shortMonth(lastDate)} stroke="#e7e5e4" strokeDasharray="4 2"
            label={{ value: 'today', fontSize: 9, fill: '#a8a29e', position: 'insideTopRight' }} />
          <Legend wrapperStyle={{ fontSize: 10 }} formatter={v => v === 'actual' ? 'Net Worth' : 'Projected'} />
          <Line type="monotone" dataKey="actual"    stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} connectNulls={false} />
          <Line type="monotone" dataKey="projected" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="6 3" dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>

      {/* Snapshot delta table */}
      <div className="flex flex-col divide-y divide-surface-50">
        <div className="grid grid-cols-4 gap-2 pb-2 text-[9px] uppercase tracking-widest font-semibold text-surface-300">
          <span>Period</span>
          <span className="text-right">Net Worth</span>
          <span className="text-right">Change</span>
          <span className="text-right">vs Start</span>
        </div>

        {rows.map(({ s, carried, adjustedNw }, i) => {
          const prev    = i > 0 ? rows[i - 1].adjustedNw : 0
          const delta   = i > 0 ? adjustedNw - prev : 0
          const vsFirst = i > 0 ? adjustedNw - rows[0].adjustedNw : 0
          const isOpen  = expanded === s.id

          return (
            <div key={s.id}>
              <button
                className="w-full grid grid-cols-4 gap-2 py-2.5 text-left hover:bg-surface-50/60 rounded-lg px-1 -mx-1 transition-colors"
                onClick={() => setExpanded(isOpen ? null : s.id)}>
                <span className="text-xs font-semibold text-surface-700 flex items-center gap-1">
                  {isOpen ? <ChevronDown size={11}/> : <ChevronRight size={11}/>}
                  {shortMonth(s.date)}
                  {carried && <span className="text-[9px] text-surface-300 font-normal">est.</span>}
                </span>
                <span className="text-xs font-mono text-right text-surface-800">{fmtINR(adjustedNw)}</span>
                <span className={`text-xs font-mono text-right ${delta >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {i === 0 ? '—' : (delta >= 0 ? '+' : '') + fmtINR(delta)}
                </span>
                <span className={`text-xs font-mono text-right ${vsFirst >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {i === 0 ? 'start' : (vsFirst >= 0 ? '+' : '') + fmtINR(vsFirst)}
                </span>
              </button>

              {isOpen && (
                <div className="ml-4 mb-2 pt-2 border-t border-surface-50 animate-fade-up">
                  {carried && (
                    <p className="text-[10px] text-amber-600 mb-1.5">
                      Equity carried from last import · re-import Zerodha for exact value
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.entries(s.breakdown ?? {})
                      .filter(([, v]) => (v as number) > 0)
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

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PortfolioHistory() {
  const { data } = useApp()
  const annualReturn = data.scenarios[0]?.assumptions?.annualReturn ?? 12

  // Live net worth from holdings
  const nwNow = useMemo(() => {
    const sorted = [...data.snapshots].sort((a, b) => a.date.localeCompare(b.date))
    const latest = sorted.at(-1)
    if (data.holdings.length > 0) {
      const invested  = data.holdings.reduce((a, h) => a + h.value, 0)
      const cashExtra = latest ? latest.assets.checking + latest.assets.savings + latest.assets.realEstate : 0
      const liab      = latest ? totalLiabilities(latest) : 0
      return invested + cashExtra - liab
    }
    return latest ? (totalAssets(latest) - totalLiabilities(latest)) : 0
  }, [data])

  // Deduped snapshots with carry-forward applied
  const rows = useMemo(() => {
    const deduped = deduplicate(data.snapshots)
    return applyCarryForward(deduped)
  }, [data.snapshots])

  // Need at least 2 months with real equity to show history
  const equityMonths = rows.filter(r => hasEquity(r.s) || r.carried).length
  const hasHistory   = equityMonths >= 2 && rows.length >= 2

  if (nwNow <= 0 && rows.length === 0) return null

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <TrendingUp size={15} className="text-amber-500" />
        <div>
          <p className="section-title">Portfolio Growth</p>
          {hasHistory && (
            <p className="text-xs text-surface-300 mt-0.5">
              {rows.length} months · {shortMonth(rows[0].s.date)} → {shortMonth(rows.at(-1)!.s.date)}
            </p>
          )}
        </div>
      </div>

      {hasHistory
        ? <HistoryChart rows={rows} nwNow={nwNow} annualReturn={annualReturn} />
        : <GrowthProjectionCard nwNow={nwNow} annualReturn={annualReturn} />
      }
    </div>
  )
}
