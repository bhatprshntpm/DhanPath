import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useApp } from '../context/AppContext'
import { fmtINR, fmtPct } from '../lib/calc'
import EmptyState from './EmptyState'
import type { Holding } from '../types'

const ASSET_COLORS: Record<string, string> = {
  'Equity':         '#f59e0b',
  'Debt':           '#3b82f6',
  'Gold':           '#f97316',
  'International':  '#8b5cf6',
  'Cryptocurrency': '#ec4899',
  'Real Estate':    '#10b981',
  'Cash':           '#a8a29e',
  'EPF / NPS / PPF':'#6366f1',
  'Other':          '#d6d3d1',
}

const ALL_CLASSES = ['Equity', 'Debt', 'Gold', 'International', 'Cryptocurrency', 'Real Estate', 'Cash'] as const

// Hints shown in empty state — used via CLASS_HINTS[name] when value === 0
export const CLASS_HINTS: Record<string, string> = {
  'Equity':         'Stocks, mutual funds, ETFs — import Zerodha XLSX to populate',
  'Debt':           'G-Secs, debt mutual funds, bonds — import Zerodha or add manually',
  'Gold':           'Physical gold, Gold ETF, SGBs — add via portfolio or net worth',
  'International':  'US stocks, RSUs, international funds — add Fidelity or manual',
  'Cryptocurrency': 'BTC, ETH and other crypto — add manually',
  'Real Estate':    'Property value — add via Net Worth snapshot',
  'Cash':           'Savings accounts, FDs — add via Net Worth snapshot',
}

function holdingClass(h: Holding): string {
  if (h.assetClass) return h.assetClass
  if (h.type === 'stock')      return 'Equity'
  if (h.type === 'etf')        return 'Equity'
  if (h.type === 'bond')       return 'Debt'
  if (h.type === 'retirement') return 'EPF / NPS / PPF'
  if (h.type === 'crypto')     return 'Cryptocurrency'
  if (h.type === 'cash')       return 'Cash'
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
  const { data, addHolding, deleteHolding } = useApp()
  const [expandedClass, setExpandedClass] = useState<string | null>(null)
  const [showAddForm,   setShowAddForm]   = useState(false)
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
      if (latest.assets.checking > 0)
        buckets['Cash'] = (buckets['Cash'] ?? 0) + latest.assets.checking
      if (latest.assets.realEstate > 0)
        buckets['Real Estate'] = (buckets['Real Estate'] ?? 0) + latest.assets.realEstate
    }
  } else if (latest) {
    const a = latest.assets
    if (a.checking + a.savings > 0) buckets['Cash']            = a.checking + a.savings
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

  const hasAnyData = total > 0

  return (
    <div className="card p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Asset Allocation</p>
          {hasAnyData && (
            <p className="text-xs text-surface-300 mt-0.5">{data.holdings.length} holdings</p>
          )}
        </div>
        <button onClick={() => setShowAddForm(v => !v)}
          className="btn-ghost flex items-center gap-1 text-xs">
          <Plus size={13}/> Add
        </button>
      </div>

      {/* Add form */}
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
                {pieData.map(d => (
                  <span key={d.name} className="flex items-center gap-1 text-[10px] text-surface-600">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }}/>
                    {d.name} {total > 0 ? `${((d.value / total) * 100).toFixed(0)}%` : ''}
                  </span>
                ))}
              </div>
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
                    <span className="text-sm font-semibold text-surface-800 flex-1">{cls}</span>

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
                                      {h.ticker && <p className="text-[10px] text-surface-300 font-mono truncate">{h.ticker}</p>}
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
