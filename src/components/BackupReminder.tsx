import { useState, useEffect } from 'react'
import { Download, Shield, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import {
  exportData, exportEncrypted,
  getBackupMeta, setBackupMeta, shouldShowBackupReminder,
} from '../lib/storage'

export default function BackupReminder() {
  const { data }    = useApp()
  const [show, setShow]             = useState(false)
  const [mode, setMode]             = useState<'prompt' | 'encrypt'>('prompt')
  const [passphrase, setPassphrase] = useState('')
  const [confirm,    setConfirm]    = useState('')
  const [error,      setError]      = useState('')
  const [done,       setDone]       = useState(false)

  useEffect(() => {
    getBackupMeta().then(meta => {
      // Only show if user has real data worth backing up
      const hasData = data.snapshots.length > 0 || data.transactions.length > 0
      if (hasData && shouldShowBackupReminder(meta)) setShow(true)
    })
  }, [data.snapshots.length, data.transactions.length])

  async function handlePlain() {
    exportData(data)
    await setBackupMeta({ lastBackupDate: new Date().toISOString().slice(0, 10) })
    setDone(true)
    setTimeout(() => setShow(false), 2000)
  }

  async function handleEncrypted() {
    if (passphrase.length < 8) { setError('Passphrase must be at least 8 characters'); return }
    if (passphrase !== confirm)  { setError('Passphrases do not match'); return }
    try {
      await exportEncrypted(data, passphrase)
      await setBackupMeta({ lastBackupDate: new Date().toISOString().slice(0, 10) })
      setDone(true)
      setTimeout(() => setShow(false), 2000)
    } catch {
      setError('Encryption failed — please try again')
    }
  }

  async function snooze(days: number) {
    const date = new Date()
    date.setDate(date.getDate() + days)
    await setBackupMeta({ remindAfter: date.toISOString().slice(0, 10) })
    setShow(false)
  }

  async function neverRemind() {
    await setBackupMeta({ neverRemind: true })
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">

        {done ? (
          <div className="p-8 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
              <Shield size={22} className="text-emerald-600" />
            </div>
            <p className="font-semibold text-surface-800">Backup saved</p>
            <p className="text-sm text-surface-400">Keep this file somewhere safe — Drive, iCloud, or email it to yourself.</p>
          </div>
        ) : mode === 'prompt' ? (
          <div className="p-6 flex flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-surface-800">Back up your data</p>
                <p className="text-sm text-surface-400 mt-1">
                  Your DhanPath data lives only in this browser.
                  Download a backup so you never lose it.
                </p>
              </div>
              <button onClick={() => snooze(3)} className="text-surface-300 hover:text-surface-600 shrink-0 mt-0.5">
                <X size={18}/>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={handlePlain}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-surface-200 hover:border-amber-400 hover:bg-amber-50 transition-all">
                <Download size={20} className="text-amber-500" />
                <span className="text-xs font-semibold text-surface-800">Plain backup</span>
                <span className="text-[10px] text-surface-400 text-center">JSON file — readable, easy to restore</span>
              </button>
              <button onClick={() => setMode('encrypt')}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-surface-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all">
                <Shield size={20} className="text-indigo-500" />
                <span className="text-xs font-semibold text-surface-800">Encrypted backup</span>
                <span className="text-[10px] text-surface-400 text-center">AES-256 — safe to store anywhere</span>
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-surface-300">
              <button onClick={() => snooze(3)}  className="hover:text-surface-600 transition-colors">Remind me in 3 days</button>
              <button onClick={neverRemind}       className="hover:text-surface-600 transition-colors">Don't remind me</button>
            </div>
          </div>
        ) : (
          <div className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-surface-800">Encrypted backup</p>
                <p className="text-xs text-surface-400 mt-0.5">Set a passphrase. You'll need it to restore.</p>
              </div>
              <button onClick={() => { setMode('prompt'); setError('') }} className="text-surface-300 hover:text-surface-600">
                <X size={18}/>
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <input
                className="input-field" type="password" placeholder="Passphrase (min 8 characters)"
                value={passphrase} onChange={e => { setPassphrase(e.target.value); setError('') }}
              />
              <input
                className="input-field" type="password" placeholder="Confirm passphrase"
                value={confirm} onChange={e => { setConfirm(e.target.value); setError('') }}
              />
              {error && <p className="text-xs text-rose-500">{error}</p>}
              <p className="text-[10px] text-surface-300 leading-relaxed">
                This passphrase is never stored. Lose it and you cannot restore from this file.
                Write it down somewhere safe.
              </p>
            </div>

            <button onClick={handleEncrypted} className="btn-primary flex items-center gap-2 justify-center">
              <Shield size={14}/> Download encrypted backup
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
