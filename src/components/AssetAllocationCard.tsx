import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useApp } from '../context/AppContext'
import { fmtINR, fmtPct } from '../lib/calc'
import EmptyState from './EmptyState'

const ASSET_COLORS: Record<string, string> = {
  'Mutual Funds & Stocks': '#f59e0b',
  'Equity':                '#f59e0b',
  'Mutual Funds':          '#6366f1',
  'EPF / NPS / PPF':       '#10b981',
  'Retirement':            '#10b981',
  'Real Estate':           '#8b5cf6',
  'Cash & Deposits':       '#a8a29e',
  'Cash':                  '#a8a29e',
  'Fixed Income':          '#3b82f6',
  'Gold & Other':          '#f97316',
  'Gold':                  '#f97316',
  'Crypto':                '#ec4899',
  'Other':                 '#d6d3d1',
}

interface AssetClass { name: string; value: number; color: string }

export default function AssetAllocationCard() {
  const { data, addHolding, deleteHolding } = useApp()
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState({ name: '', ticker: '', type: 'etf' as const, value: '', costBasis: '' })

  const latest = data.snapshots.length
    ? [...data.snapshots].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    : null

  const hasHoldings = data.holdings.length > 0

  // Build buckets — holdings are the primary source (specific)
  // Snapshot supplements only assets NOT covered by holdings (cash, real estate)
  const buckets: Record<string, number> = {}

  if (hasHoldings) {
    // Holdings give us the detailed breakdown
    for (const h of data.holdings) {
      const cat =
        h.type === 'stock'      ? 'Direct Equity'     :
        h.type === 'etf'        ? 'Mutual Funds & ETFs':
        h.type === 'bond'       ? 'Fixed Income / Debt':
        h.type === 'retirement' ? 'EPF / NPS / PPF'   :
        h.type === 'crypto'     ? 'Crypto'             :
        h.type === 'cash'       ? 'Cash & Deposits'    : 'Other'
      buckets[cat] = (buckets[cat] ?? 0) + h.value
    }
    // Add cash, real estate from snapshot (NOT in holdings)
    if (latest) {
      if (latest.assets.checking + latest.assets.savings > 0)
        buckets['Cash & Deposits'] = (buckets['Cash & Deposits'] ?? 0) + latest.assets.checking + latest.assets.savings
      if (latest.assets.realEstate > 0)
        buckets['Real Estate'] = (buckets['Real Estate'] ?? 0) + latest.assets.realEstate
    }
  } else if (latest) {
    // No holdings — fall back to snapshot buckets
    const a = latest.assets
    if (a.checking + a.savings > 0) buckets['Cash & Deposits']   = a.checking + a.savings
    if (a.brokerage > 0)            buckets['Mutual Funds & ETFs']= a.brokerage
    if (a.retirement > 0)           buckets['EPF / NPS / PPF']   = a.retirement
    if (a.realEstate > 0)           buckets['Real Estate']        = a.realEstate
    if (a.other > 0)                buckets['Gold & Other']       = a.other
  }

  const classes: AssetClass[] = Object.entries(buckets)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value, color: ASSET_COLORS[name] ?? '#d6d3d1' }))

  const total     = classes.reduce((a, c) => a + c.value, 0)
  const totalCost = data.holdings.reduce((a, h) => a + h.costBasis, 0)
  const gain      = total - totalCost
  const gainPct   = totalCost > 0 ? (gain / totalCost) * 100 : 0

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.value) return
    addHolding({ ...form, value: parseFloat(form.value), costBasis: parseFloat(form.costBasis || form.value) })
    setForm({ name: '', ticker: '', type: 'etf', value: '', costBasis: '' })
  }

  const hasData = classes.length > 0

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="section-title">Asset Allocation</p>
        <button data-expand="portfolio" className="btn-ghost" onClick={() => setExpanded(v => !v)}>
          {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        </button>
      </div>

      {!hasData && !expanded ? (
        <EmptyState
          title="No holdings recorded"
          description="Import your CAMS statement, Zerodha holdings, or EPF passbook to see your complete asset allocation."
          cta="Connect your portfolio"
          onCta={() => setExpanded(true)}
        />
      ) : (
        <>
          <div>
            <p className="kpi-value">{fmtINR(total)}</p>
            {totalCost > 0 && (
              <p className={`text-xs font-medium mt-0.5 ${gain >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                {gain >= 0 ? '+' : ''}{fmtINR(gain)} ({fmtPct(gainPct)}) overall return
              </p>
            )}
          </div>

          {classes.length > 0 && (
            <div className="flex gap-4 items-center">
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={classes} cx="50%" cy="50%" innerRadius={28} outerRadius={44}
                    dataKey="value" paddingAngle={2}>
                    {classes.map(c => <Cell key={c.name} fill={c.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtINR(v as number)} />
                </PieChart>
              </ResponsiveContainer>

              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                {classes.map(c => (
                  <div key={c.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <span className="text-xs text-surface-700 truncate flex-1">{c.name}</span>
                    <span className="text-xs font-semibold text-surface-800 font-mono shrink-0">{fmtINR(c.value)}</span>
                    <span className="text-[10px] text-surface-300 w-8 text-right shrink-0">
                      {total > 0 ? `${((c.value / total) * 100).toFixed(0)}%` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {expanded && (
        <div className="flex flex-col gap-4 pt-3 border-t border-surface-100 animate-fade-up">
          <form onSubmit={submit} className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-surface-300 uppercase tracking-widest">Add Holding</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="input-field" placeholder="Name (e.g. VTSAX)" value={form.name}
                onChange={e => setForm(v => ({ ...v, name: e.target.value }))} />
              <input className="input-field" placeholder="Ticker (optional)" value={form.ticker}
                onChange={e => setForm(v => ({ ...v, ticker: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="input-field" type="number" placeholder="Current value (₹)" value={form.value}
                onChange={e => setForm(v => ({ ...v, value: e.target.value }))} />
              <input className="input-field" type="number" placeholder="Cost basis (₹)" value={form.costBasis}
                onChange={e => setForm(v => ({ ...v, costBasis: e.target.value }))} />
            </div>
            <select className="input-field" value={form.type}
              onChange={e => setForm(v => ({ ...v, type: e.target.value as any }))}>
              {(['stock', 'etf', 'bond', 'retirement', 'crypto', 'cash'] as const).map(t => (
                <option key={t} value={t}>{
                  t === 'stock' ? 'Equity / Direct Stocks' :
                  t === 'etf'   ? 'Mutual Fund / ETF / Index Fund' :
                  t === 'bond'  ? 'Fixed Income / FD / Bond' :
                  t === 'retirement' ? 'EPF / NPS / PPF' :
                  t === 'crypto'? 'Crypto / Digital Assets' : 'Cash / Liquid'
                }</option>
              ))}
            </select>
            <button type="submit" className="btn-primary flex items-center gap-1 justify-center">
              <Plus size={14}/> Add
            </button>
          </form>

          {data.holdings.length > 0 && (
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
              {data.holdings.map(h => (
                <div key={h.id} className="flex justify-between items-center text-xs py-1.5 border-b border-surface-50 group">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-surface-800 truncate">{h.name}</span>
                    {h.ticker && <span className="text-surface-300 font-mono text-[10px] shrink-0">{h.ticker}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <div className="font-medium text-surface-800">{fmtINR(h.value)}</div>
                      <div className={`text-[10px] ${h.value >= h.costBasis ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {fmtPct(((h.value - h.costBasis) / Math.max(h.costBasis, 1)) * 100)}
                      </div>
                    </div>
                    <button onClick={() => deleteHolding(h.id)}
                      className="opacity-0 group-hover:opacity-100 text-surface-300 hover:text-rose-400 transition-all ml-1">
                      <Trash2 size={12}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
