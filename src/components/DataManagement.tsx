import { useState, useRef } from 'react'
import { ChevronDown, ChevronUp, Database, Upload, CheckCircle, Loader2, X, RefreshCw } from 'lucide-react'
import ImportCard from './ImportCard'
import NetWorthCard from './NetWorthCard'
import CashFlowCard from './CashFlowCard'
import DebtCard from './DebtCard'
import SipCalculator from './SipCalculator'
import ScenarioPanel from './ScenarioPanel'
import PortfolioBreakdown from './PortfolioBreakdown'
import { parseZerodhaXLSX, zerodhaToHoldings, zerodhaToSnapshot } from '../lib/zerodhaXLSXParser'
import type { ZerodhaParseResult } from '../lib/zerodhaXLSXParser'
import { parseFidelityPDF, fidelityToHoldings } from '../lib/fidelityPDFParser'
import type { FidelityParseResult } from '../lib/fidelityPDFParser'
import { useApp } from '../context/AppContext'
import { DEFAULT_DATA } from '../lib/storage'
import { fmtINR } from '../lib/calc'

const TABS = [
  { id: 'zerodha',   label: 'Zerodha Holdings' },
  { id: 'fidelity',  label: 'Fidelity / RSU'  },
  { id: 'import',    label: 'Other Sources'   },
  { id: 'networth',  label: 'Net Worth'       },
  { id: 'cashflow',  label: 'Transactions'    },
  { id: 'debt',       label: 'Loans'            },
  { id: 'scenarios',  label: 'Scenarios'        },
  { id: 'sip',        label: 'SIP Calculator'   },
]

// ─── Zerodha XLSX import tab ──────────────────────────────────────────────────
function ZerodhaTab() {
  const { data, replaceHoldings, addOrUpdateSnapshot } = useApp()
  const fileRef   = useRef<HTMLInputElement>(null)
  const [parsing,  setParsing]  = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result,   setResult]   = useState<ZerodhaParseResult | null>(null)
  const [imported, setImported] = useState(false)
  const [clearing, setClearing] = useState(false)

  const zerodhaHoldings = data.holdings.filter(h => h.assetClass !== 'International')

  async function handleFile(file: File) {
    setParsing(true)
    setResult(null)
    setImported(false)
    setProgress({ done: 0, total: 0 })
    const r = await parseZerodhaXLSX(file)
    setProgress({ done: 0, total: 0 })
    setResult(r)
    setParsing(false)
  }

  function doImport() {
    if (!result) return
    replaceHoldings(zerodhaToHoldings(result))
    addOrUpdateSnapshot(zerodhaToSnapshot(result))
    setImported(true)
  }

  function doClear() {
    if (!clearing) { setClearing(true); return }
    replaceHoldings(data.holdings.filter(h => h.assetClass === 'International'))
    setClearing(false)
    setResult(null)
    setImported(false)
  }

  function reset() { setResult(null); setImported(false); setClearing(false) }

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="flex flex-col gap-5">
      {/* Status bar when holdings exist */}
      {zerodhaHoldings.length > 0 && !result && (
        <div className="flex items-center justify-between px-3 py-2 bg-surface-50 rounded-xl border border-surface-100">
          <p className="text-xs text-surface-600">
            <span className="font-semibold">{zerodhaHoldings.length} holdings</span> currently imported from Zerodha
          </p>
          <button onClick={doClear} onBlur={() => setClearing(false)}
            className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors
              ${clearing ? 'border-rose-400 bg-rose-50 text-rose-600 font-semibold' : 'border-surface-200 text-surface-400 hover:text-rose-500 hover:border-rose-200'}`}>
            {clearing ? 'Tap again to clear' : 'Clear'}
          </button>
        </div>
      )}
      {/* Instructions */}
      <div className="bg-[#387ed1]/5 border border-[#387ed1]/20 rounded-xl p-4 text-xs text-surface-700 flex flex-col gap-1.5">
        <p className="font-semibold text-surface-800">How to download your Zerodha holdings</p>
        <p>1. Open <a href="https://console.zerodha.com/portfolio/holdings" target="_blank" rel="noreferrer" className="text-[#387ed1] underline">Zerodha Console → Portfolio → Holdings</a></p>
        <p>2. Click <strong>Download</strong> (top right) → select <strong>Excel (.xlsx)</strong></p>
        <p>3. Upload the file below — we read the <em>Combined</em> sheet automatically</p>
        <p className="text-surface-400 mt-1">The file stays on your device. Nothing is uploaded anywhere.</p>
      </div>

      {!result && !parsing && (
        <div
          className="border-2 border-dashed border-surface-200 rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-amber-400 hover:bg-amber-50/30 transition-all"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}>
          <Upload size={24} className="text-surface-300" />
          <div className="text-center">
            <p className="text-sm font-semibold text-surface-700">Drop your Zerodha holdings XLSX here</p>
            <p className="text-xs text-surface-400 mt-1">or click to browse · .xlsx files only</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
        </div>
      )}

      {parsing && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <Loader2 size={20} className="animate-spin text-amber-500" />
          <span className="text-sm text-surface-600">
            {progress.total > 0
              ? `Classifying holdings… ${progress.done}/${progress.total}`
              : 'Parsing your holdings…'}
          </span>
          {progress.total > 0 && (
            <div className="w-48 bg-surface-100 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-amber-400 transition-all"
                style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          )}
        </div>
      )}

      {result?.status === 'error' && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <X size={16} className="text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-rose-700">Parse failed</p>
            <p className="text-xs text-rose-600 mt-1">{result.message}</p>
            <button onClick={reset} className="text-xs text-rose-600 underline mt-2">Try again</button>
          </div>
        </div>
      )}

      {result?.status === 'success' && !imported && (
        <div className="flex flex-col gap-4">
          {/* Summary KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-surface-50 rounded-xl text-center">
              <p className="text-xs text-surface-400 mb-0.5">Portfolio Value</p>
              <p className="text-sm font-bold text-surface-800">{fmtINR(result.summary.totalValue)}</p>
            </div>
            <div className="p-3 bg-surface-50 rounded-xl text-center">
              <p className="text-xs text-surface-400 mb-0.5">Invested</p>
              <p className="text-sm font-bold text-surface-800">{fmtINR(result.summary.totalCost)}</p>
            </div>
            <div className={`p-3 rounded-xl text-center ${result.summary.totalUnrealised >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
              <p className="text-xs text-surface-400 mb-0.5">Unrealised P&L</p>
              <p className={`text-sm font-bold ${result.summary.totalUnrealised >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                {result.summary.totalUnrealised >= 0 ? '+' : ''}{fmtINR(result.summary.totalUnrealised)}
              </p>
            </div>
          </div>

          {/* Full breakdown preview */}
          <PortfolioBreakdown holdings={result.holdings} importedAt={today} />

          {/* Import buttons */}
          <div className="flex gap-3 pt-2 border-t border-surface-100">
            <button onClick={reset} className="btn-ghost flex items-center gap-1.5 text-xs">
              <RefreshCw size={12}/> Upload different file
            </button>
            <button onClick={doImport} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <CheckCircle size={14}/> Save to my portfolio
            </button>
          </div>
        </div>
      )}

      {imported && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 flex flex-col items-center gap-2 text-center">
          <CheckCircle size={24} className="text-emerald-500" />
          <p className="font-semibold text-emerald-800">
            {result?.holdings.length} holdings saved to your portfolio
          </p>
          <p className="text-xs text-emerald-600">
            They now appear in your Asset Allocation and net worth calculations.
          </p>
          <button onClick={reset} className="text-xs text-emerald-600 underline mt-1">
            Import another file
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Fidelity PDF import tab ─────────────────────────────────────────────────
function FidelityTab() {
  const { data, upsertHoldings, deleteHolding } = useApp()
  const fidelityHoldings = data.holdings.filter(h => h.assetClass === 'International')
  const fileRef  = useRef<HTMLInputElement>(null)
  const [parsing,  setParsing]  = useState(false)
  const [result,   setResult]   = useState<FidelityParseResult | null>(null)
  const [imported, setImported] = useState(false)
  const [inrRate,  setInrRate]  = useState<number | null>(null)

  async function handleFile(file: File) {
    setParsing(true)
    setResult(null)
    setImported(false)
    const r = await parseFidelityPDF(file)
    // Fetch USD→INR rate
    try {
      const fx = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
      const fxData = await fx.json()
      setInrRate(fxData?.rates?.INR ?? null)
    } catch { setInrRate(null) }
    setResult(r)
    setParsing(false)
  }

  function doImport() {
    if (!result || !inrRate) return
    upsertHoldings(fidelityToHoldings(result, inrRate))
    setImported(true)
  }

  function reset() { setResult(null); setImported(false) }

  return (
    <div className="flex flex-col gap-5">
      {/* Currently saved Fidelity holdings */}
      {fidelityHoldings.length > 0 && !result && (
        <div className="flex flex-col gap-1.5 px-3 py-2.5 bg-surface-50 rounded-xl border border-surface-100">
          <p className="text-xs font-semibold text-surface-600">Currently in portfolio</p>
          {fidelityHoldings.map(h => (
            <div key={h.id} className="flex items-center justify-between">
              <span className="text-xs text-surface-700 font-medium">{h.name} <span className="text-surface-300 font-normal font-mono">{h.ticker}</span></span>
              <button onClick={() => deleteHolding(h.id)}
                className="text-[10px] text-surface-300 hover:text-rose-400 transition-colors px-1.5 py-0.5 rounded border border-transparent hover:border-rose-200">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-xs text-surface-700 flex flex-col gap-1.5">
        <p className="font-semibold text-surface-800">How to get your Fidelity statement</p>
        <p>1. Log in to <strong>netbenefits.fidelity.com</strong></p>
        <p>2. Go to <strong>Statements</strong> → select the latest quarterly report</p>
        <p>3. Download as <strong>PDF</strong> and upload below</p>
        <p className="text-surface-400 mt-1">Supports Fidelity NetBenefits Stock Plan Services Reports (RSU / ESPP)</p>
      </div>

      {!result && !parsing && (
        <div
          className="border-2 border-dashed border-surface-200 rounded-2xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/20 transition-all"
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}>
          <Upload size={24} className="text-surface-300" />
          <div className="text-center">
            <p className="text-sm font-semibold text-surface-700">Drop your Fidelity statement PDF here</p>
            <p className="text-xs text-surface-400 mt-1">or click to browse · .pdf files only</p>
          </div>
          <input ref={fileRef} type="file" accept=".pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
        </div>
      )}

      {parsing && (
        <div className="flex flex-col items-center justify-center gap-3 py-12">
          <Loader2 size={20} className="animate-spin text-blue-500" />
          <span className="text-sm text-surface-600">Reading your Fidelity statement…</span>
        </div>
      )}

      {result?.status === 'error' && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <X size={16} className="text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-rose-700">Parse failed</p>
            <p className="text-xs text-rose-600 mt-1">{result.message}</p>
            <button onClick={reset} className="text-xs text-rose-600 underline mt-2">Try again</button>
          </div>
        </div>
      )}

      {result?.status === 'success' && !imported && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-surface-50 rounded-xl text-center">
              <p className="text-xs text-surface-400 mb-0.5">Portfolio Value (USD)</p>
              <p className="text-sm font-bold text-surface-800">${result.totalUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="p-3 bg-surface-50 rounded-xl text-center">
              <p className="text-xs text-surface-400 mb-0.5">Portfolio Value (INR)</p>
              <p className="text-sm font-bold text-surface-800">
                {inrRate ? fmtINR(result.totalUSD * inrRate) : '—'}
              </p>
              {inrRate && <p className="text-[10px] text-surface-300 mt-0.5">1 USD = ₹{inrRate.toFixed(1)}</p>}
            </div>
          </div>

          <div className="flex flex-col divide-y divide-surface-50 rounded-xl border border-surface-100 overflow-hidden">
            {result.holdings.map((h, idx) => (
              <div key={`${h.ticker}-${idx}`} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-surface-800">{h.name.split(' ').map((w: string) => w[0] + w.slice(1).toLowerCase()).join(' ')}</p>
                  <p className="text-[10px] text-surface-400 font-mono">
                    {h.ticker} · {h.qty > 0 ? `${h.qty % 1 === 0 ? h.qty : h.qty.toFixed(3)} shares` : 'position'}
                    {h.priceUSD > 0 ? ` @ $${h.priceUSD.toFixed(2)}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold font-mono text-surface-800">${h.valueUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  {h.gainUSD !== 0 && (
                    <p className={`text-[10px] font-medium ${h.gainUSD >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {h.gainUSD >= 0 ? '+' : ''}${h.gainUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {!inrRate && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Could not fetch live USD/INR rate. Values will use a fallback rate.
            </p>
          )}

          <div className="flex gap-3 pt-2 border-t border-surface-100">
            <button onClick={reset} className="btn-ghost flex items-center gap-1.5 text-xs">
              <RefreshCw size={12}/> Upload different file
            </button>
            <button onClick={doImport} disabled={!inrRate} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
              <CheckCircle size={14}/> Save to my portfolio
            </button>
          </div>
        </div>
      )}

      {imported && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 flex flex-col items-center gap-2 text-center">
          <CheckCircle size={24} className="text-emerald-500" />
          <p className="font-semibold text-emerald-800">{result?.holdings.length} US holding{(result?.holdings.length ?? 0) > 1 ? 's' : ''} saved</p>
          <p className="text-xs text-emerald-600">They now appear under International in your Asset Allocation.</p>
          <button onClick={reset} className="text-xs text-emerald-600 underline mt-1">Import another file</button>
        </div>
      )}
    </div>
  )
}

// ─── Main accordion ─────────────────────────────────────────────────────────────

export default function DataManagement() {
  const [open,        setOpen]        = useState(false)
  const [activeTab,   setActiveTab]   = useState('zerodha')
  const [confirmingReset, setConfirmingReset] = useState(false)
  const { replaceData } = useApp()

  function handleResetAll() {
    if (!confirmingReset) { setConfirmingReset(true); return }
    replaceData(DEFAULT_DATA)
    setConfirmingReset(false)
  }

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-5 hover:bg-surface-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
            <Database size={15} className="text-surface-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-surface-800">Manage Your Data</p>
            <p className="text-xs text-surface-400">Import statements, add snapshots, track loans and goals</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {confirmingReset && <span className="text-[11px] text-rose-500 font-medium">Tap again to confirm</span>}
          <button
            onClick={e => { e.stopPropagation(); handleResetAll() }}
            onBlur={() => setConfirmingReset(false)}
            className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors
              ${confirmingReset ? 'border-rose-400 bg-rose-50 text-rose-600' : 'border-surface-200 text-surface-400 hover:text-rose-500 hover:border-rose-200'}`}>
            Reset all
          </button>
          {open ? <ChevronUp size={16} className="text-surface-400" /> : <ChevronDown size={16} className="text-surface-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-surface-100 animate-fade-up">
          <div className="flex overflow-x-auto border-b border-surface-100 px-5 gap-0">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`shrink-0 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap
                  ${activeTab === t.id
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-surface-400 hover:text-surface-700'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-5">
            {activeTab === 'zerodha'   && <ZerodhaTab />}
            {activeTab === 'fidelity'  && <FidelityTab />}
            {activeTab === 'import'    && <section id="section-import"><ImportCard /></section>}
            {activeTab === 'networth'  && <section id="section-networth"><NetWorthCard /></section>}
            {activeTab === 'cashflow'  && <section id="section-cashflow"><CashFlowCard /></section>}
            {activeTab === 'debt'      && <section id="section-debt"><DebtCard /></section>}
            {activeTab === 'scenarios' && <section id="section-scenarios"><ScenarioPanel /></section>}
            {activeTab === 'sip'       && <SipCalculator />}
          </div>
        </div>
      )}
    </div>
  )
}
