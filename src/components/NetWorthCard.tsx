import { useState, useRef } from 'react'
import { Download, Upload, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { exportData, importData } from '../lib/storage'
import { netWorth, fmt } from '../lib/calc'

const EMPTY_ASSETS = { checking: 0, savings: 0, brokerage: 0, retirement: 0, realEstate: 0, other: 0 }
const EMPTY_LIAB   = { mortgage: 0, studentLoans: 0, creditCards: 0, autoLoans: 0, other: 0 }

export default function NetWorthCard() {
  const { data, addSnapshot, replaceData } = useApp()
  const [expanded, setExpanded] = useState(false)
  const [assets, setAssets]     = useState({ ...EMPTY_ASSETS })
  const [liab, setLiab]         = useState({ ...EMPTY_LIAB })
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 7))
  const fileRef = useRef<HTMLInputElement>(null)

  const sorted  = [...data.snapshots].sort((a, b) => a.date.localeCompare(b.date))
  const latest  = sorted[sorted.length - 1]
  const nw      = latest ? netWorth(latest) : 0

  function submit(e: React.FormEvent) {
    e.preventDefault()
    addSnapshot({ date, assets, liabilities: liab })
    setAssets({ ...EMPTY_ASSETS })
    setLiab({ ...EMPTY_LIAB })
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const imported = await importData(file)
      replaceData(imported)
    } catch { alert('Invalid backup file') }
  }

  const assetFields = [
    { key: 'checking', label: 'Checking' }, { key: 'savings', label: 'Savings' },
    { key: 'brokerage', label: 'Brokerage' }, { key: 'retirement', label: '401k / IRA' },
    { key: 'realEstate', label: 'Real Estate' }, { key: 'other', label: 'Other' },
  ]
  const liabFields = [
    { key: 'mortgage', label: 'Mortgage' }, { key: 'studentLoans', label: 'Student Loans' },
    { key: 'creditCards', label: 'Credit Cards' }, { key: 'autoLoans', label: 'Auto Loans' },
    { key: 'other', label: 'Other Debt' },
  ]

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="section-title">Net Worth Snapshot</p>
        <button className="btn-ghost" onClick={() => setExpanded(v => !v)}>
          {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        </button>
      </div>

      <div>
        <p className="kpi-value">{fmt(nw)}</p>
        <p className="text-xs text-surface-300 mt-0.5">
          {data.snapshots.length} snapshot{data.snapshots.length !== 1 ? 's' : ''} recorded
        </p>
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 pt-2 border-t border-surface-100 animate-fade-up">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-surface-300 uppercase tracking-widest">Month</label>
              <input type="month" className="input-field w-auto" value={date} onChange={e => setDate(e.target.value)} />
            </div>

            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-2">Assets</p>
              <div className="grid grid-cols-2 gap-2">
                {assetFields.map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-[10px] text-surface-300 font-medium">{label}</label>
                    <input
                      className="input-field mt-0.5" type="number" placeholder="0"
                      value={(assets as any)[key] || ''}
                      onChange={e => setAssets(v => ({ ...v, [key]: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-rose-500 uppercase tracking-widest mb-2">Liabilities</p>
              <div className="grid grid-cols-2 gap-2">
                {liabFields.map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-[10px] text-surface-300 font-medium">{label}</label>
                    <input
                      className="input-field mt-0.5" type="number" placeholder="0"
                      value={(liab as any)[key] || ''}
                      onChange={e => setLiab(v => ({ ...v, [key]: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <button type="submit" className="btn-primary flex items-center gap-1 justify-center">
              <Plus size={14}/> Save Snapshot
            </button>
          </form>

          <div className="flex gap-2 pt-2 border-t border-surface-100">
            <button onClick={() => exportData(data)} className="btn-ghost flex items-center gap-1 flex-1 justify-center text-xs">
              <Download size={13}/> Export JSON
            </button>
            <button onClick={() => fileRef.current?.click()} className="btn-ghost flex items-center gap-1 flex-1 justify-center text-xs">
              <Upload size={13}/> Import JSON
            </button>
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          </div>
        </div>
      )}
    </div>
  )
}
