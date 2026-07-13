import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2, RefreshCw, AlertTriangle, Settings2 } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useApp } from '../context/AppContext'
import { fmtINR, fmtPct } from '../lib/calc'
import { refreshAllPrices } from '../lib/livePrice'
import EmptyState from './EmptyState'
import type { Holding } from '../types'

const ASSET_COLORS: Record<string, string> = {
  'Equity':         '#f59e0b',
  'Debt':           '#3b82f6',
  'Gold':           '#f97316',
  'International':  '#8b5cf6',
  'Cryptocurrency': '#ec4899',
  'Real Estate':    '#10b981',
  'Cash & Savings': '#a8a29e',
  'EPF / NPS / PPF':'#6366f1',
  'Other':          '#d6d3d1',
}

const ALL_CLASSES = ['Equity', 'Debt', 'Gold', 'International', 'Cryptocurrency', 'Real Estate', 'Cash & Savings'] as const

// Hints shown in empty state — used via CLASS_HINTS[name] when value === 0
export const CLASS_HINTS: Record<string, string> = {
  'Equity':         'Stocks, mutual funds, ETFs — import Zerodha XLSX to populate',
  'Debt':           'G-Secs, debt mutual funds, bonds — import Zerodha or add manually',
  'Gold':           'Physical gold, Gold ETF, SGBs — add via portfolio or net worth',
  'International':  'US stocks, RSUs, international funds — add Fidelity or manual',
  'Cryptocurrency': 'BTC, ETH and other crypto — add manually',
  'Real Estate':    'Property value — add via Net Worth snapshot',
  'Cash & Savings': 'Savings & current accounts — add via Net Worth snapshot',
}

function holdingClass(h: Holding): string {
  if (h.type === 'retirement') return 'EPF / NPS / PPF'   // always override — retirement is locked regardless of scheme
  if (h.assetClass) return h.assetClass
  if (h.type === 'stock')      return 'Equity'
  if (h.type === 'etf')        return 'Equity'
  if (h.type === 'bond')       return 'Debt'
  if (h.type === 'crypto')     return 'Cryptocurrency'
  if (h.type === 'cash')       return 'Cash & Savings'
  return 'Other'
}

function holdingSubType(h: Holding): string {
  if (h.subType) return h.subType
  if (h.type === 'stock')      return 'Direct Stock'
  if (h.type === 'etf')        return 'Mutual Fund / ETF'
  if (h.type === 'bond')       return 'Debt / Fixed Income'
  if (h.type === 'retirement') return 'Retirement Fund'
  if (h.type === 'crypto')     return 'Cryptocurrency'
  return 'Other'
}

export default function AssetAllocationCard() {
  const { data, addHolding, deleteHolding, updateHolding, updateSettings } = useApp()
  const [expandedClass, setExpandedClass] = useState<string | null>(null)
  const [showAddForm,   setShowAddForm]   = useState(false)
  const [showTargetForm,setShowTargetForm] = useState(false)
  const [targetDraft,   setTargetDraft]   = useState<Record<string,number>>({})
  const [refreshing,    setRefreshing]    = useState(false)
  const [refreshProgress, setRefreshProgress] = useState({ done: 0, total: 0 })
  const [refreshResult, setRefreshResult] = useState<{ updated: number; failed: number; skipped: number } | null>(null)
  const [form, setForm] = useState({ name: '', ticker: '', type: 'etf' as const, value: '', costBasis: '' })

  const latest = data.snapshots.length
    ? [...data.snapshots].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    : null

  // Build buckets
  const buckets: Record<string, number> = {}
  if (data.holdings.length > 0) {
    for (const h of data.holdings) {
      const cat = holdingClass(h)
      buckets[cat] = (buckets[cat] ?? 0) + h.value
    }
    if (latest) {
      if (latest.assets.checking + latest.assets.savings > 0)
        buckets['Cash & Savings'] = (buckets['Cash & Savings'] ?? 0) + latest.assets.checking + latest.assets.savings
      if (latest.assets.realEstate > 0)
        buckets['Real Estate'] = (buckets['Real Estate'] ?? 0) + latest.assets.realEstate
    }
  } else if (latest) {
    const a = latest.assets
    if (a.checking + a.savings > 0) buckets['Cash & Savings']            = a.checking + a.savings
    if (a.brokerage > 0)            buckets['Equity']          = a.brokerage
    if (a.retirement > 0)           buckets['EPF / NPS / PPF'] = a.retirement
    if (a.realEstate > 0)           buckets['Real Estate']     = a.realEstate
    if (a.other > 0)                buckets['Gold']            = a.other
  }

  // Group holdings by class then subType
  const holdingsByClass: Record<string, Holding[]> = {}
  for (const h of data.holdings) {
    const cat = holdingClass(h);
    (holdingsByClass[cat] = holdingsByClass[cat] ?? []).push(h)
  }

  const total     = Object.values(buckets).reduce((a, b) => a + b, 0)
  const totalCost = data.holdings.reduce((a, h) => a + h.costBasis, 0)
  const gain      = total - totalCost
  const gainPct   = totalCost > 0 ? (gain / totalCost) * 100 : 0

  // Always show all 7 classes + EPF if present
  const allClasses = [
    ...ALL_CLASSES,
    ...(buckets['EPF / NPS / PPF'] ? ['EPF / NPS / PPF'] as const : []),
  ]

  // Idle cash alert: cash > 6× monthly expenses
  const cashVal         = buckets['Cash & Savings'] ?? 0
  const monthlyExpenses = data.settings?.monthlyExpenses ?? 0
  const idleCashExcess  = cashVal > 0 && monthlyExpenses > 0 && cashVal > monthlyExpenses * 6
    ? cashVal - monthlyExpenses * 6
    : 0

  const pieData = allClasses
    .filter(name => (buckets[name] ?? 0) > 0)
    .map(name => ({ name, value: buckets[name], color: ASSET_COLORS[name] ?? '#d6d3d1' }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.value) return
    addHolding({ ...form, value: parseFloat(form.value), costBasis: parseFloat(form.costBasis || form.value) })
    setForm({ name: '', ticker: '', type: 'etf', value: '', costBasis: '' })
    setShowAddForm(false)
  }

  async function handleRefresh() {
    if (refreshing || !data.holdings.length) return
    setRefreshing(true)
    setRefreshResult(null)
    const result = await refreshAllPrices(
      data.holdings,
      (done, total) => setRefreshProgress({ done, total }),
      updateHolding,
    )
    setRefreshResult({ updated: result.updated, failed: result.failed, skipped: result.skipped })
    setRefreshing(false)
  }

  const lastUpdated = data.holdings.find(h => h.priceUpdatedAt)?.priceUpdatedAt

  const hasAnyData = total > 0

  return (
    <div className="card p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Asset Allocation</p>
          {hasAnyData && (
            <p className="text-xs text-surface-300 mt-0.5">
              {data.holdings.length} holdings
              {lastUpdated && (
                <span className="ml-1.5 text-surface-200">
                  · prices as of {new Date(lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasAnyData && (
            <button onClick={handleRefresh} disabled={refreshing}
              className="btn-ghost flex items-center gap-1 text-xs disabled:opacity-50">
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''}/>
              {refreshing
                ? refreshProgress.total > 0 ? `${refreshProgress.done}/${refreshProgress.total}` : '…'
                : 'Refresh prices'}
            </button>
          )}
          <button onClick={() => {
              // Seed from all classes that have actual assets OR already have a target
              const existing = data.settings.targetAllocation ?? {}
              const draft = Object.fromEntries(
                [...new Set([...Object.keys(buckets).filter(k => buckets[k] > 0), ...Object.keys(existing)])]
                  .map(k => [k, existing[k] ?? 0])
              )
              setTargetDraft(draft)
              setShowTargetForm(v => !v)
            }}
            className="btn-ghost flex items-center gap-1 text-xs">
            <Settings2 size={12}/> Target
          </button>
          <button onClick={() => setShowAddForm(v => !v)}
            className="btn-ghost flex items-center gap-1 text-xs">
            <Plus size={13}/> Add
          </button>
        </div>
      </div>

      {refreshResult && (
        <p className="text-[11px] text-surface-400 -mt-2">
          {refreshResult.updated > 0
            ? `Updated ${refreshResult.updated} holdings`
            : 'No market-priced holdings to update'}
          {refreshResult.skipped > 0 && ` · ${refreshResult.skipped} skipped (bank/FD/PPF — update by re-importing statements)`}
          {refreshResult.failed > 0 && ` · ${refreshResult.failed} failed`}
        </p>
      )}

      {/* Idle cash alert */}
      {idleCashExcess > 0 && (
        <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-700 leading-relaxed">
            <span className="font-semibold">{fmtINR(idleCashExcess)} idle</span> above your 6-month emergency fund. Consider moving to a liquid debt fund (~7% vs ~3.5%).
          </p>
        </div>
      )}

      {/* Add form */}
      {/* Target allocation editor */}
      {showTargetForm && (
        <div className="flex flex-col gap-3 p-3 bg-surface-50 rounded-xl border border-surface-100 animate-fade-up">
          <p className="text-xs font-semibold text-surface-600">Set Target Allocation (%)</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(targetDraft).map(([cls, val]) => (
              <div key={cls} className="flex items-center gap-2">
                <span className="text-[10px] text-surface-500 flex-1 truncate">{cls}</span>
                <input type="number" min={0} max={100} value={val}
                  onChange={e => setTargetDraft(d => ({ ...d, [cls]: parseFloat(e.target.value) || 0 }))}
                  className="input-field text-xs w-16 text-right py-1" />
                <span className="text-[10px] text-surface-300">%</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-surface-300">
            Total: {Object.values(targetDraft).reduce((a,b)=>a+b,0).toFixed(0)}% (aim for 100%)
          </p>
          <div className="flex gap-2">
            <button onClick={() => setShowTargetForm(false)} className="btn-ghost flex-1 text-xs">Cancel</button>
            <button onClick={() => { updateSettings({ targetAllocation: targetDraft }); setShowTargetForm(false) }}
              className="btn-primary flex-1 text-xs">Save Target</button>
          </div>
        </div>
      )}

      {showAddForm && (
        <form onSubmit={submit} className="flex flex-col gap-2 p-3 bg-surface-50 rounded-xl border border-surface-100 animate-fade-up">
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field text-xs" placeholder="Name (e.g. Reliance)" value={form.name}
              onChange={e => setForm(v => ({ ...v, name: e.target.value }))} />
            <input className="input-field text-xs" placeholder="Ticker / ISIN (optional)" value={form.ticker}
              onChange={e => setForm(v => ({ ...v, ticker: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input-field text-xs" type="number" placeholder="Current value (₹)" value={form.value}
              onChange={e => setForm(v => ({ ...v, value: e.target.value }))} />
            <input className="input-field text-xs" type="number" placeholder="Cost basis (₹)" value={form.costBasis}
              onChange={e => setForm(v => ({ ...v, costBasis: e.target.value }))} />
          </div>
          <select className="input-field text-xs" value={form.type}
            onChange={e => setForm(v => ({ ...v, type: e.target.value as any }))}>
            <option value="stock">Equity — Direct Stock</option>
            <option value="etf">Equity — Mutual Fund / ETF</option>
            <option value="bond">Debt / Fixed Income / Gold</option>
            <option value="retirement">EPF / NPS / PPF</option>
            <option value="crypto">Cryptocurrency</option>
            <option value="cash">Cash / Liquid</option>
          </select>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowAddForm(false)} className="btn-ghost flex-1 text-xs">Cancel</button>
            <button type="submit" className="btn-primary flex-1 text-xs">Add Holding</button>
          </div>
        </form>
      )}

      {!hasAnyData && !showAddForm ? (
        <EmptyState
          title="No holdings recorded"
          description="Import your Zerodha XLSX or CAMS statement to see your complete asset allocation."
          cta="Import from Zerodha"
          onCta={() => setShowAddForm(true)}
        />
      ) : (
        <>
          {/* Portfolio total */}
          {hasAnyData && (
            <div>
              <p className="kpi-value">{fmtINR(total)}</p>
              {totalCost > 0 && (
                <p className={`text-xs font-medium mt-0.5 ${gain >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {gain >= 0 ? '+' : ''}{fmtINR(gain)} ({fmtPct(gainPct)}) overall return
                </p>
              )}
            </div>
          )}

          {/* Donut + summary row */}
          {pieData.length > 0 && (
            <div className="flex gap-3 items-center">
              <ResponsiveContainer width={80} height={80}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={22} outerRadius={36}
                    dataKey="value" paddingAngle={2}>
                    {pieData.map(d => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtINR(v as number)}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e7e5e4' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {pieData.map(d => {
                  const actualPct = total > 0 ? (d.value / total) * 100 : 0
                  const targetPct = (data.settings.targetAllocation ?? {})[d.name]
                  const drift     = targetPct != null ? actualPct - targetPct : null
                  return (
                    <span key={d.name} className="flex items-center gap-1 text-[10px] text-surface-600">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }}/>
                      {d.name} {actualPct.toFixed(0)}%
                      {drift != null && Math.abs(drift) > 2 && (
                        <span className={`text-[9px] font-semibold ${drift > 0 ? 'text-rose-400' : 'text-emerald-500'}`}>
                          {drift > 0 ? `+${drift.toFixed(0)}` : drift.toFixed(0)}
                        </span>
                      )}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* Target allocation drift bars */}
          {data.settings.targetAllocation && total > 0 && Object.keys(data.settings.targetAllocation).length > 0 && (
            <div className="flex flex-col gap-1.5 p-3 bg-surface-50 rounded-xl">
              <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-0.5">vs Target</p>
              {Object.entries(data.settings.targetAllocation).map(([cls, tgt]) => {
                const actual = total > 0 ? ((buckets[cls] ?? 0) / total) * 100 : 0
                const drift  = actual - (tgt ?? 0)
                const color  = ASSET_COLORS[cls] ?? '#d6d3d1'
                return (
                  <div key={cls} className="flex items-center gap-2">
                    <span className="text-[10px] text-surface-500 w-24 shrink-0 truncate">{cls}</span>
                    <div className="flex-1 relative h-1.5 bg-surface-100 rounded-full overflow-visible">
                      <div className="absolute h-1.5 rounded-full" style={{ width: `${Math.min(actual,100)}%`, background: color, opacity: 0.7 }} />
                      <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3 bg-surface-500 rounded-full" style={{ left: `${tgt}%` }} />
                    </div>
                    <span className={`text-[10px] font-mono w-16 text-right shrink-0 font-semibold
                      ${Math.abs(drift) > 5 ? (drift > 0 ? 'text-rose-500' : 'text-emerald-600') : 'text-surface-400'}`}>
                      {actual.toFixed(0)}% {Math.abs(drift) > 1 ? `(${drift > 0 ? '+' : ''}${drift.toFixed(0)})` : '✓'}
                    </span>
                  </div>
                )
              })}
              <p className="text-[9px] text-surface-300 mt-1">│ = target · red overweight · green underweight</p>
            </div>
          )}

          {/* Full class breakdown — always visible */}
          <div className="flex flex-col divide-y divide-surface-50">
            {allClasses.map(cls => {
              const value    = buckets[cls] ?? 0
              const isEmpty  = value === 0
              const holdings = holdingsByClass[cls] ?? []
              const clsCost  = holdings.reduce((a, h) => a + h.costBasis, 0)
              const clsGain  = value - clsCost
              const isOpen   = expandedClass === cls

              return (
                <div key={cls}>
                  {/* Class row */}
                  <div
                    className={`flex items-center gap-3 py-2.5 cursor-pointer hover:bg-surface-50/60 rounded-lg px-1 -mx-1 transition-colors
                      ${isEmpty ? 'opacity-50' : ''}`}
                    onClick={() => !isEmpty && setExpandedClass(isOpen ? null : cls)}>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: isEmpty ? '#e7e5e4' : ASSET_COLORS[cls] ?? '#d6d3d1' }} />
                    <span className="text-sm font-semibold text-surface-800 flex-1 flex items-center gap-1.5">
                        {cls}
                        {cls === 'Cash & Savings' && value > 0 && (
                          <span className="text-[9px] font-medium text-orange-500 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full">~3.5% · loses to inflation</span>
                        )}
                      </span>

                    {isEmpty ? (
                      <span className="text-[10px] text-surface-300 italic">not added</span>
                    ) : (
                      <div className="flex items-center gap-3 shrink-0">
                        {clsCost > 0 && (
                          <span className={`text-[10px] font-medium ${clsGain >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {clsGain >= 0 ? '+' : ''}{fmtPct((clsGain / clsCost) * 100)}
                          </span>
                        )}
                        <span className="text-sm font-semibold font-mono text-surface-800">{fmtINR(value)}</span>
                        <span className="text-[10px] text-surface-300 w-7 text-right">
                          {total > 0 ? `${((value / total) * 100).toFixed(0)}%` : ''}
                        </span>
                        {holdings.length > 0 && (
                          isOpen
                            ? <ChevronDown size={13} className="text-surface-400"/>
                            : <ChevronRight size={13} className="text-surface-400"/>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Holdings drill-down */}
                  {isOpen && holdings.length > 0 && (
                    <div className="ml-5 mb-2 flex flex-col gap-0.5 animate-fade-up">
                      {/* Sub-type groups */}
                      {(() => {
                        const bySubType: Record<string, Holding[]> = {}
                        holdings.forEach(h => {
                          const sub = holdingSubType(h);
                          (bySubType[sub] = bySubType[sub] ?? []).push(h)
                        })
                        return Object.entries(bySubType).map(([sub, items]) => (
                          <div key={sub} className="flex flex-col">
                            <p className="text-[9px] uppercase tracking-widest font-semibold text-surface-300 mt-2 mb-1">{sub}</p>
                            {items
                              .sort((a, b) => b.value - a.value)
                              .map(h => {
                                const ret = h.costBasis > 0 ? ((h.value - h.costBasis) / h.costBasis) * 100 : 0
                                return (
                                  <div key={h.id} className="flex items-center gap-2 py-1.5 border-b border-surface-50 group">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-surface-800 truncate">{h.name}</p>
                                      <p className="text-[10px] text-surface-300 font-mono truncate">
                                        {h.qty != null && h.qty > 0
                                          ? `${h.qty % 1 === 0 ? h.qty : h.qty.toFixed(3)} units${h.lastPrice ? ` · ₹${h.lastPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 })} each` : ''}`
                                          : h.ticker || ''}
                                      </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <p className="text-xs font-semibold font-mono text-surface-800">{fmtINR(h.value)}</p>
                                      {h.costBasis > 0 && (
                                        <p className={`text-[10px] font-medium ${ret >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                                          {ret >= 0 ? '+' : ''}{ret.toFixed(1)}%
                                        </p>
                                      )}
                                    </div>
                                    <button onClick={() => deleteHolding(h.id)}
                                      className="opacity-0 group-hover:opacity-100 text-surface-300 hover:text-rose-400 transition-all ml-1">
                                      <Trash2 size={11}/>
                                    </button>
                                  </div>
                                )
                              })}
                          </div>
                        ))
                      })()}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
