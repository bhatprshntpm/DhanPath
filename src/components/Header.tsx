import { useState, useRef } from 'react'
import { Download, UserCog, Shield, Upload } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { exportData, exportEncrypted, importData } from '../lib/storage'

interface HeaderProps { onEditProfile: () => void }

export default function Header({ onEditProfile }: HeaderProps) {
  const { data, replaceData, updateSettings } = useApp()
  const [showExport, setShowExport]   = useState(false)
  const [passphrase, setPassphrase]   = useState('')
  const [importPass, setImportPass]   = useState('')
  const [importErr,  setImportErr]    = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleExportPlain() {
    exportData(data)
    setShowExport(false)
  }

  async function handleExportEncrypted() {
    if (passphrase.length < 8) return
    await exportEncrypted(data, passphrase)
    setPassphrase('')
    setShowExport(false)
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const restored = await importData(file)
      replaceData(restored)
    } catch (err: any) {
      if (err.message === 'PASSPHRASE_REQUIRED') {
        setPendingFile(file)
      } else {
        alert('Invalid backup file')
      }
    }
  }

  async function handleEncryptedImport() {
    if (!pendingFile) return
    try {
      const restored = await importData(pendingFile, importPass)
      replaceData(restored)
      setPendingFile(null)
      setImportPass('')
      setImportErr('')
    } catch (err: any) {
      if (err.message === 'WRONG_PASSPHRASE') setImportErr('Wrong passphrase — try again')
      else setImportErr('Restore failed')
    }
  }

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-surface-100">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">

          <div className="flex items-center gap-2.5">
            <img src="/DhanPath/logo.png" alt="DhanPath logo" className="h-9 sm:h-10 w-auto object-contain mix-blend-multiply" />
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-base font-bold tracking-tight text-[#2d5a27]">DhanPath</span>
              <span className="text-[10px] font-medium text-[#5a8a4a] tracking-wide">Navigate, Plan, Prosper</span>
            </div>
            <span className="sm:hidden text-base font-bold text-[#2d5a27]">DhanPath</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <input className="hidden md:block input-field w-36 text-sm py-1"
              placeholder="Your name" value={data.settings.name}
              onChange={e => updateSettings({ name: e.target.value })} />

            <button onClick={onEditProfile}
              className="btn-ghost flex items-center gap-1.5 text-xs" title="Edit profile">
              <UserCog size={14}/> <span className="hidden sm:inline">Edit Profile</span>
            </button>

            <button onClick={() => setShowExport(v => !v)}
              className="btn-ghost flex items-center gap-1.5 text-xs">
              <Download size={14}/> <span className="hidden sm:inline">Backup</span>
            </button>

            <button onClick={() => fileRef.current?.click()}
              className="btn-ghost flex items-center gap-1.5 text-xs" title="Restore from backup">
              <Upload size={14}/> <span className="hidden sm:inline">Restore</span>
            </button>
            <input ref={fileRef} type="file" accept=".json,.dpat" className="hidden" onChange={handleFileSelect} />
          </div>
        </div>

        {/* Inline export dropdown */}
        {showExport && (
          <div className="border-t border-surface-100 bg-white px-3 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center max-w-7xl mx-auto animate-fade-up">
            <button onClick={handleExportPlain}
              className="flex items-center gap-2 text-xs font-medium text-surface-700 hover:text-amber-600 transition-colors">
              <Download size={14}/> Download plain backup (.json)
            </button>
            <span className="hidden sm:block text-surface-200">|</span>
            <div className="flex items-center gap-2 flex-1">
              <Shield size={14} className="text-indigo-500 shrink-0"/>
              <input className="input-field text-xs py-1 w-48" type="password"
                placeholder="Passphrase for encrypted backup"
                value={passphrase} onChange={e => setPassphrase(e.target.value)} />
              <button onClick={handleExportEncrypted}
                disabled={passphrase.length < 8}
                className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-40 whitespace-nowrap">
                Download encrypted (.dpat)
              </button>
            </div>
            <button onClick={() => { setShowExport(false); setPassphrase('') }}
              className="text-xs text-surface-300 hover:text-surface-600 transition-colors">Cancel</button>
          </div>
        )}
      </header>

      {/* Encrypted restore passphrase modal */}
      {pendingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm flex flex-col gap-4">
            <div>
              <p className="font-semibold text-surface-800">Encrypted backup detected</p>
              <p className="text-sm text-surface-400 mt-1">Enter the passphrase you used when creating this backup.</p>
            </div>
            <input className="input-field" type="password" placeholder="Passphrase"
              value={importPass} onChange={e => { setImportPass(e.target.value); setImportErr('') }}
              onKeyDown={e => e.key === 'Enter' && handleEncryptedImport()} autoFocus />
            {importErr && <p className="text-xs text-rose-500">{importErr}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setPendingFile(null); setImportPass(''); setImportErr('') }}
                className="btn-ghost flex-1 text-xs">Cancel</button>
              <button onClick={handleEncryptedImport}
                disabled={!importPass}
                className="btn-primary flex-1 text-xs disabled:opacity-40">Restore</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
