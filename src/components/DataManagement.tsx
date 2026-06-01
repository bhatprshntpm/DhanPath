import { useState, useRef } from 'react'
import {
  ChevronDown, ChevronRight, Upload, CheckCircle, Loader2, X,
  RefreshCw, RotateCcw, TrendingUp, Landmark, Coins, DollarSign, Wallet,
} from 'lucide-react'
import ImportCard from './ImportCard'
import DebtCard from './DebtCard'
import SipCalculator from './SipCalculator'
import ScenarioPanel from './ScenarioPanel'
import PortfolioBreakdown from './PortfolioBreakdown'
import { parseZerodhaXLSX, zerodhaToHoldings, zerodhaToSnapshot } from '../lib/zerodhaXLSXParser'
import type { ZerodhaParseResult } from '../lib/zerodhaXLSXParser'
import { parseFidelityPDF, fidelityToHoldings } from '../lib/fidelityPDFParser'
import type { FidelityParseResult } from '../lib/fidelityPDFParser'
import { parseEPFPDF, epfToSnapshot, epfToTransactions, epfToHolding, epfToMonthlySnapshots } from '../lib/epfParser'
import type { EPFParseResult } from '../lib/epfParser'
import { useApp } from '../context/AppContext'
import { DEFAULT_DATA } from '../lib/storage'
import { fmtINR } from '../lib/calc'

// ─── Shared upload zone ───────────────────────────────────────────────────────
function DropZone({ accept, color, onFile, label }: {
  accept: string; color: string; onFile: (f: File) => void; label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div
      className={`border-2 border-dashed rounded-2xl p-7 flex flex-col items-center gap-3 cursor-pointer transition-all
        border-surface-200 hover:border-${color}-400 hover:bg-${color}-50/20`}
      onClick={() => ref.current?.click()}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}>
      <Upload size={22} className="text-surface-300" />
      <div className="text-center">
        <p className="text-sm font-semibold text-surface-700">{label}</p>
        <p className="text-xs text-surface-400 mt-0.5">or click to browse</p>
      </div>
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
    </div>
  )
}

// ─── Zerodha ──────────────────────────────────────────────────────────────────
function ZerodhaContent() {
  const { data, replaceHoldings, addOrUpdateSnapshot } = useApp()
  const [parsing,  setParsing]  = useState(false)
  const [result,   setResult]   = useState<ZerodhaParseResult | null>(null)
  const [imported, setImported] = useState(false)
  const [clearing, setClearing] = useState(false)
  const zerodhaHoldings = data.holdings.filter(h => h.assetClass !== 'International' && h.subType !== 'US RSU / Stock' && h.subType !== 'EPF')
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

  async function handleFile(f: File) {
    setParsing(true); setResult(null); setImported(false)
    setResult(await parseZerodhaXLSX(f))
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
    replaceHoldings(data.holdings.filter(h => h.subType === 'US RSU / Stock' || h.subType === 'EPF'))
    setClearing(false); setResult(null); setImported(false)
  }

  return (
    <div className="flex flex-col gap-4">
      {zerodhaHoldings.length > 0 && !result && (
        <div className="flex items-center justify-between px-3 py-2 bg-surface-50 rounded-xl border border-surface-100">
          <p className="text-xs text-surface-600">
            <span className="font-semibold">{zerodhaHoldings.length} holdings</span> imported · {today}
          </p>
          <button onClick={doClear} onBlur={() => setClearing(false)}
            className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors
              ${clearing ? 'border-rose-400 bg-rose-50 text-rose-600 font-semibold' : 'border-surface-200 text-surface-400 hover:text-rose-500 hover:border-rose-200'}`}>
            {clearing ? 'Tap again to confirm' : 'Clear'}
          </button>
        </div>
      )}

      <div className="bg-[#387ed1]/5 border border-[#387ed1]/20 rounded-xl p-3.5 text-xs text-surface-700 flex flex-col gap-1">
        <p className="font-semibold text-surface-800">How to download</p>
        <p>1. <a href="https://console.zerodha.com/portfolio/holdings" target="_blank" rel="noreferrer" className="text-[#387ed1] underline">Zerodha Console → Portfolio → Holdings</a></p>
        <p>2. Click <strong>Download</strong> → <strong>Excel (.xlsx)</strong></p>
        <p className="text-surface-400">File stays on your device.</p>
      </div>

      {!result && !parsing && <DropZone accept=".xlsx,.xls" color="amber" onFile={handleFile} label="Drop your Zerodha holdings XLSX" />}

      {parsing && (
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <Loader2 size={20} className="animate-spin text-amber-500" />
          <span className="text-sm text-surface-600">Parsing holdings…</span>
        </div>
      )}

      {result?.status === 'error' && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <X size={16} className="text-rose-500 shrink-0 mt-0.5" />
          <div><p className="text-sm font-semibold text-rose-700">Parse failed</p>
            <p className="text-xs text-rose-600 mt-1">{result.message}</p>
            <button onClick={() => setResult(null)} className="text-xs text-rose-600 underline mt-2">Try again</button>
          </div>
        </div>
      )}

      {result?.status === 'success' && !imported && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-surface-50 rounded-xl text-center">
              <p className="text-xs text-surface-400 mb-0.5">Value</p>
              <p className="text-sm font-bold">{fmtINR(result.summary.totalValue)}</p>
            </div>
            <div className="p-3 bg-surface-50 rounded-xl text-center">
              <p className="text-xs text-surface-400 mb-0.5">Invested</p>
              <p className="text-sm font-bold">{fmtINR(result.summary.totalCost)}</p>
            </div>
            <div className={`p-3 rounded-xl text-center ${result.summary.totalUnrealised >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
              <p className="text-xs text-surface-400 mb-0.5">P&amp;L</p>
              <p className={`text-sm font-bold ${result.summary.totalUnrealised >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                {result.summary.totalUnrealised >= 0 ? '+' : ''}{fmtINR(result.summary.totalUnrealised)}
              </p>
            </div>
          </div>
          <PortfolioBreakdown holdings={result.holdings} importedAt={today} />
          <div className="flex gap-3 pt-2 border-t border-surface-100">
            <button onClick={() => setResult(null)} className="btn-ghost flex items-center gap-1.5 text-xs">
              <RefreshCw size={12} /> Different file
            </button>
            <button onClick={doImport} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <CheckCircle size={14} /> Save {result.holdings.length} holdings
            </button>
          </div>
        </div>
      )}

      {imported && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 flex flex-col items-center gap-2 text-center">
          <CheckCircle size={24} className="text-emerald-500" />
          <p className="font-semibold text-emerald-800">{result?.holdings.length} holdings saved</p>
          <button onClick={() => { setResult(null); setImported(false) }} className="text-xs text-emerald-600 underline">Import another file</button>
        </div>
      )}
    </div>
  )
}

// ─── Fidelity ─────────────────────────────────────────────────────────────────
function FidelityContent() {
  const { data, upsertHoldings, deleteHolding } = useApp()
  const fidelityHoldings = data.holdings.filter(h => h.subType === 'US RSU / Stock')
  const [parsing,  setParsing]  = useState(false)
  const [result,   setResult]   = useState<FidelityParseResult | null>(null)
  const [imported, setImported] = useState(false)
  const [inrRate,  setInrRate]  = useState<number | null>(null)

  async function handleFile(f: File) {
    setParsing(true); setResult(null); setImported(false)
    const r = await parseFidelityPDF(f)
    try {
      const fx = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
      setInrRate((await fx.json())?.rates?.INR ?? null)
    } catch { setInrRate(null) }
    setResult(r); setParsing(false)
  }
  function doImport() {
    if (!result || !inrRate) return
    upsertHoldings(fidelityToHoldings(result, inrRate))
    setImported(true)
  }

  return (
    <div className="flex flex-col gap-4">
      {fidelityHoldings.length > 0 && !result && (
        <div className="flex flex-col gap-1.5 px-3 py-2.5 bg-surface-50 rounded-xl border border-surface-100">
          <p className="text-xs font-semibold text-surface-600">Currently in portfolio</p>
          {fidelityHoldings.map(h => (
            <div key={h.id} className="flex items-center justify-between">
              <span className="text-xs text-surface-700 font-medium">{h.name} <span className="text-surface-300 font-mono">{h.ticker}</span></span>
              <button onClick={() => deleteHolding(h.id)} className="text-[10px] text-surface-300 hover:text-rose-400 px-1.5 py-0.5 rounded border border-transparent hover:border-rose-200 transition-colors">Remove</button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3.5 text-xs text-surface-700 flex flex-col gap-1">
        <p className="font-semibold text-surface-800">How to download</p>
        <p>1. Log in to <strong>netbenefits.fidelity.com</strong></p>
        <p>2. <strong>Statements</strong> → latest quarterly report → Download PDF</p>
        <p className="text-surface-400">Supports RSU / ESPP Stock Plan Services Reports.</p>
      </div>

      {!result && !parsing && <DropZone accept=".pdf" color="blue" onFile={handleFile} label="Drop your Fidelity statement PDF" />}

      {parsing && (
        <div className="flex items-center justify-center gap-3 py-10">
          <Loader2 size={20} className="animate-spin text-blue-500" />
          <span className="text-sm text-surface-600">Reading Fidelity statement…</span>
        </div>
      )}

      {result?.status === 'error' && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <X size={16} className="text-rose-500 shrink-0 mt-0.5" />
          <div><p className="text-sm font-semibold text-rose-700">Parse failed</p>
            <p className="text-xs text-rose-600 mt-1">{result.message}</p>
            <button onClick={() => setResult(null)} className="text-xs text-rose-600 underline mt-2">Try again</button>
          </div>
        </div>
      )}

      {result?.status === 'success' && !imported && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-surface-50 rounded-xl text-center">
              <p className="text-xs text-surface-400 mb-0.5">Value (USD)</p>
              <p className="text-sm font-bold">${result.totalUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="p-3 bg-surface-50 rounded-xl text-center">
              <p className="text-xs text-surface-400 mb-0.5">Value (INR)</p>
              <p className="text-sm font-bold">{inrRate ? fmtINR(result.totalUSD * inrRate) : '—'}</p>
              {inrRate && <p className="text-[10px] text-surface-300 mt-0.5">1 USD = ₹{inrRate.toFixed(1)}</p>}
            </div>
          </div>
          <div className="flex flex-col divide-y divide-surface-50 rounded-xl border border-surface-100 overflow-hidden">
            {result.holdings.map((h, i) => (
              <div key={`${h.ticker}-${i}`} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-surface-800">{h.name.split(' ').map((w: string) => w[0] + w.slice(1).toLowerCase()).join(' ')}</p>
                  <p className="text-[10px] text-surface-400 font-mono">{h.ticker} · {h.qty > 0 ? `${h.qty % 1 === 0 ? h.qty : h.qty.toFixed(3)} shares` : 'position'}{h.priceUSD > 0 ? ` @ $${h.priceUSD.toFixed(2)}` : ''}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold font-mono">${h.valueUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                  {h.gainUSD !== 0 && <p className={`text-[10px] font-medium ${h.gainUSD >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{h.gainUSD >= 0 ? '+' : ''}${h.gainUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>}
                </div>
              </div>
            ))}
          </div>
          {!inrRate && <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Could not fetch live USD/INR rate.</p>}
          <div className="flex gap-3 pt-2 border-t border-surface-100">
            <button onClick={() => setResult(null)} className="btn-ghost flex items-center gap-1.5 text-xs"><RefreshCw size={12} /> Different file</button>
            <button onClick={doImport} disabled={!inrRate} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
              <CheckCircle size={14} /> Save to portfolio
            </button>
          </div>
        </div>
      )}

      {imported && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 flex flex-col items-center gap-2 text-center">
          <CheckCircle size={24} className="text-emerald-500" />
          <p className="font-semibold text-emerald-800">{result?.holdings.length} US holding{(result?.holdings.length ?? 0) > 1 ? 's' : ''} saved</p>
          <button onClick={() => { setResult(null); setImported(false) }} className="text-xs text-emerald-600 underline">Import another file</button>
        </div>
      )}
    </div>
  )
}

// ─── EPF ──────────────────────────────────────────────────────────────────────
function EPFContent() {
  const { data, addSnapshot, addTransaction, upsertHoldings, addOrUpdateSnapshot, deleteHolding } = useApp()
  const epfHoldings = data.holdings.filter(h => h.subType === 'EPF')
  const [parsing,  setParsing]  = useState(false)
  const [result,   setResult]   = useState<EPFParseResult | null>(null)
  const [imported, setImported] = useState(false)
  const [password, setPassword] = useState('')
  const [manualBal, setManualBal] = useState('')
  const [manualInv, setManualInv] = useState('')
  const [manualSaved, setManualSaved] = useState(false)
  const showFallback = result?.status === 'no_data' || result?.status === 'parse_error'

  async function handleFile(f: File) {
    setParsing(true); setResult(null); setImported(false)
    try { setResult(await parseEPFPDF(f, password || undefined)) }
    catch (e: any) { setResult({ status: 'parse_error', message: String(e?.message ?? 'Failed'), uan: '', pan: '', memberName: '', establishmentName: '', totalBalance: 0, employeeBalance: 0, employerBalance: 0, pensionBalance: 0, entries: [] }) }
    setParsing(false)
  }
  function doImport() {
    if (!result || result.status !== 'success') return
    addSnapshot(epfToSnapshot(result))
    epfToTransactions(result).forEach(t => addTransaction(t))
    upsertHoldings([epfToHolding(result)])
    epfToMonthlySnapshots(result).forEach(s => addOrUpdateSnapshot(s))
    setImported(true)
  }
  function saveManual() {
    if (!manualBal) return
    upsertHoldings([{ name: 'EPF', ticker: 'EPF-MANUAL', type: 'retirement', subType: 'EPF', qty: 1, lastPrice: parseFloat(manualBal), value: Math.round(parseFloat(manualBal)), costBasis: Math.round(parseFloat(manualInv || manualBal)) }])
    setManualSaved(true)
    setTimeout(() => setManualSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      {epfHoldings.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-surface-50 rounded-xl border border-surface-100">
          <div>
            <p className="text-xs font-semibold text-surface-600">EPF · {fmtINR(epfHoldings.reduce((a, h) => a + h.value, 0))}</p>
            <p className="text-[10px] text-surface-400">{epfHoldings[0]?.ticker !== 'EPF-MANUAL' ? `UAN ${epfHoldings[0]?.ticker}` : 'Manual entry'}</p>
          </div>
          <button onClick={() => epfHoldings.forEach(h => deleteHolding(h.id))} className="text-[11px] px-2.5 py-1 rounded-lg border border-surface-200 text-surface-400 hover:text-rose-500 hover:border-rose-200 transition-colors">Clear</button>
        </div>
      )}

      <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-3.5 text-xs text-surface-700 flex flex-col gap-1">
        <p className="font-semibold text-surface-800">How to download EPF passbook</p>
        <p>1. <strong>passbook.epfindia.gov.in</strong> → select member ID → Download PDF</p>
        <p className="text-surface-400">Password: your UAN or date of birth (DDMMYYYY)</p>
      </div>

      {!result && !parsing && (
        <div className="flex flex-col gap-2">
          <DropZone accept=".pdf" color="orange" onFile={handleFile} label="Drop your EPF passbook PDF" />
          <input className="input-field text-sm" placeholder="PDF password (UAN or DDMMYYYY) — leave blank if none" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
      )}

      {parsing && <div className="flex items-center justify-center gap-3 py-10"><Loader2 size={18} className="animate-spin text-orange-500" /><span className="text-sm text-surface-600">Reading passbook…</span></div>}

      {result?.status === 'password_required' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-2">
          <p className="text-xs font-semibold text-amber-700">Password required</p>
          <input className="input-field text-sm" placeholder="Enter UAN or DDMMYYYY" value={password} onChange={e => setPassword(e.target.value)} />
          <button onClick={() => setResult(null)} className="btn-primary text-xs">Re-upload with password</button>
        </div>
      )}

      {showFallback && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex flex-col gap-2">
          <p className="text-xs font-semibold text-rose-700">Could not parse PDF automatically</p>
          <p className="text-xs text-rose-600">{result?.message}</p>
          <button onClick={() => setResult(null)} className="text-xs text-rose-600 underline">Try a different file</button>
        </div>
      )}

      {result?.status === 'success' && !imported && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-surface-50 rounded-xl text-center"><p className="text-xs text-surface-400 mb-0.5">EPF Balance</p><p className="text-sm font-bold">{fmtINR(result.totalBalance)}</p></div>
            <div className="p-3 bg-surface-50 rounded-xl text-center"><p className="text-xs text-surface-400 mb-0.5">Employee</p><p className="text-sm font-bold">{fmtINR(result.employeeBalance)}</p></div>
            <div className="p-3 bg-surface-50 rounded-xl text-center"><p className="text-xs text-surface-400 mb-0.5">History</p><p className="text-sm font-bold">{result.entries.length} months</p></div>
          </div>
          {result.memberName && <p className="text-xs text-surface-500">{result.memberName} · UAN {result.uan}</p>}
          <button onClick={doImport} className="btn-primary flex items-center justify-center gap-2"><CheckCircle size={14} /> Save EPF data</button>
        </div>
      )}

      {imported && <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center text-sm text-emerald-700 font-medium flex items-center justify-center gap-2"><CheckCircle size={16} /> EPF balance saved</div>}

      <div className="border-t border-surface-100 pt-4">
        <p className="text-xs font-semibold text-surface-500 mb-3">{showFallback ? 'Enter balance manually instead' : 'Or enter manually'}</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-semibold text-surface-400 uppercase tracking-widest block mb-1.5">Current Balance (₹)</label>
            <input className="input-field" type="number" placeholder="e.g. 850000" value={manualBal} onChange={e => setManualBal(e.target.value)} /></div>
          <div><label className="text-xs font-semibold text-surface-400 uppercase tracking-widest block mb-1.5">Total Invested (₹)</label>
            <input className="input-field" type="number" placeholder="optional" value={manualInv} onChange={e => setManualInv(e.target.value)} /></div>
        </div>
        <button onClick={saveManual} disabled={!manualBal} className="btn-primary mt-3 w-full disabled:opacity-40 flex items-center justify-center gap-2">
          {manualSaved ? <><CheckCircle size={14} /> Saved!</> : 'Save EPF manually'}
        </button>
      </div>
    </div>
  )
}

// ─── PPF / NPS ────────────────────────────────────────────────────────────────
const RETIREMENT_TYPES = [
  { id: 'PPF',      label: 'PPF',           hint: 'Public Provident Fund' },
  { id: 'NPS',      label: 'NPS',           hint: 'National Pension Scheme' },
  { id: 'VPF',      label: 'VPF',           hint: 'Voluntary Provident Fund' },
  { id: 'Gratuity', label: 'Gratuity',      hint: 'Employer gratuity' },
  { id: 'Pension',  label: 'Pension Corpus',hint: 'Other pension fund' },
]

function RetirementContent() {
  const { addHolding } = useApp()
  const [type,      setType]      = useState('PPF')
  const [balance,   setBalance]   = useState('')
  const [costBasis, setCostBasis] = useState('')
  const [saved,     setSaved]     = useState(false)

  function save() {
    if (!balance) return
    addHolding({ name: type, ticker: '', type: 'retirement', assetClass: 'Debt', subType: type, qty: 1, lastPrice: parseFloat(balance), value: Math.round(parseFloat(balance)), costBasis: Math.round(parseFloat(costBasis || balance)) })
    setSaved(true)
    setTimeout(() => { setSaved(false); setBalance(''); setCostBasis('') }, 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-surface-400">Update your PPF / NPS balance manually every quarter.</p>
      <div className="flex gap-2 flex-wrap">
        {RETIREMENT_TYPES.map(t => (
          <button key={t.id} onClick={() => setType(t.id)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors
              ${type === t.id ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-surface-200 text-surface-500 hover:border-amber-300'}`}>
            {t.label} <span className="text-surface-300 font-normal">· {t.hint}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs font-semibold text-surface-400 uppercase tracking-widest block mb-1.5">Balance (₹)</label>
          <input className="input-field" type="number" placeholder="e.g. 450000" value={balance} onChange={e => setBalance(e.target.value)} /></div>
        <div><label className="text-xs font-semibold text-surface-400 uppercase tracking-widest block mb-1.5">Invested (₹) <span className="normal-case font-normal">optional</span></label>
          <input className="input-field" type="number" placeholder="e.g. 380000" value={costBasis} onChange={e => setCostBasis(e.target.value)} /></div>
      </div>
      <button onClick={save} disabled={!balance} className="btn-primary disabled:opacity-40 flex items-center justify-center gap-2">
        {saved ? <><CheckCircle size={14} /> Saved!</> : `Add ${type} balance`}
      </button>
    </div>
  )
}

// ─── Crypto ───────────────────────────────────────────────────────────────────
const CRYPTO_LIST = [
  { symbol: 'BTC', name: 'Bitcoin' }, { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'SOL', name: 'Solana' },  { symbol: 'BNB', name: 'BNB' },
  { symbol: 'XRP', name: 'XRP' },     { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'AVAX',name: 'Avalanche'},{ symbol: 'DOT', name: 'Polkadot' },
  { symbol: 'MATIC',name: 'Polygon' },{ symbol: 'LINK',name: 'Chainlink'},
  { symbol: 'DOGE',name: 'Dogecoin' },{ symbol: 'SHIB',name: 'Shiba Inu'},
  { symbol: 'USDT',name: 'Tether'   },{ symbol: 'USDC',name: 'USD Coin' },
]

function CryptoContent() {
  const { data, addHolding, deleteHolding } = useApp()
  const [symbol, setSymbol] = useState('BTC')
  const [custom, setCustom] = useState('')
  const [qty,    setQty]    = useState('')
  const [cost,   setCost]   = useState('')
  const [saved,  setSaved]  = useState(false)
  const cryptoHoldings = data.holdings.filter(h => h.assetClass === 'Cryptocurrency' || h.type === 'crypto')

  function save() {
    const sym = custom.toUpperCase() || symbol
    if (!sym || !qty) return
    const coin = CRYPTO_LIST.find(c => c.symbol === sym)
    addHolding({ name: coin ? `${coin.name} (${sym})` : sym, ticker: sym, type: 'crypto', assetClass: 'Cryptocurrency', subType: 'Cryptocurrency', qty: parseFloat(qty), value: Math.round(parseFloat(cost || '0')), costBasis: Math.round(parseFloat(cost || '0')) })
    setSaved(true)
    setTimeout(() => { setSaved(false); setQty(''); setCost(''); setCustom('') }, 2000)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-surface-400">Add crypto holdings manually — prices refresh via Yahoo Finance / CoinGecko.</p>
      {cryptoHoldings.length > 0 && (
        <div className="flex flex-col gap-1 p-3 bg-surface-50 rounded-xl border border-surface-100">
          <p className="text-xs font-semibold text-surface-600 mb-1">Saved</p>
          {cryptoHoldings.map(h => (
            <div key={h.id} className="flex items-center justify-between">
              <span className="text-xs text-surface-700">{h.name} · <span className="font-mono text-surface-400">{h.qty} units</span></span>
              <button onClick={() => deleteHolding(h.id)} className="text-[10px] text-surface-300 hover:text-rose-400 px-1.5 py-0.5 rounded border border-transparent hover:border-rose-200 transition-colors">Remove</button>
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {CRYPTO_LIST.map(c => (
            <button key={c.symbol} onClick={() => { setSymbol(c.symbol); setCustom('') }}
              className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors
                ${symbol === c.symbol && !custom ? 'border-amber-400 bg-amber-50 text-amber-700' : 'border-surface-200 text-surface-500 hover:border-amber-300'}`}>
              {c.symbol}
            </button>
          ))}
        </div>
        <input className="input-field text-xs" placeholder="Or type any symbol e.g. PEPE, WLD" value={custom} onChange={e => setCustom(e.target.value.toUpperCase())} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs font-semibold text-surface-400 uppercase tracking-widest block mb-1.5">Quantity</label>
          <input className="input-field" type="number" placeholder="e.g. 0.05" value={qty} onChange={e => setQty(e.target.value)} /></div>
        <div><label className="text-xs font-semibold text-surface-400 uppercase tracking-widest block mb-1.5">Cost Basis (₹) <span className="normal-case font-normal">optional</span></label>
          <input className="input-field" type="number" placeholder="Amount invested" value={cost} onChange={e => setCost(e.target.value)} /></div>
      </div>
      <button onClick={save} disabled={!qty || (!symbol && !custom)} className="btn-primary disabled:opacity-40 flex items-center justify-center gap-2">
        {saved ? <><CheckCircle size={14} /> Saved!</> : `Add ${custom || symbol}`}
      </button>
    </div>
  )
}

// ─── Source row accordion ─────────────────────────────────────────────────────
function SourceRow({ icon, label, statusLabel, connected, color, children, onClear }: {
  icon: React.ReactNode; label: string; statusLabel: string
  connected: boolean; color: string; children: React.ReactNode
  onClear?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirming) { setConfirming(true); return }
    onClear?.(); setConfirming(false)
  }
  return (
    <div className="border-b border-surface-50 last:border-0">
      <div
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 py-3.5 px-5 hover:bg-surface-50/60 transition-colors cursor-pointer">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-${color}-100`}>
          <span className={`text-${color}-600`}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-surface-800">{label}</p>
          <p className={`text-[11px] mt-0.5 ${connected ? 'text-emerald-600' : 'text-surface-400'}`}>
            {connected && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 mb-px" />}
            {statusLabel}
          </p>
        </div>
        {connected && onClear && (
          <button onClick={handleClear} onBlur={() => setConfirming(false)}
            className={`text-[10px] px-2 py-1 rounded-lg border transition-colors shrink-0
              ${confirming ? 'border-rose-400 bg-rose-50 text-rose-600 font-semibold' : 'border-surface-200 text-surface-300 hover:text-rose-400 hover:border-rose-200'}`}>
            {confirming ? 'Confirm clear' : 'Clear'}
          </button>
        )}
        {open ? <ChevronDown size={15} className="text-surface-400 shrink-0" /> : <ChevronRight size={15} className="text-surface-400 shrink-0" />}
      </div>
      {open && <div className="px-5 pb-5 animate-fade-up">{children}</div>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DataManagement() {
  const [open, setOpen]                       = useState(false)
  const [showExtra, setShowExtra]             = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const { data, replaceData } = useApp()

  const zerodhaCount   = data.holdings.filter(h => h.subType !== 'US RSU / Stock' && h.subType !== 'EPF').length
  const fidelityCount  = data.holdings.filter(h => h.subType === 'US RSU / Stock').length
  const epfHoldings    = data.holdings.filter(h => h.subType === 'EPF')
  const ppfHoldings    = data.holdings.filter(h => ['PPF','NPS','VPF','Gratuity','Pension'].includes(h.subType ?? ''))
  const cryptoCount    = data.holdings.filter(h => h.type === 'crypto').length

  function handleResetAll() {
    if (!confirmingReset) { setConfirmingReset(true); return }
    replaceData(DEFAULT_DATA)
    setConfirmingReset(false)
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-5 hover:bg-surface-50 transition-colors">
        <div className="text-left">
          <p className="text-sm font-semibold text-surface-800">Data Sources</p>
          <p className="text-xs text-surface-400 mt-0.5">
            {[zerodhaCount > 0 && `Zerodha (${zerodhaCount})`, fidelityCount > 0 && `Fidelity (${fidelityCount})`, epfHoldings.length > 0 && 'EPF', ppfHoldings.length > 0 && 'PPF/NPS', cryptoCount > 0 && `Crypto (${cryptoCount})`].filter(Boolean).join(' · ') || 'No data imported yet'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {confirmingReset && <span className="text-[11px] text-rose-500 font-medium">Tap again to confirm</span>}
          <button
            onClick={e => { e.stopPropagation(); handleResetAll() }}
            onBlur={() => setConfirmingReset(false)}
            className={`flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg border transition-colors
              ${confirmingReset ? 'border-rose-400 bg-rose-50 text-rose-600' : 'border-surface-200 text-surface-400 hover:text-rose-500 hover:border-rose-200'}`}>
            <RotateCcw size={10} /> Reset all
          </button>
          {open ? <ChevronDown size={16} className="text-surface-400" /> : <ChevronRight size={16} className="text-surface-400" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-surface-100 animate-fade-up">
          {/* Data source rows */}
          <SourceRow icon={<TrendingUp size={15} />} label="Zerodha Holdings" color="amber"
            connected={zerodhaCount > 0} statusLabel={zerodhaCount > 0 ? `${zerodhaCount} holdings imported` : 'Not connected — import XLSX'}
            onClear={zerodhaCount > 0 ? () => replaceData({ ...data, holdings: data.holdings.filter(h => h.subType === 'US RSU / Stock' || h.subType === 'EPF') }) : undefined}>
            <ZerodhaContent />
          </SourceRow>

          <SourceRow icon={<DollarSign size={15} />} label="Fidelity / US RSUs" color="blue"
            connected={fidelityCount > 0} statusLabel={fidelityCount > 0 ? `${fidelityCount} US holding${fidelityCount > 1 ? 's' : ''}` : 'Not connected — import PDF'}
            onClear={fidelityCount > 0 ? () => replaceData({ ...data, holdings: data.holdings.filter(h => h.subType !== 'US RSU / Stock') }) : undefined}>
            <FidelityContent />
          </SourceRow>

          <SourceRow icon={<Landmark size={15} />} label="EPF Passbook" color="orange"
            connected={epfHoldings.length > 0} statusLabel={epfHoldings.length > 0 ? `${fmtINR(epfHoldings.reduce((a, h) => a + h.value, 0))} saved` : 'Not added — import PDF or enter manually'}
            onClear={epfHoldings.length > 0 ? () => replaceData({ ...data, holdings: data.holdings.filter(h => h.subType !== 'EPF') }) : undefined}>
            <EPFContent />
          </SourceRow>

          <SourceRow icon={<Wallet size={15} />} label="PPF / NPS / VPF" color="indigo"
            connected={ppfHoldings.length > 0} statusLabel={ppfHoldings.length > 0 ? ppfHoldings.map(h => `${h.subType} ${fmtINR(h.value)}`).join(' · ') : 'Not added — enter manually'}
            onClear={ppfHoldings.length > 0 ? () => replaceData({ ...data, holdings: data.holdings.filter(h => !['PPF','NPS','VPF','Gratuity','Pension'].includes(h.subType ?? '')) }) : undefined}>
            <RetirementContent />
          </SourceRow>

          <SourceRow icon={<Coins size={15} />} label="Cryptocurrency" color="pink"
            connected={cryptoCount > 0} statusLabel={cryptoCount > 0 ? `${cryptoCount} coin${cryptoCount > 1 ? 's' : ''}` : 'Not added — add manually'}
            onClear={cryptoCount > 0 ? () => replaceData({ ...data, holdings: data.holdings.filter(h => h.type !== 'crypto') }) : undefined}>
            <CryptoContent />
          </SourceRow>

          {/* Other tools */}
          <div className="px-5 py-3 border-t border-surface-100">
            <button
              onClick={() => setShowExtra(v => !v)}
              className="flex items-center gap-1.5 text-xs font-medium text-surface-400 hover:text-surface-700 transition-colors mb-3">
              {showExtra ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              Other tools — Loans · Scenarios · SIP Calculator · Import (CAS / Bank)
            </button>
            {showExtra && (
              <div className="flex flex-col gap-6 animate-fade-up">
                <section id="section-import"><ImportCard /></section>
                <section id="section-debt"><DebtCard /></section>
                <section id="section-scenarios"><ScenarioPanel /></section>
                <SipCalculator />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
