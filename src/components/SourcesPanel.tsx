import { useState, useRef, useEffect } from 'react'
import { X, Download, Upload, Shield, RotateCcw, Key, Check } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { exportData, exportEncrypted, importData, DEFAULT_DATA } from '../lib/storage'
import { isKiteConfigured } from '../lib/kiteConnect'
import DataManagement from './DataManagement'

interface SourcesPanelProps {
  open: boolean
  onClose: () => void
}

/** Per-device Kite API key configuration.
 *  Set this once on each family member's device — they never need to see it again.
 *  Leave blank on the main device (uses the build default from env vars). */
function KiteApiKeySection() {
  const { data, updateSettings } = useApp()
  const stored = data.settings.kiteApiKey ?? ''
  const [draft,   setDraft]   = useState(stored)
  const [saved,   setSaved]   = useState(false)
  const [visible, setVisible] = useState(false)

  function save() {
    updateSettings({ kiteApiKey: draft.trim() || undefined })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const configured = isKiteConfigured(stored)

  return (
    <div className="border-t border-surface-100 px-5 py-4">
      <button onClick={() => setVisible(v => !v)}
        className="flex items-center gap-2 text-xs font-medium text-surface-500 hover:text-surface-800 transition-colors">
        <Key size={13} />
        Kite API key for this device
        {stored && <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">configured</span>}
        {!configured && !stored && <span className="text-[10px] text-surface-400">(using app default)</span>}
      </button>

      {visible && (
        <div className="mt-3 flex flex-col gap-2 p-3 bg-surface-50 rounded-xl border border-surface-100 animate-fade-up">
          <p className="text-[10px] text-surface-500 leading-relaxed">
            For family members using a separate Zerodha account: enter the Kite Connect API key
            that was created for <strong>this Zerodha account</strong>. Set it once — it's saved
            in this browser only. Leave blank to use the app's built-in default.
          </p>
          <div className="flex items-center gap-2">
            <input
              type={visible ? 'text' : 'password'}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="e.g. abcdefghij123456"
              className="input-field text-xs py-1 flex-1 font-mono"
            />
            <button onClick={save}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors shrink-0">
              {saved ? <><Check size={11}/> Saved</> : 'Save'}
            </button>
          </div>
          {stored && (
            <button onClick={() => { setDraft(''); updateSettings({ kiteApiKey: undefined }) }}
              className="text-[10px] text-rose-500 hover:text-rose-700 text-left transition-colors">
              Clear — revert to app default
            </button>
          )}
          <p className="text-[10px] text-surface-400">
            The matching Kite app's redirect URL must be registered as:<br />
            <code className="bg-surface-100 px-1 rounded">
              {`${import.meta.env.VITE_KITE_WORKER_URL || '<worker-url>'}/callback?key=${draft || '<api-key>'}`}
            </code>
          </p>
        </div>
      )}
    </div>
  )
}

export default function SourcesPanel({ open, onClose }: SourcesPanelProps) {
  const { data, replaceData } = useApp()
  const [showBackup,    setShowBackup]    = useState(false)
  const [passphrase,    setPassphrase]    = useState('')
  const [importPass,    setImportPass]    = useState('')
  const [importErr,     setImportErr]     = useState('')
  const [pendingFile,   setPendingFile]   = useState<File | null>(null)
  const [confirmReset,  setConfirmReset]  = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Prevent body scroll while panel is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      replaceData(await importData(file))
      onClose()
    } catch (err: any) {
      if (err.message === 'PASSPHRASE_REQUIRED') setPendingFile(file)
      else alert('Invalid backup file')
    }
  }

  async function handleEncryptedImport() {
    if (!pendingFile) return
    try {
      replaceData(await importData(pendingFile, importPass))
      setPendingFile(null); setImportPass(''); setImportErr(''); onClose()
    } catch (err: any) {
      setImportErr(err.message === 'WRONG_PASSPHRASE' ? 'Wrong passphrase — try again' : 'Restore failed')
    }
  }

  function handleReset() {
    if (!confirmReset) { setConfirmReset(true); return }
    replaceData(DEFAULT_DATA)
    setConfirmReset(false); onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl
        transition-transform duration-300 ease-out flex flex-col
        ${open ? 'translate-y-0' : 'translate-y-full'}
        max-h-[88vh]`}>

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-surface-200 rounded-full" />
        </div>

        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-surface-100 shrink-0">
          <div>
            <p className="text-sm font-semibold text-surface-800">Sources & Data</p>
            <p className="text-xs text-surface-400 mt-0.5">Connect, import, and manage your financial data</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Data sources — always expanded */}
          <DataManagement alwaysOpen />

          {/* Per-device Kite API key — set once by admin for each family member */}
          <KiteApiKeySection />

          {/* Backup & Restore */}
          <div className="border-t border-surface-100 px-5 py-4 flex flex-col gap-3">
            <button
              onClick={() => setShowBackup(v => !v)}
              className="flex items-center gap-2 text-xs font-medium text-surface-500 hover:text-surface-800 transition-colors">
              <Download size={13} />
              Backup & Restore
            </button>

            {showBackup && (
              <div className="flex flex-col gap-3 p-3 bg-surface-50 rounded-xl border border-surface-100 text-xs animate-fade-up">
                {/* Export */}
                <div className="flex flex-col gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-400">Export</p>
                  <button onClick={() => exportData(data)}
                    className="flex items-center gap-2 text-surface-700 hover:text-amber-600 transition-colors">
                    <Download size={12}/> Download backup (.json)
                  </button>
                  <div className="flex items-center gap-2">
                    <Shield size={12} className="text-indigo-400 shrink-0"/>
                    <input className="input-field text-xs py-1 flex-1" type="password"
                      placeholder="Passphrase for encrypted backup"
                      value={passphrase} onChange={e => setPassphrase(e.target.value)} />
                    <button onClick={async () => { if (passphrase.length >= 8) { await exportEncrypted(data, passphrase); setPassphrase('') } }}
                      disabled={passphrase.length < 8}
                      className="btn-ghost text-xs disabled:opacity-40 whitespace-nowrap">
                      Encrypted (.dpat)
                    </button>
                  </div>
                </div>

                {/* Restore */}
                <div className="flex flex-col gap-2 border-t border-surface-100 pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-surface-400">Restore</p>
                  <button onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 text-surface-700 hover:text-amber-600 transition-colors">
                    <Upload size={12}/> Restore from backup file
                  </button>
                  <input ref={fileRef} type="file" accept=".json,.dpat" className="hidden" onChange={handleFileSelect} />

                  {pendingFile && (
                    <div className="flex flex-col gap-2 p-2 bg-white border border-surface-200 rounded-lg">
                      <p className="text-[10px] text-surface-500">Encrypted backup — enter passphrase:</p>
                      <div className="flex gap-2">
                        <input className="input-field text-xs py-1 flex-1" type="password" placeholder="Passphrase"
                          value={importPass} onChange={e => { setImportPass(e.target.value); setImportErr('') }}
                          onKeyDown={e => e.key === 'Enter' && handleEncryptedImport()} autoFocus />
                        <button onClick={handleEncryptedImport} disabled={!importPass}
                          className="btn-ghost text-xs disabled:opacity-40">Restore</button>
                      </div>
                      {importErr && <p className="text-[10px] text-rose-500">{importErr}</p>}
                    </div>
                  )}
                </div>

                {/* Danger zone */}
                <div className="border-t border-surface-100 pt-2">
                  <button
                    onClick={handleReset}
                    onBlur={() => setConfirmReset(false)}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors
                      ${confirmReset ? 'border-rose-400 bg-rose-50 text-rose-600' : 'border-surface-200 text-surface-400 hover:text-rose-500 hover:border-rose-200'}`}>
                    <RotateCcw size={10}/>
                    {confirmReset ? 'Confirm — reset all data' : 'Reset all data'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
