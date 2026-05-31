import { useState, useMemo } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ChevronRight, ChevronDown, TrendingUp, TrendingDown } from 'lucide-react'
import { fmtINR } from '../lib/calc'
import type { ZerodhaHolding } from '../lib/zerodhaXLSXParser'

// ─── Colours ──────────────────────────────────────────────────────────────────
const CLASS_COLORS: Record<string, string> = {
  'Direct Equity':        '#f59e0b',
  'Equity Mutual Funds':  '#6366f1',
  'Index Funds & ETFs':   '#10b981',
  'Debt':                 '#3b82f6',
  'Gold':                 '#f97316',
  'International':        '#8b5cf6',
  'Other':                '#a8a29e',
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface BreakdownRow {
  label:    string
  value:    number
  cost:     number
  pct:      number
  pnl:      number
  pnlPct:   number
  color:    string
  children: BreakdownRow[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function group<T>(items: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const item of items) {
    const k = key(item);
    (out[k] = out[k] ?? []).push(item)
  }
  return out
}

function sumValue(items: ZerodhaHolding[]) {
  return items.reduce((a, h) => a + h.currentValue, 0)
}
function sumCost(items: ZerodhaHolding[]) {
  return items.reduce((a, h) => a + h.costBasis, 0)
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  holdings: ZerodhaHolding[]
  importedAt: string
}

export default function PortfolioBreakdown({ holdings, importedAt }: Props) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const totalValue = holdings.reduce((a, h) => a + h.currentValue, 0)
  const totalCost  = holdings.reduce((a, h) => a + h.costBasis,    0)
  const totalPnl   = totalValue - totalCost
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

  // Build tree: Asset Class → Sub Type → Individual
  const tree: BreakdownRow[] = useMemo(() => {
    const byClass = group(holdings, h => h.assetClass)
    return Object.entries(byClass)
      .sort(([, a], [, b]) => sumValue(b) - sumValue(a))
      .map(([cls, items]) => {
        const clsValue = sumValue(items)
        const clsCost  = sumCost(items)
        const clsPnl   = clsValue - clsCost

        const bySubType = group(items, h => h.subType || 'Other')
        const children: BreakdownRow[] = Object.entries(bySubType)
          .sort(([, a], [, b]) => sumValue(b) - sumValue(a))
          .map(([sub, subItems]) => {
            const sv = sumValue(subItems), sc = sumCost(subItems)
            return {
              label: sub, value: sv, cost: sc,
              pct: totalValue > 0 ? (sv / totalValue) * 100 : 0,
              pnl: sv - sc, pnlPct: sc > 0 ? ((sv - sc) / sc) * 100 : 0,
              color: CLASS_COLORS[cls] ?? '#a8a29e',
              children: subItems
                .sort((a, b) => b.currentValue - a.currentValue)
                .map(h => ({
                  label: h.symbol, value: h.currentValue, cost: h.costBasis,
                  pct: totalValue > 0 ? (h.currentValue / totalValue) * 100 : 0,
                  pnl: h.unrealisedPL, pnlPct: h.unrealisedPLPct,
                  color: CLASS_COLORS[cls] ?? '#a8a29e', children: [],
                })),
            }
          })

        return {
          label: cls, value: clsValue, cost: clsCost,
          pct: totalValue > 0 ? (clsValue / totalValue) * 100 : 0,
          pnl: clsPnl, pnlPct: clsCost > 0 ? (clsPnl / clsCost) * 100 : 0,
          color: CLASS_COLORS[cls] ?? '#a8a29e', children,
        }
      })
  }, [holdings, totalValue])

  const pieData = tree.map(r => ({ name: r.label, value: r.value, color: r.color }))

  function toggleRow(key: string) {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function PnlBadge({ pnl, pct }: { pnl: number; pct: number }) {
    const up = pnl >= 0
    return (
      <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
        {up ? <TrendingUp size={9}/> : <TrendingDown size={9}/>}
        {up ? '+' : ''}{fmtINR(pnl)} ({up ? '+' : ''}{pct.toFixed(1)}%)
      </span>
    )
  }

  function BreakdownRow({ row, depth, parentKey }: { row: BreakdownRow; depth: number; parentKey?: string }) {
    const key     = `${parentKey ?? ''}/${row.label}`
    const isOpen  = expandedRows.has(key)
    const hasKids = row.children.length > 0

    const indent = depth * 16

    return (
      <>
        <tr
          className={`${depth === 0 ? 'bg-surface-50/80' : depth === 1 ? 'bg-white' : 'bg-surface-50/30'} 
            hover:bg-amber-50/30 transition-colors cursor-pointer border-b border-surface-50`}
          onClick={() => hasKids && toggleRow(key)}
        >
          <td className="py-2.5 pr-3" style={{ paddingLeft: `${12 + indent}px` }}>
            <div className="flex items-center gap-2">
              {hasKids ? (
                isOpen
                  ? <ChevronDown size={11} className="text-surface-400 shrink-0"/>
                  : <ChevronRight size={11} className="text-surface-400 shrink-0"/>
              ) : <span className="w-[11px]"/>}
              {depth === 0 && (
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }}/>
              )}
              <span className={`text-xs truncate max-w-[200px] ${depth === 0 ? 'font-semibold text-surface-800' : depth === 1 ? 'font-medium text-surface-700' : 'text-surface-600'}`}>
                {row.label}
              </span>
            </div>
          </td>
          <td className="py-2.5 px-3 text-right">
            <span className={`text-xs font-mono font-semibold ${depth === 0 ? 'text-surface-800' : 'text-surface-600'}`}>
              {fmtINR(row.value)}
            </span>
          </td>
          <td className="py-2.5 px-3 text-right hidden sm:table-cell">
            <span className="text-xs font-mono text-surface-400">{row.pct.toFixed(1)}%</span>
          </td>
          <td className="py-2.5 pl-3 text-right hidden md:table-cell">
            <PnlBadge pnl={row.pnl} pct={row.pnlPct} />
          </td>
        </tr>
        {isOpen && row.children.map(child => (
          <BreakdownRow key={child.label} row={child} depth={depth + 1} parentKey={key} />
        ))}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-1">Portfolio Value</p>
          <p className="text-3xl font-bold text-surface-900">{fmtINR(totalValue)}</p>
          <div className="flex items-center gap-3 mt-1">
            <PnlBadge pnl={totalPnl} pct={totalPnlPct} />
            <span className="text-xs text-surface-400">invested {fmtINR(totalCost)}</span>
          </div>
          <p className="text-[10px] text-surface-300 mt-1">Imported from Zerodha · {importedAt}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-surface-300">{holdings.length} holdings</p>
          <p className="text-[10px] text-surface-300">{[...new Set(holdings.map(h => h.assetClass))].length} asset classes</p>
        </div>
      </div>

      {/* Donut + legend side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
              dataKey="value" paddingAngle={2}>
              {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip
              formatter={(v: any) => [fmtINR(v as number), '']}
              contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #e7e5e4' }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="flex flex-col gap-2">
          {pieData.map(d => (
            <div key={d.name} className="flex items-center gap-2.5">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-xs text-surface-700 flex-1">{d.name}</span>
              <span className="text-xs font-semibold font-mono text-surface-800">{fmtINR(d.value)}</span>
              <span className="text-[10px] text-surface-400 w-10 text-right">
                {totalValue > 0 ? ((d.value / totalValue) * 100).toFixed(1) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Drill-down table */}
      <div>
        <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-2">
          Drill Down — click any row to expand
        </p>
        <div className="rounded-xl border border-surface-100 overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-100">
                <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-surface-400 px-3 py-2">Name</th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-widest text-surface-400 px-3 py-2">Value</th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-widest text-surface-400 px-3 py-2 hidden sm:table-cell">%</th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-widest text-surface-400 pl-3 py-2 hidden md:table-cell">Return</th>
              </tr>
            </thead>
            <tbody>
              {tree.map(row => (
                <BreakdownRow key={row.label} row={row} depth={0} />
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-50 border-t-2 border-surface-200">
                <td className="py-2.5 px-3 text-xs font-bold text-surface-800">Total</td>
                <td className="py-2.5 px-3 text-right text-xs font-bold font-mono text-surface-800">{fmtINR(totalValue)}</td>
                <td className="py-2.5 px-3 text-right text-xs font-mono text-surface-400 hidden sm:table-cell">100%</td>
                <td className="py-2.5 pl-3 text-right hidden md:table-cell">
                  <PnlBadge pnl={totalPnl} pct={totalPnlPct} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
