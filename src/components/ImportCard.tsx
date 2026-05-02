import { useState, useRef } from 'react'
import {
  Upload, FileText, AlertTriangle, CheckCircle,
  Loader2, X, ChevronDown, ChevronUp, RefreshCw,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmt } from '../lib/calc'

import { parseCASPDF, casResultToHoldings, casResultToTransactions, casResultToSnapshot } from '../lib/casParser'
import { parseBankCSV, bankTxnsToAppTransactions } from '../lib/bankCSVParser'
import { parseEquityCSV, equityHoldingsToAppHoldings, equityTradesToAppTransactions } from '../lib/equityCSVParser'
import { parseNSDLCDSLPDF, dematToAppHoldings } from '../lib/nsdlParser'
import { parseEPFPDF, epfToSnapshot, epfToTransactions } from '../lib/epfParser'

// ─── Shared helpers ───────────────────────────────────────────────────────────

type Step = 'idle' | 'parsing' | 'preview' | 'done' | 'error'

interface StatusBannerProps { status: Step; message: string }
function StatusBanner({ status, message }: StatusBannerProps) {
  if (status === 'parsing') return (
    <div className="flex flex-col items-center gap-3 py-8">
      <Loader2 size={28} className="animate-spin text-amber-500" />
      <p className="text-sm font-medium text-surface-800">Analysing file…</p>
    </div>
  )
  if (status === 'done') return (
    <div className="flex flex-col items-center gap-3 py-6">
      <CheckCircle size={28} className="text-emerald-500" />
      <p className="text-sm font-semibold text-emerald-700">Import complete!</p>
      <p className="text-xs text-surface-300 text-center max-w-xs">{message}</p>
    </div>
  )
  if (status === 'error') return (
    <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  )
  return null
}

function KPI({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className={`rounded-xl p-3 border ${good ? 'bg-emerald-50 border-emerald-100' : 'bg-surface-50 border-surface-100'}`}>
      <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${good ? 'text-emerald-700' : 'text-surface-400'}`}>{value}</p>
    </div>
  )
}

function FileDropZone({ onFile, accept, hint }: { onFile: (f: File) => void; accept: string; hint: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div
      className="border-2 border-dashed border-surface-200 rounded-2xl p-8 flex flex-col items-center gap-2 cursor-pointer hover:border-amber-400 hover:bg-amber-50/40 transition-colors"
      onClick={() => ref.current?.click()}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onFile(f) }}
    >
      <FileText size={24} className="text-surface-300" />
      <p className="text-sm text-surface-300">Drop file here or <span className="text-amber-600 font-medium">browse</span></p>
      <p className="text-xs text-surface-300">{hint}</p>
      <input ref={ref} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </div>
  )
}

// ─── Tab: MF CAS PDF ──────────────────────────────────────────────────────────
function MFCASTab() {
  const { addHolding, addTransaction, addSnapshot } = useApp()
  const [file, setFile]     = useState<File | null>(null)
  const [pass, setPass]     = useState('')
  const [step, setStep]     = useState<Step>('idle')
  const [result, setResult] = useState<any>(null)
  const [opts, setOpts]     = useState({ holdings: true, transactions: true, snapshot: true })

  async function parse() {
    if (!file) return
    setStep('parsing')
    const r = await parseCASPDF(file, pass || undefined)
    setResult(r)
    setStep(r.status === 'success' ? 'preview' : 'error')
  }

  function doImport() {
    if (!result) return
    if (opts.snapshot && result.totalValue > 0) addSnapshot(casResultToSnapshot(result))
    if (opts.holdings)     casResultToHoldings(result).forEach((h: any) => addHolding(h))
    if (opts.transactions) casResultToTransactions(result).forEach((t: any) => addTransaction(t))
    setStep('done')
  }

  function reset() { setStep('idle'); setResult(null); setFile(null); setPass('') }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800 flex flex-col gap-1">
        <p className="font-semibold">How to get your CAMS / KFintech CAS</p>
        <p>→ <a href="https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement" target="_blank" rel="noreferrer" className="underline">CAMS portal</a> — Login → Statements → CAS → Detailed</p>
        <p>→ <a href="https://mfs.kfintech.com/investor/General/ConsolidatedAccountStatement" target="_blank" rel="noreferrer" className="underline">KFintech portal</a> — Login → Statements → CAS</p>
        <p className="text-amber-600 mt-1">Password is usually your PAN in UPPERCASE (e.g. ABCDE1234F)</p>
      </div>

      {step === 'idle' || step === 'error' ? (
        <div className="flex flex-col gap-3">
          {!file ? <FileDropZone onFile={setFile} accept=".pdf" hint="CAMS or KFintech CAS PDF" />
            : <div className="flex items-center gap-2 p-3 bg-surface-50 rounded-xl text-sm">
                <FileText size={16} className="text-amber-500" />
                <span className="font-medium text-surface-800">{file.name}</span>
                <button onClick={() => setFile(null)} className="ml-auto text-surface-300 hover:text-rose-400"><X size={14}/></button>
              </div>
          }
          <input className="input-field font-mono uppercase tracking-widest" placeholder="Password (PAN, e.g. ABCDE1234F)"
            value={pass} onChange={e => setPass(e.target.value.toUpperCase())} />
          <StatusBanner status={step} message={result?.message ?? ''} />
          <button disabled={!file} onClick={parse} className="btn-primary flex items-center gap-2 justify-center disabled:opacity-40">
            <Upload size={14}/> Parse PDF
          </button>
        </div>
      ) : step === 'preview' && result ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Portfolio Value"  value={fmt(result.totalValue)}    good={result.totalValue > 0} />
            <KPI label="Total Invested"   value={fmt(result.totalInvested)} good={result.totalInvested > 0} />
            <KPI label="Funds"            value={String(result.funds.length)}        good={result.funds.length > 0} />
            <KPI label="Transactions"     value={String(result.transactions.length)} good={result.transactions.length > 0} />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 font-medium">{result.format}</span>
            {result.pan && <span className="text-surface-300">PAN: {result.pan}</span>}
          </div>
          {result.funds.length > 0 && (
            <div className="max-h-40 overflow-y-auto flex flex-col gap-1">
              {result.funds.map((f: any, i: number) => (
                <div key={i} className="flex justify-between text-xs py-1.5 border-b border-surface-50">
                  <span className="font-medium text-surface-800 truncate max-w-[65%]">{f.name}</span>
                  <span className="text-surface-300">{fmt(f.currentValue)}</span>
                </div>
              ))}
            </div>
          )}
          <ImportOptions opts={opts} setOpts={setOpts} items={[
            { key: 'snapshot',     label: 'Net Worth Snapshot', sub: fmt(result.totalValue),                  off: result.totalValue === 0 },
            { key: 'holdings',     label: 'Fund Holdings',       sub: `${result.funds.length} funds`,          off: !result.funds.length },
            { key: 'transactions', label: 'Transaction History', sub: `${result.transactions.length} entries`, off: !result.transactions.length },
          ]} />
          <div className="flex gap-2">
            <button onClick={reset} className="btn-ghost flex items-center gap-1 text-xs"><RefreshCw size={12}/> Reset</button>
            <button onClick={doImport} className="btn-primary flex-1 flex items-center gap-2 justify-center">Import to FinanceOS</button>
          </div>
        </div>
      ) : <StatusBanner status={step} message="Data imported successfully. Check the Timeline and Portfolio sections." />}
    </div>
  )
}

// ─── Tab: Bank CSV ────────────────────────────────────────────────────────────
function BankCSVTab() {
  const { addTransaction } = useApp()
  const [file, setFile]     = useState<File | null>(null)
  const [step, setStep]     = useState<Step>('idle')
  const [result, setResult] = useState<any>(null)

  async function parse() {
    if (!file) return
    setStep('parsing')
    try {
      const text = await file.text()
      const r    = parseBankCSV(text)
      setResult(r)
      setStep(r.status === 'success' ? 'preview' : 'error')
    } catch (e: any) {
      setResult({ status: 'error', message: String(e?.message) })
      setStep('error')
    }
  }

  function doImport() {
    if (!result) return
    bankTxnsToAppTransactions(result.transactions).forEach((t: any) => addTransaction(t))
    setStep('done')
  }

  function reset() { setStep('idle'); setResult(null); setFile(null) }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800 flex flex-col gap-1">
        <p className="font-semibold">How to export your bank statement</p>
        <p>→ <strong>HDFC</strong>: NetBanking → Accounts → Account Statement → Download CSV</p>
        <p>→ <strong>ICICI</strong>: iMobile / NetBanking → Accounts → Statement → CSV</p>
        <p>→ <strong>SBI</strong>: YONO or NetBanking → Account → e-Statement → CSV</p>
        <p>→ <strong>Axis</strong>: NetBanking → Accounts → Account Summary → Download</p>
        <p>→ <strong>Kotak</strong>: NetBanking → Account Statement → Download</p>
        <p className="text-emerald-700 mt-1">Auto-detects bank format — no column mapping needed</p>
      </div>

      {step === 'idle' || step === 'error' ? (
        <div className="flex flex-col gap-3">
          {!file ? <FileDropZone onFile={setFile} accept=".csv,.xlsx,.xls" hint="CSV or Excel bank statement" />
            : <div className="flex items-center gap-2 p-3 bg-surface-50 rounded-xl text-sm">
                <FileText size={16} className="text-amber-500" />
                <span className="font-medium text-surface-800">{file.name}</span>
                <button onClick={() => setFile(null)} className="ml-auto text-surface-300 hover:text-rose-400"><X size={14}/></button>
              </div>
          }
          <StatusBanner status={step} message={result?.message ?? ''} />
          <button disabled={!file} onClick={parse} className="btn-primary flex items-center gap-2 justify-center disabled:opacity-40">
            <Upload size={14}/> Parse Statement
          </button>
        </div>
      ) : step === 'preview' && result ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Bank Detected"    value={result.bank}                               good={result.bank !== 'Unknown'} />
            <KPI label="Transactions"     value={String(result.transactions.length)}         good={result.transactions.length > 0} />
            <KPI label="Date Range"       value={`${result.dateRange.from?.slice(0,7)} → ${result.dateRange.to?.slice(0,7)}`} good={!!result.dateRange.from} />
            <KPI label="Closing Balance"  value={fmt(result.closingBalance)}                 good={result.closingBalance > 0} />
          </div>
          <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
            {result.transactions.slice(0, 30).map((t: any, i: number) => (
              <div key={i} className="flex justify-between text-xs py-1.5 border-b border-surface-50 gap-2">
                <span className="text-surface-300 shrink-0">{t.date}</span>
                <span className="text-surface-800 font-medium truncate flex-1">{t.description.slice(0, 50)}</span>
                <span className={t.credit > 0 ? 'text-emerald-600 font-medium shrink-0' : 'text-rose-500 shrink-0'}>
                  {t.credit > 0 ? `+${fmt(t.credit)}` : `-${fmt(t.debit)}`}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={reset} className="btn-ghost flex items-center gap-1 text-xs"><RefreshCw size={12}/> Reset</button>
            <button onClick={doImport} className="btn-primary flex-1 flex items-center gap-2 justify-center">
              Import {result.transactions.length} Transactions
            </button>
          </div>
        </div>
      ) : <StatusBanner status={step} message={`${result?.transactions?.length ?? 0} transactions imported. Check Cash Flow section.`} />}
    </div>
  )
}

// ─── Tab: Equity CSV ──────────────────────────────────────────────────────────
function EquityCSVTab() {
  const { addHolding, addTransaction } = useApp()
  const [file, setFile]     = useState<File | null>(null)
  const [step, setStep]     = useState<Step>('idle')
  const [result, setResult] = useState<any>(null)

  async function parse() {
    if (!file) return
    setStep('parsing')
    try {
      const text = await file.text()
      const r    = parseEquityCSV(text)
      setResult(r)
      setStep(r.status === 'success' ? 'preview' : 'error')
    } catch (e: any) {
      setResult({ status: 'error', message: String(e?.message) })
      setStep('error')
    }
  }

  function doImport() {
    if (!result) return
    if (result.holdings.length) equityHoldingsToAppHoldings(result.holdings).forEach((h: any) => addHolding(h))
    if (result.transactions.length) equityTradesToAppTransactions(result.transactions).forEach((t: any) => addTransaction(t))
    setStep('done')
  }

  function reset() { setStep('idle'); setResult(null); setFile(null) }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800 flex flex-col gap-1">
        <p className="font-semibold">How to export from your broker</p>
        <p>→ <strong>Zerodha</strong>: Console → Portfolio → Holdings → Download CSV</p>
        <p>→ <strong>Zerodha P&L</strong>: Console → Reports → Tax P&L → Download</p>
        <p>→ <strong>Groww</strong>: Groww app → Portfolio → Download Statement</p>
        <p>→ <strong>Angel One</strong>: Angel App → Portfolio → Holding Report → Export</p>
        <p>→ <strong>Upstox</strong>: Upstox Pro → Reports → Holdings → Export CSV</p>
      </div>

      {step === 'idle' || step === 'error' ? (
        <div className="flex flex-col gap-3">
          {!file ? <FileDropZone onFile={setFile} accept=".csv,.xlsx" hint="Holdings or Tradebook CSV from your broker" />
            : <div className="flex items-center gap-2 p-3 bg-surface-50 rounded-xl text-sm">
                <FileText size={16} className="text-amber-500" />
                <span className="font-medium text-surface-800">{file.name}</span>
                <button onClick={() => setFile(null)} className="ml-auto text-surface-300 hover:text-rose-400"><X size={14}/></button>
              </div>
          }
          <StatusBanner status={step} message={result?.message ?? ''} />
          <button disabled={!file} onClick={parse} className="btn-primary flex items-center gap-2 justify-center disabled:opacity-40">
            <Upload size={14}/> Parse Holdings
          </button>
        </div>
      ) : step === 'preview' && result ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Broker"          value={result.broker}                 good={result.broker !== 'Generic'} />
            <KPI label="Holdings"        value={String(result.holdings.length)} good={result.holdings.length > 0} />
            <KPI label="Current Value"   value={fmt(result.totalValue)}         good={result.totalValue > 0} />
            <KPI label="Total P&L"       value={fmt(result.totalPnL)}           good={result.totalPnL >= 0} />
          </div>
          {result.holdings.length > 0 && (
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
              {result.holdings.map((h: any, i: number) => (
                <div key={i} className="flex justify-between text-xs py-1.5 border-b border-surface-50">
                  <span className="font-medium text-surface-800">{h.symbol}</span>
                  <div className="flex gap-3">
                    <span className="text-surface-300">{h.quantity} units</span>
                    <span className="text-surface-800">{fmt(h.currentValue)}</span>
                    <span className={h.pnl >= 0 ? 'text-emerald-600' : 'text-rose-500'}>{h.pnl >= 0 ? '+' : ''}{fmt(h.pnl)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={reset} className="btn-ghost flex items-center gap-1 text-xs"><RefreshCw size={12}/> Reset</button>
            <button onClick={doImport} className="btn-primary flex-1 flex items-center gap-2 justify-center">Import to Portfolio</button>
          </div>
        </div>
      ) : <StatusBanner status={step} message="Holdings imported. Check the Portfolio section." />}
    </div>
  )
}

// ─── Tab: NSDL/CDSL PDF ───────────────────────────────────────────────────────
function DematPDFTab() {
  const { addHolding } = useApp()
  const [file, setFile]     = useState<File | null>(null)
  const [pass, setPass]     = useState('')
  const [step, setStep]     = useState<Step>('idle')
  const [result, setResult] = useState<any>(null)

  async function parse() {
    if (!file) return
    setStep('parsing')
    const r = await parseNSDLCDSLPDF(file, pass || undefined)
    setResult(r)
    setStep(r.status === 'success' ? 'preview' : 'error')
  }

  function doImport() {
    if (!result) return
    dematToAppHoldings(result).forEach((h: any) => addHolding(h))
    setStep('done')
  }

  function reset() { setStep('idle'); setResult(null); setFile(null); setPass('') }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800 flex flex-col gap-1">
        <p className="font-semibold">How to get your Demat CAS (NSDL / CDSL)</p>
        <p>→ <a href="https://www.ndmlcas.com" target="_blank" rel="noreferrer" className="underline">NSDL CAS</a> — Login → Generate CAS Statement</p>
        <p>→ <a href="https://www.cdslindia.com/investors/myeasi.aspx" target="_blank" rel="noreferrer" className="underline">CDSL myEASI</a> — Login → Statement → CAS</p>
        <p className="text-amber-600 mt-1">Password is usually your PAN number</p>
      </div>
      {step === 'idle' || step === 'error' ? (
        <div className="flex flex-col gap-3">
          {!file ? <FileDropZone onFile={setFile} accept=".pdf" hint="NSDL or CDSL CAS PDF" />
            : <div className="flex items-center gap-2 p-3 bg-surface-50 rounded-xl text-sm">
                <FileText size={16} className="text-amber-500" />
                <span className="font-medium text-surface-800">{file.name}</span>
                <button onClick={() => setFile(null)} className="ml-auto text-surface-300 hover:text-rose-400"><X size={14}/></button>
              </div>
          }
          <input className="input-field font-mono uppercase tracking-widest" placeholder="Password (PAN)"
            value={pass} onChange={e => setPass(e.target.value.toUpperCase())} />
          <StatusBanner status={step} message={result?.message ?? ''} />
          <button disabled={!file} onClick={parse} className="btn-primary flex items-center gap-2 justify-center disabled:opacity-40">
            <Upload size={14}/> Parse Demat CAS
          </button>
        </div>
      ) : step === 'preview' && result ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KPI label="Depository"  value={result.depository}               good={result.depository !== 'Unknown'} />
            <KPI label="Holdings"    value={String(result.holdings.length)}   good={result.holdings.length > 0} />
            <KPI label="Total Value" value={fmt(result.totalValue)}           good={result.totalValue > 0} />
          </div>
          <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
            {result.holdings.slice(0, 20).map((h: any, i: number) => (
              <div key={i} className="flex justify-between text-xs py-1.5 border-b border-surface-50">
                <span className="font-medium text-surface-800">{h.symbol}</span>
                <span className="text-surface-300">{h.quantity} × {fmt(h.marketValue / Math.max(h.quantity, 1))}</span>
                <span className="text-surface-800">{fmt(h.marketValue)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={reset} className="btn-ghost flex items-center gap-1 text-xs"><RefreshCw size={12}/> Reset</button>
            <button onClick={doImport} className="btn-primary flex-1 flex items-center gap-2 justify-center">Import Holdings</button>
          </div>
        </div>
      ) : <StatusBanner status={step} message="Demat holdings imported to Portfolio." />}
    </div>
  )
}

// ─── Tab: EPF ─────────────────────────────────────────────────────────────────
function EPFTab() {
  const { addSnapshot, addTransaction } = useApp()
  const [file, setFile]     = useState<File | null>(null)
  const [pass, setPass]     = useState('')
  const [step, setStep]     = useState<Step>('idle')
  const [result, setResult] = useState<any>(null)
  const [opts, setOpts]     = useState({ snapshot: true, transactions: true })

  async function parse() {
    if (!file) return
    setStep('parsing')
    const r = await parseEPFPDF(file, pass || undefined)
    setResult(r)
    setStep(r.status === 'success' ? 'preview' : 'error')
  }

  function doImport() {
    if (!result) return
    if (opts.snapshot) addSnapshot(epfToSnapshot(result))
    if (opts.transactions) epfToTransactions(result).forEach((t: any) => addTransaction(t))
    setStep('done')
  }

  function reset() { setStep('idle'); setResult(null); setFile(null); setPass('') }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800 flex flex-col gap-1">
        <p className="font-semibold">How to get your EPF Passbook</p>
        <p>→ <a href="https://passbook.epfindia.gov.in" target="_blank" rel="noreferrer" className="underline">EPFO Member Passbook portal</a> — Login with UAN → Download PDF</p>
        <p>→ Or UMANG app → EPFO → Member Passbook → Download</p>
        <p className="text-amber-600 mt-1">Your UAN is on your salary slip. Password is your UAN password or date of birth.</p>
      </div>
      {step === 'idle' || step === 'error' ? (
        <div className="flex flex-col gap-3">
          {!file ? <FileDropZone onFile={setFile} accept=".pdf" hint="EPFO Member Passbook PDF" />
            : <div className="flex items-center gap-2 p-3 bg-surface-50 rounded-xl text-sm">
                <FileText size={16} className="text-amber-500" />
                <span className="font-medium text-surface-800">{file.name}</span>
                <button onClick={() => setFile(null)} className="ml-auto text-surface-300 hover:text-rose-400"><X size={14}/></button>
              </div>
          }
          <input className="input-field" placeholder="Password (if protected — UAN or DOB)" value={pass} onChange={e => setPass(e.target.value)} />
          <StatusBanner status={step} message={result?.message ?? ''} />
          <button disabled={!file} onClick={parse} className="btn-primary flex items-center gap-2 justify-center disabled:opacity-40">
            <Upload size={14}/> Parse EPF Passbook
          </button>
        </div>
      ) : step === 'preview' && result ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="EPF Balance"   value={fmt(result.totalBalance)}  good={result.totalBalance > 0} />
            <KPI label="Employee Share" value={fmt(result.employeeBalance)} good={result.employeeBalance > 0} />
            <KPI label="Employer Share" value={fmt(result.employerBalance)} good={result.employerBalance > 0} />
            <KPI label="Months Found"  value={String(result.entries.length)} good={result.entries.length > 0} />
          </div>
          {result.memberName && <p className="text-xs text-surface-300">Member: <strong className="text-surface-800">{result.memberName}</strong> · UAN: {result.uan}</p>}
          <ImportOptions opts={opts} setOpts={setOpts} items={[
            { key: 'snapshot',     label: 'Net Worth Snapshot (Retirement)',  sub: fmt(result.totalBalance),       off: result.totalBalance === 0 },
            { key: 'transactions', label: 'Monthly Contribution History',     sub: `${result.entries.length} months`, off: !result.entries.length },
          ]} />
          <div className="flex gap-2">
            <button onClick={reset} className="btn-ghost flex items-center gap-1 text-xs"><RefreshCw size={12}/> Reset</button>
            <button onClick={doImport} className="btn-primary flex-1 flex items-center gap-2 justify-center">Import EPF Data</button>
          </div>
        </div>
      ) : <StatusBanner status={step} message="EPF balance added to Net Worth. Contributions added to Cash Flow." />}
    </div>
  )
}

// ─── Import options checkbox group ───────────────────────────────────────────
function ImportOptions({ opts, setOpts, items }: {
  opts: Record<string, boolean>
  setOpts: (v: any) => void
  items: { key: string; label: string; sub: string; off?: boolean }[]
}) {
  return (
    <div className="border border-surface-100 rounded-xl p-4 flex flex-col gap-2">
      <p className="text-xs font-semibold text-surface-300 uppercase tracking-widest mb-1">What to import</p>
      {items.map(({ key, label, sub, off }) => (
        <label key={key} className={`flex items-start gap-2 text-xs cursor-pointer ${off ? 'opacity-40 cursor-not-allowed' : ''}`}>
          <input type="checkbox" disabled={off}
            checked={!off && opts[key]}
            onChange={e => setOpts((v: any) => ({ ...v, [key]: e.target.checked }))}
            className="accent-amber-500 mt-0.5" />
          <div>
            <div className="font-medium text-surface-800">{label}</div>
            <div className="text-surface-300">{sub}</div>
          </div>
        </label>
      ))}
    </div>
  )
}

// ─── Main ImportCard ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'mf',     label: '📄 MF CAS',      hint: 'CAMS / KFintech' },
  { id: 'bank',   label: '🏦 Bank CSV',     hint: 'HDFC / ICICI / SBI / Axis / Kotak' },
  { id: 'equity', label: '📈 Equity CSV',   hint: 'Zerodha / Groww / Angel / Upstox' },
  { id: 'demat',  label: '🏛 Demat PDF',    hint: 'NSDL / CDSL' },
  { id: 'epf',    label: '🏛 EPF',          hint: 'EPFO Passbook' },
] as const

type TabId = typeof TABS[number]['id']

export default function ImportCard() {
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('mf')

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Import Financial Data</p>
          <p className="text-xs text-surface-300">MF CAS · Bank CSV · Equity · Demat · EPF — all processed locally</p>
        </div>
        <button data-expand="import" className="btn-ghost" onClick={() => setExpanded(v => !v)}>
          {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 animate-fade-up">
          {/* Tab bar — horizontally scrollable on mobile */}
          <div className="overflow-x-auto -mx-1 px-1">
            <div className="flex gap-1 p-1 bg-surface-50 rounded-2xl min-w-max sm:min-w-0">
              {TABS.map(t => (
                <button key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex flex-col items-center px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${activeTab === t.id ? 'bg-white shadow-sm text-amber-600' : 'text-surface-300 hover:text-surface-800'}`}>
                  <span>{t.label}</span>
                  <span className="font-normal opacity-70 text-[10px] hidden sm:block">{t.hint}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Active tab content */}
          {activeTab === 'mf'     && <MFCASTab />}
          {activeTab === 'bank'   && <BankCSVTab />}
          {activeTab === 'equity' && <EquityCSVTab />}
          {activeTab === 'demat'  && <DematPDFTab />}
          {activeTab === 'epf'    && <EPFTab />}
        </div>
      )}
    </div>
  )
}
