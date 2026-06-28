import { useState, useMemo } from 'react'
import {
  ComposedChart, Line, Area, Bar, Cell,
  ReferenceLine, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { ChevronDown, ChevronRight, RotateCcw, Zap } from 'lucide-react'
import { useApp } from '../context/AppContext'
import {
  projectLifetime, fireNumber,
  fmtINR, totalAssets, totalLiabilities,
} from '../lib/calc'

// ─── helpers ─────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function shortMonth(yyyyMM: string) {
  const [y, m] = yyyyMM.split('-')
  return `${MONTH_NAMES[parseInt(m) - 1]} '${y.slice(2)}`
}
function fmtAxis(v: number) {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(0)}Cr`
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(0)}L`
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(0)}k`
  return `₹${v}`
}

type ViewMode = '5yr' | '10yr' | 'lifetime'

function deduplicate(snapshots: any[]) {
  const map = new Map<string, any>()
  for (const s of snapshots) {
    const existing = map.get(s.date)
    if (!existing || totalAssets(s) > totalAssets(existing)) map.set(s.date, s)
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function applyCarryForward(snapshots: any[]) {
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
    if (a.brokerage  > 0) last.brokerage  = a.brokerage
    if (a.other      > 0) last.other      = a.other
    if (a.checking   > 0) last.checking   = a.checking
    if (a.savings    > 0) last.savings    = a.savings
    if (a.realEstate > 0) last.realEstate = a.realEstate
    const carried = (a.brokerage === 0 && last.brokerage > 0) || (a.other === 0 && last.other > 0)
    const adjustedNw =
      filled.brokerage + filled.other + filled.checking +
      filled.savings + filled.realEstate + a.retirement - totalLiabilities(s)
    return { s, carried, adjustedNw }
  })
}


// ─── tooltip ─────────────────────────────────────────────────────────────────
function ArcTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  const age       = payload[0]?.payload?.age
  const goalNames = payload[0]?.payload?.goalNames as string[] | undefined
  return (
    <div className="card px-4 py-3 text-sm shadow-lg max-w-xs">
      <p className="font-semibold text-surface-800 mb-1">{label}{age != null ? ` · Age ${age}` : ''}</p>
      {payload.map((p: any) => p.value != null && Math.abs(p.value) > 0 ? (
        <p key={p.dataKey} className="flex justify-between gap-6" style={{ color: p.color ?? '#f59e0b' }}>
          <span>{p.name}</span>
          <span className="font-mono font-medium">{fmtINR(p.value)}</span>
        </p>
      ) : null)}
      {goalNames?.length ? (
        <div className="mt-2 pt-2 border-t border-surface-100">
          {goalNames.map((g: string) => (
            <p key={g} className={`text-xs font-medium ${g.includes('⚠') ? 'text-rose-500' : 'text-emerald-600'}`}>
              {g.includes('⚠') ? '⚠ shortfall — ' : '✓ funded — '}{g.replace(' ⚠', '')}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ─── snapshot delta table ────────────────────────────────────────────────────
function SnapshotTable({ rows }: { rows: ReturnType<typeof applyCarryForward> }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  if (rows.length < 2) return null
  return (
    <div className="flex flex-col divide-y divide-surface-50 mt-2">
      <div className="grid grid-cols-4 gap-2 pb-2 text-[9px] uppercase tracking-widest font-semibold text-surface-300">
        <span>Period</span><span className="text-right">Net Worth</span>
        <span className="text-right">Change</span><span className="text-right">vs Start</span>
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
                {carried && <p className="text-[10px] text-amber-600 mb-1.5">Some assets carried from last import — re-import for exact values</p>}
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
  )
}

// ─── compact slider ──────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step, prefix, suffix, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  prefix?: string; suffix?: string
  onChange: (v: number) => void
}) {
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-surface-500 font-medium">{label}</span>
        <span className="text-[11px] font-semibold font-mono text-emerald-600">
          {prefix ?? ''}{typeof value === 'number' && value % 1 !== 0 ? value.toFixed(1) : value.toLocaleString('en-IN')}{suffix ?? ''}
        </span>
      </div>
      <div className="relative h-4 flex items-center">
        <div className="absolute inset-x-0 h-1 rounded-full bg-surface-100" />
        <div className="absolute left-0 h-1 rounded-full pointer-events-none" style={{ width: `${fill}%`, background: '#10b981' }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-4" style={{ zIndex: 1 }} />
        <div className="absolute w-3.5 h-3.5 rounded-full bg-white border-2 pointer-events-none"
          style={{ left: `calc(${fill}% - 7px)`, borderColor: '#10b981' }} />
      </div>
    </div>
  )
}

// ─── fire year from projection ────────────────────────────────────────────────
function fireYearFromProj(proj: { year: number; value: number }[], target: number) {
  return proj.find(p => p.value >= target)?.year ?? null
}

// ─── main ────────────────────────────────────────────────────────────────────
export default function FinancialArc() {
  const { data } = useApp()
  const { snapshots, scenarios, settings, goals } = data
  const [view,      setView]      = useState<ViewMode>('10yr')
  const [showTable, setShowTable] = useState(false)

  const currentYear  = new Date().getFullYear()
  const baseline     = scenarios.find(s => s.enabled && s.id === 'baseline') ?? scenarios.find(s => s.enabled)
  const baseAssump   = baseline?.assumptions

  // What-if: extra SIP on top of existing
  const [extraSip,   setExtraSip]   = useState(5000)
  const [wiActive,   setWiActive]   = useState(false)

  function resetWhatIf() { setExtraSip(5000); setWiActive(false) }

  // Current levers derived from settings
  const cur = {
    monthlySavings: settings.existingSIP > 0 ? settings.existingSIP : (baseAssump?.extraMonthlySavings ?? 0),
    returnRate:     baseAssump?.annualReturn ?? 12,
    expenses:       settings.monthlyExpenses ?? 60000,
  }

  // Live net worth from holdings (matches hero section)
  const nwNow = useMemo(() => {
    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
    const latest = sorted.at(-1)
    if (data.holdings.length > 0) {
      const invested  = data.holdings.reduce((a, h) => a + h.value, 0)
      const cashExtra = latest ? latest.assets.checking + latest.assets.savings + latest.assets.realEstate : 0
      const liab      = latest ? totalLiabilities(latest) : 0
      return invested + cashExtra - liab
    }
    return latest ? totalAssets(latest) - totalLiabilities(latest) : 0
  }, [data])

  const rows = useMemo(() => applyCarryForward(deduplicate(snapshots)), [snapshots])

  // Build scenario objects from levers
  function makeScenario(levers: typeof cur) {
    if (!baseline) return null
    return {
      ...baseline,
      assumptions: {
        ...baseline.assumptions,
        extraMonthlySavings: levers.monthlySavings,
        annualReturn:        levers.returnRate,
        equityReturn:        levers.returnRate,
        // EMI reduces investable surplus — treated as a fixed expense
        monthlyExpenses:     levers.expenses + settings.monthlyEMI,
      },
    }
  }

  const curScenario = makeScenario(cur)
  const wiLevers = { ...cur, monthlySavings: cur.monthlySavings + extraSip }
  const wiScenario  = wiActive ? makeScenario(wiLevers) : null

  const projCur = curScenario ? projectLifetime(nwNow, settings, curScenario, goals) : []
  const projWi  = wiScenario  ? projectLifetime(nwNow, settings, wiScenario,  goals) : []

  const fireCur    = cur.expenses > 0 ? fireNumber(cur.expenses, settings.safeWithdrawalRate) : 0
  const fireYearCur = fireYearFromProj(projCur, fireCur)
  const fireYearWi  = projWi.length > 0 ? fireYearFromProj(projWi, fireCur) : null
  const fireAgeCur  = fireYearCur ? settings.currentAge + (fireYearCur - currentYear) : null
  const fireAgeWi   = fireYearWi  ? settings.currentAge + (fireYearWi  - currentYear) : null
  const yearsDelta  = (fireYearCur && fireYearWi) ? fireYearCur - fireYearWi : null

  const currentMonth = new Date().toISOString().slice(0, 7)
  const pastRows     = useMemo(() => rows.filter(r => r.s.date <= currentMonth), [rows, currentMonth])
  const startYear    = pastRows.length ? parseInt(pastRows[0].s.date.slice(0, 4)) : currentYear
  const endYear      = currentYear + (settings.lifeExpectancy - settings.currentAge)
  const retireYear   = currentYear + (settings.retirementAge  - settings.currentAge)

  const windowEnd   = view === '5yr' ? currentYear + 5 : view === '10yr' ? currentYear + 10 : endYear
  const windowStart = Math.min(startYear, currentYear - 1)

  const allChartData = useMemo(() => {
    const yearMap = new Map<number, any>()
    for (let y = startYear; y <= endYear; y++) {
      yearMap.set(y, { year: y, age: settings.currentAge + (y - currentYear) })
    }
    rows.forEach(({ adjustedNw, s }) => {
      if (s.date > currentMonth) return
      const yr = parseInt(s.date.slice(0, 4))
      const pt = yearMap.get(yr)
      if (pt && (pt.actual == null || adjustedNw > pt.actual)) pt.actual = adjustedNw
    })
    const curPt = yearMap.get(currentYear)
    if (curPt && nwNow > 0) curPt.actual = nwNow

    projCur.forEach(p => {
      const pt = yearMap.get(p.year)
      if (pt && p.year >= currentYear) {
        pt.current = p.value
        if (p.phase === 'accumulation' || p.year === retireYear) pt.accumulation = p.value
        if (p.phase === 'drawdown'     || p.year === retireYear) pt.drawdown     = p.value
      }
    })
    projWi.forEach(p => {
      const pt = yearMap.get(p.year)
      if (pt && p.year >= currentYear) pt.whatif = p.value
    })
    return Array.from(yearMap.values()).sort((a, b) => a.year - b.year)
  }, [rows, projCur, projWi, startYear, endYear, currentYear, currentMonth, settings, nwNow, retireYear])

  const chartData = allChartData.filter(d => d.year >= windowStart && d.year <= windowEnd)

  const goalDots = goals.filter(g => g.enabled).map(g => ({
    year: currentYear + (g.targetAge - settings.currentAge), g,
  })).filter(d => d.year > currentYear && d.year <= windowEnd)

  const hasHistory    = rows.length >= 2
  const hasProjection = projCur.length > 0 && nwNow > 0
  const isEmpty       = !hasHistory && !hasProjection

  if (isEmpty) return (
    <div className="card p-6 flex flex-col items-center justify-center h-48 gap-3">
      <span className="text-4xl">📈</span>
      <p className="text-sm font-medium text-surface-700">Your financial arc will appear here</p>
      <p className="text-xs text-surface-400 text-center max-w-xs">Import data or set income in Scenarios to see projections.</p>
    </div>
  )

  const visibleValues = chartData.flatMap(d =>
    [d.actual, d.current, d.potential, d.whatif].filter((v): v is number => v != null && v > 0)
  )
  const yMin = visibleValues.length ? Math.floor(Math.min(...visibleValues) * 0.85) : 0
  const yMax = visibleValues.length ? Math.ceil(Math.max(...visibleValues) * 1.1)  : undefined
  const yDomain: [number | string, number | string] = view === 'lifetime' ? [0, 'auto'] : [yMin, yMax ?? 'auto']

  const wiDiffers = wiActive && extraSip > 0

  return (
    <div className="card p-5 flex flex-col gap-4">
      {/* Header + view toggle */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="section-title">Financial Arc</p>
          <p className="text-xs text-surface-300 mt-0.5">
            {fmtINR(nwNow)} today
            {fireAgeCur && <span> · FIRE age <span className="text-amber-600 font-semibold">{fireAgeCur}</span></span>}
            {wiDiffers && fireAgeWi && yearsDelta !== null && (
              <span className={`ml-2 font-semibold ${yearsDelta > 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                → what-if age {fireAgeWi} ({yearsDelta > 0 ? `${yearsDelta} yrs earlier` : `${Math.abs(yearsDelta)} yrs later`})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center bg-surface-100 rounded-lg p-0.5 gap-0.5">
          {(['5yr', '10yr', 'lifetime'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors
                ${view === v ? 'bg-white text-surface-800 shadow-sm' : 'text-surface-400 hover:text-surface-600'}`}>
              {v === 'lifetime' ? 'Lifetime' : v}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradAccumulation" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="gradDrawdown" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f4" vertical={false} />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#a8a29e' }} tickLine={false} axisLine={false}
            interval={Math.max(0, Math.floor(chartData.length / 7))} />
          <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: '#a8a29e' }} tickLine={false} axisLine={false}
            width={62} domain={yDomain} />
          <Tooltip content={<ArcTooltip />} />
          <ReferenceLine x={currentYear} stroke="#d6d3d1" strokeDasharray="4 4"
            label={{ value: 'Today', position: 'insideTopLeft', fontSize: 10, fill: '#a8a29e' }} />
          {retireYear <= windowEnd && (
            <ReferenceLine x={retireYear} stroke="#f59e0b" strokeDasharray="4 4"
              label={{ value: '🔥', position: 'insideTopLeft', fontSize: 14 }} />
          )}
          {goalDots.map(({ year: yr, g }) => (
            <ReferenceLine key={g.id} x={yr} stroke="transparent"
              label={{ value: g.emoji, position: 'insideTop', fontSize: 16, offset: -4 }} />
          ))}
          {/* Actual history — amber */}
          <Area dataKey="actual" name="Actual" fill="url(#gradActual)" stroke="#f59e0b" strokeWidth={2.5} dot={false} connectNulls />
          {/* Accumulation phase — green */}
          <Area dataKey="accumulation" name="Accumulation" fill="url(#gradAccumulation)" stroke="#10b981" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls legendType="none" />
          {/* Drawdown phase — amber */}
          <Area dataKey="drawdown" name="Drawdown" fill="url(#gradDrawdown)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls legendType="none" />
          {wiDiffers && <Line dataKey="whatif" name="What-if" stroke="#6366f1" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls />}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Phase legend */}
      {projCur.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs text-surface-500">
            <span className="w-3 h-1 rounded-full inline-block" style={{ background: '#10b981' }} />
            Accumulation (building wealth)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-surface-500">
            <span className="w-3 h-1 rounded-full inline-block" style={{ background: '#f59e0b' }} />
            Drawdown (spending in retirement)
          </span>
          {wiDiffers && (
            <span className="flex items-center gap-1.5 text-xs text-surface-500">
              <span className="w-3 h-1 rounded-full inline-block" style={{ background: '#6366f1' }} />
              What-if scenario
            </span>
          )}
        </div>
      )}

      {/* What-if SIP lever */}
      <div className="pt-3 border-t border-surface-100">
        <div className="flex flex-col gap-3 p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={13} className="text-emerald-600" />
              <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-widest">What if I invest more?</span>
            </div>
            {wiDiffers && (
              <button onClick={resetWhatIf} className="text-[10px] text-surface-400 hover:text-surface-600 flex items-center gap-0.5">
                <RotateCcw size={9} /> Reset
              </button>
            )}
          </div>
          <p className="text-[11px] text-emerald-700 italic">
            I invest an extra{' '}
            <span className="font-bold not-italic">{extraSip > 0 ? `₹${extraSip.toLocaleString('en-IN')}/mo` : '₹0'}</span>
            {' '}on top of my current SIP
          </p>
          <Slider label="" value={extraSip} min={0} max={100000} step={1000}
            prefix="₹" onChange={v => { setExtraSip(v); setWiActive(v > 0) }} />
          {wiDiffers && yearsDelta !== null && (
            <div className={`flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-semibold
              ${yearsDelta > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>
              {yearsDelta > 0
                ? `↑ Retire ${yearsDelta} year${yearsDelta !== 1 ? 's' : ''} earlier — FIRE at age ${fireAgeWi}`
                : `↓ Retire ${Math.abs(yearsDelta)} year${Math.abs(yearsDelta) !== 1 ? 's' : ''} later — FIRE at age ${fireAgeWi}`}
            </div>
          )}
          {wiDiffers && yearsDelta === null && fireAgeWi && (
            <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-700">
              FIRE at age {fireAgeWi}
            </div>
          )}
        </div>
      </div>

      {/* Cash flow — lifetime only */}
      {view === 'lifetime' && chartData.some(d => d.netFlow) && (
        <>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300">Monthly Cash Flow</p>
          <ResponsiveContainer width="100%" height={70}>
            <ComposedChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="year" tick={{ fontSize: 9, fill: '#a8a29e' }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(chartData.length / 7))} />
              <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 9, fill: '#a8a29e' }} tickLine={false} axisLine={false} width={58} />
              <Tooltip formatter={(v: any) => [fmtINR(v), 'Monthly net']} labelFormatter={(l: any) => `Year ${l}`} />
              <ReferenceLine y={0} stroke="#e7e5e4" />
              <Bar dataKey="netFlow" name="Monthly net" radius={[2,2,0,0]}>
                {chartData.map((d, i) => <Cell key={i} fill={((d.netFlow as number) ?? 0) >= 0 ? '#10b981' : '#ef4444'} fillOpacity={0.75} />)}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}

      {/* Goal legend */}
      {goalDots.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {goalDots.map(({ g, year: yr }) => {
            const yrs = yr - currentYear
            const inf = g.inflate ? g.amountToday * Math.pow(1 + settings.inflationRate / 100, Math.max(yrs, 0)) : g.amountToday
            return (
              <span key={g.id} className="flex items-center gap-1 text-xs text-surface-400">
                <span>{g.emoji}</span><span className="font-medium text-surface-700">{g.name}</span>
                <span>Age {g.targetAge} · {fmtINR(Math.round(inf))}</span>
              </span>
            )
          })}
        </div>
      )}

      {/* Month-by-month table */}
      {rows.length >= 2 && (
        <div className="border-t border-surface-100 pt-3">
          <button onClick={() => setShowTable(v => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-surface-400 hover:text-surface-700 transition-colors">
            {showTable ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
            Month-by-month history ({pastRows.length} months recorded)
          </button>
          {showTable && <SnapshotTable rows={rows} />}
        </div>
      )}
    </div>
  )
}
