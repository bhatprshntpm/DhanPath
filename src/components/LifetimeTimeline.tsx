import {
  ComposedChart, Line, Bar, ReferenceLine, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, Area, Cell,
} from 'recharts'
import { useApp } from '../context/AppContext'
import { projectLifetime, projectLifetimeNoGoals, netWorth, fmtINR } from '../lib/calc'
import type { ProjectionPoint } from '../lib/calc'

const SCENARIO_COLORS = ['#f59e0b', '#6366f1', '#10b981', '#ef4444', '#8b5cf6', '#ec4899']

interface ChartPoint {
  year: number
  age: number
  real?: number
  netFlow?: number
  goalNames?: string[]
  [key: string]: number | string[] | undefined
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const age       = payload[0]?.payload?.age
  const goalNames = payload[0]?.payload?.goalNames as string[] | undefined
  return (
    <div className="card px-4 py-3 text-sm shadow-lg max-w-xs">
      <p className="font-semibold text-surface-800 mb-1">{label} · Age {age}</p>
      {payload.map((p: any) =>
        p.value != null && Math.abs(p.value) > 0 ? (
          <p key={p.dataKey} style={{ color: p.color ?? '#f59e0b' }} className="flex justify-between gap-6">
            <span>{p.name}</span>
            <span className="font-mono font-medium">{fmtINR(p.value)}</span>
          </p>
        ) : null
      )}
      {goalNames && goalNames.length > 0 && (
        <div className="mt-2 pt-2 border-t border-surface-100">
          {goalNames.map((g) => (
            <p key={g} className={`text-xs font-medium ${g.includes('⚠') ? 'text-rose-500' : 'text-emerald-600'}`}>
              {g.includes('⚠') ? '⚠ shortfall — ' : '✓ funded — '}{g.replace(' ⚠', '')}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-surface-300 gap-3">
      <span className="text-5xl">📈</span>
      <p className="text-sm font-medium text-surface-800">Your financial arc will appear here</p>
      <p className="text-xs text-center max-w-xs">
        Set your income &amp; expenses in the <strong>Baseline scenario</strong> below,
        or add a <strong>Net Worth Snapshot</strong> to seed your starting point.
      </p>
    </div>
  )
}

export default function LifetimeTimeline() {
  const { data } = useApp()
  const { snapshots, scenarios, settings, goals } = data
  const currentYear = new Date().getFullYear()

  const latestNetWorth = snapshots.length
    ? netWorth(snapshots[snapshots.length - 1])
    : 0

  const realPoints: Record<number, number> = {}
  snapshots.forEach(s => {
    const yr = parseInt(s.date.slice(0, 4))
    realPoints[yr] = netWorth(s)
  })

  const enabledScenarios = scenarios.filter(s => s.enabled)

  const allProjections: Record<string, ProjectionPoint[]>       = {}
  const allProjectionsNG: Record<string, ProjectionPoint[]>     = {}
  enabledScenarios.forEach(s => {
    allProjections[s.id]   = projectLifetime(latestNetWorth, settings, s, goals)
    allProjectionsNG[s.id] = projectLifetimeNoGoals(latestNetWorth, settings, s)
  })

  const endYear   = currentYear + (settings.lifeExpectancy - settings.currentAge)
  const startYear = snapshots.length
    ? Math.min(...snapshots.map(s => parseInt(s.date.slice(0, 4))))
    : currentYear

  const years: number[] = []
  for (let y = startYear; y <= endYear; y++) years.push(y)

  const baseline    = enabledScenarios[0]
  const baselineNG  = baseline ? allProjectionsNG[baseline.id] ?? [] : []
  const maxNG       = Math.max(...baselineNG.map(p => p.value), 1)
  const hasData     = maxNG > 1000

  const chartData: ChartPoint[] = years.map(year => {
    const point: ChartPoint = {
      year,
      age: settings.currentAge + (year - currentYear),
    }
    if (realPoints[year] !== undefined) point.real = realPoints[year]

    const bp = baseline ? allProjections[baseline.id]?.find(p => p.year === year) : null
    if (bp && year >= currentYear) {
      point.netFlow    = bp.netFlow
      point.goalNames  = bp.goalNames
    }

    enabledScenarios.forEach((s, _i) => {
      const proj   = allProjections[s.id]?.find(p => p.year === year)
      const projNG = allProjectionsNG[s.id]?.find(p => p.year === year)
      if (year >= currentYear) {
        if (proj)   point[s.id]         = proj.value
        if (projNG) point[`${s.id}_ng`] = projNG.value
      }
    })
    return point
  })

  const retireYear = currentYear + (settings.retirementAge - settings.currentAge)

  const goalDots = goals.filter(g => g.enabled).map(g => {
    const yr = currentYear + (g.targetAge - settings.currentAge)
    return { year: yr, g }
  }).filter(d => d.year > currentYear && d.year <= endYear)

  if (!hasData && snapshots.length === 0) {
    return (
      <div className="card p-6">
        <p className="section-title">Lifetime Financial Arc</p>
        <EmptyState />
      </div>
    )
  }

  return (
    <div className="card p-3 sm:p-6 flex flex-col gap-2">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div>
          <p className="section-title">Lifetime Financial Arc</p>
          <p className="text-xs text-surface-300">
            Actual (filled) · Potential trajectory (solid) · Goal-adjusted (dashed) · Age {settings.currentAge} → {settings.lifeExpectancy}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {enabledScenarios.map((s, i) => (
            <span key={s.id} className="flex items-center gap-1.5 text-xs font-medium text-surface-800">
              <span className="w-4 h-0.5 rounded-full" style={{ backgroundColor: SCENARIO_COLORS[i % SCENARIO_COLORS.length] }}/>
              {s.name}
            </span>
          ))}
        </div>
      </div>

      {/* Wealth chart */}
      <ResponsiveContainer width="100%" height={240} minHeight={180}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#a8a29e' }} tickLine={false} axisLine={false}
            interval={Math.floor(years.length / 8)} />
          <YAxis
            tickFormatter={v => v >= 1e7 ? `₹${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(0)}L` : `₹${(v / 1e3).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: '#a8a29e' }} tickLine={false} axisLine={false} width={64}
          />
          <Tooltip content={<CustomTooltip />} />

          <ReferenceLine x={currentYear} stroke="#d6d3d1" strokeDasharray="4 4"
            label={{ value: 'Today', position: 'insideTopLeft', fontSize: 10, fill: '#a8a29e' }} />
          <ReferenceLine x={retireYear} stroke="#f59e0b" strokeDasharray="4 4"
            label={{ value: '🔥', position: 'insideTopLeft', fontSize: 14 }} />

          {/* actual historical data */}
          <Area dataKey="real" name="Actual" fill="#fef3c7" stroke="#f59e0b"
            strokeWidth={2.5} dot={false} connectNulls />

          {/* per-scenario: no-goals line (solid, full potential) + goal-adjusted (dashed, impact) */}
          {enabledScenarios.map((s, i) => (
            <>
              <Line key={`${s.id}_ng`} dataKey={`${s.id}_ng`} name={`${s.name} (potential)`}
                stroke={SCENARIO_COLORS[i % SCENARIO_COLORS.length]}
                strokeWidth={i === 0 ? 2 : 1.5} strokeOpacity={0.35}
                dot={false} connectNulls legendType="none" />
              <Line key={s.id} dataKey={s.id} name={s.name}
                stroke={SCENARIO_COLORS[i % SCENARIO_COLORS.length]}
                strokeWidth={i === 0 ? 2.5 : 1.5}
                strokeDasharray="6 3"
                dot={false} connectNulls />
            </>
          ))}

          {/* goal event dots on the no-goals trajectory */}
          {goalDots.map(({ year: yr, g }) => (
            <ReferenceLine key={g.id} x={yr} stroke="transparent"
              label={{ value: g.emoji, position: 'insideTop', fontSize: 16, offset: -4 }} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Goal legend row */}
      {goalDots.length > 0 && (
        <div className="flex flex-wrap gap-3 px-1 -mt-1">
          {goalDots.map(({ g, year: yr }) => {
            const yrs = yr - currentYear
            const inf = g.inflate
              ? g.amountToday * Math.pow(1 + settings.inflationRate / 100, Math.max(yrs, 0))
              : g.amountToday
            return (
              <span key={g.id} className="flex items-center gap-1 text-xs text-surface-300">
                <span>{g.emoji}</span>
                <span className="font-medium text-surface-800">{g.name}</span>
                <span>Age {g.targetAge} · {fmtINR(Math.round(inf))}</span>
              </span>
            )
          })}
        </div>
      )}

      {/* Cash flow sub-chart */}
      <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mt-3">
        Monthly Cash Flow (Baseline)
      </p>
      <ResponsiveContainer width="100%" height={80} minHeight={60}>
        <ComposedChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#a8a29e' }} tickLine={false} axisLine={false}
            interval={Math.floor(years.length / 8)} />
          <YAxis
            tickFormatter={v => v >= 1e5 ? `₹${(v / 1e5).toFixed(0)}L` : `₹${(v / 1e3).toFixed(0)}k`}
            tick={{ fontSize: 10, fill: '#a8a29e' }} tickLine={false} axisLine={false} width={64}
          />
          <Tooltip formatter={(v: any) => [fmtINR(v as number), 'Monthly net']} labelFormatter={(l: any) => `Year ${l}`} />
          <ReferenceLine y={0} stroke="#e7e5e4" />
          <Bar dataKey="netFlow" name="Monthly net" radius={[2, 2, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={((entry.netFlow as number) ?? 0) >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.75} />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
