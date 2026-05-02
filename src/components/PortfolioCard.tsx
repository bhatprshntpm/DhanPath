import { useState } from 'react'
import { Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { useApp } from '../context/AppContext'
import { fmt, fmtPct } from '../lib/calc'

const TYPE_COLORS: Record<string, string> = {
  stock: '#f59e0b', etf: '#6366f1', bond: '#10b981',
  crypto: '#ef4444', retirement: '#8b5cf6', cash: '#a8a29e',
}

export default function PortfolioCard() {
  const { data, addHolding } = useApp()
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState({ name: '', ticker: '', type: 'etf' as const, value: '', costBasis: '' })

  const total     = data.holdings.reduce((a, h) => a + h.value, 0)
  const totalCost = data.holdings.reduce((a, h) => a + h.costBasis, 0)
  const gain      = total - totalCost
  const gainPct   = totalCost > 0 ? (gain / totalCost) * 100 : 0

  const byType: Record<string, number> = {}
  data.holdings.forEach(h => { byType[h.type] = (byType[h.type] ?? 0) + h.value })
  const pieData = Object.entries(byType).map(([name, value]) => ({ name, value }))

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.value) return
    addHolding({ ...form, value: parseFloat(form.value), costBasis: parseFloat(form.costBasis || form.value) })
    setForm({ name: '', ticker: '', type: 'etf', value: '', costBasis: '' })
  }

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="section-title">Portfolio</p>
        <button className="btn-ghost" onClick={() => setExpanded(v => !v)}>
          {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        </button>
      </div>

      <div>
        <p className="kpi-value">{fmt(total)}</p>
        <p className={`text-xs font-medium mt-0.5 ${gain >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
          {gain >= 0 ? '+' : ''}{fmt(gain)} ({fmtPct(gainPct)}) total return
        </p>
      </div>

      {pieData.length > 0 && (
        <ResponsiveContainer width="100%" height={100}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={28} outerRadius={44} dataKey="value" paddingAngle={3}>
              {pieData.map((entry) => (
                <Cell key={entry.name} fill={TYPE_COLORS[entry.name] ?? '#a8a29e'} />
              ))}
            </Pie>
            <Tooltip formatter={(v: any) => fmt(v as number)} />
          </PieChart>
        </ResponsiveContainer>
      )}

      <div className="flex flex-wrap gap-2">
        {pieData.map(({ name, value }) => (
          <span key={name} className="flex items-center gap-1 text-xs text-surface-800">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[name] ?? '#a8a29e' }}/>
            {name} {total > 0 ? `${((value/total)*100).toFixed(0)}%` : ''}
          </span>
        ))}
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 pt-2 border-t border-surface-100 animate-fade-up">
          <form onSubmit={submit} className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-surface-300 uppercase tracking-widest">Add Holding</p>
            <div className="grid grid-cols-2 gap-2">
              <input className="input-field" placeholder="Name (e.g. VTSAX)" value={form.name} onChange={e => setForm(v=>({...v,name:e.target.value}))} />
              <input className="input-field" placeholder="Ticker (optional)" value={form.ticker} onChange={e => setForm(v=>({...v,ticker:e.target.value}))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="input-field" type="number" placeholder="Current value ($)" value={form.value} onChange={e => setForm(v=>({...v,value:e.target.value}))} />
              <input className="input-field" type="number" placeholder="Cost basis ($)" value={form.costBasis} onChange={e => setForm(v=>({...v,costBasis:e.target.value}))} />
            </div>
            <select className="input-field" value={form.type} onChange={e => setForm(v=>({...v,type:e.target.value as any}))}>
              {['stock','etf','bond','crypto','retirement','cash'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
            </select>
            <button type="submit" className="btn-primary flex items-center gap-1 justify-center">
              <Plus size={14}/> Add
            </button>
          </form>

          {data.holdings.length > 0 && (
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
              {data.holdings.map(h => (
                <div key={h.id} className="flex justify-between items-center text-xs py-1.5 border-b border-surface-50">
                  <div>
                    <span className="font-medium text-surface-800">{h.name}</span>
                    {h.ticker && <span className="text-surface-300 ml-1 font-mono">{h.ticker}</span>}
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-surface-800">{fmt(h.value)}</div>
                    <div className={`text-[10px] ${h.value >= h.costBasis ? 'text-emerald-600':'text-rose-500'}`}>
                      {fmtPct(((h.value-h.costBasis)/Math.max(h.costBasis,1))*100)}
                    </div>
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
