import { Database, UserCog } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { isKiteConfigured, isKiteTokenValid } from '../lib/kiteConnect'

interface HeaderProps {
  onEditProfile: () => void
  onOpenSources: () => void
}

export default function Header({ onEditProfile, onOpenSources }: HeaderProps) {
  const { data, updateSettings } = useApp()
  const { kiteConnectedAt } = data.settings

  const kiteOk    = isKiteConfigured() && isKiteTokenValid(kiteConnectedAt)
  const kiteStale = isKiteConfigured() && !kiteOk

  return (
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

          {/* Kite sync status pill */}
          {isKiteConfigured() && (
            <span className={`hidden sm:flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium
              ${kiteOk    ? 'bg-emerald-50 border-emerald-200 text-emerald-600' :
                kiteStale ? 'bg-amber-50 border-amber-200 text-amber-600' :
                            'bg-surface-100 border-surface-200 text-surface-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${kiteOk ? 'bg-emerald-500' : kiteStale ? 'bg-amber-400' : 'bg-surface-300'}`} />
              {kiteOk ? 'Kite live' : 'Reconnect Kite'}
            </span>
          )}

          <button onClick={onOpenSources}
            className="btn-ghost flex items-center gap-1.5 text-xs" title="Data sources">
            <Database size={14}/> <span className="hidden sm:inline">Sources</span>
          </button>

          <button onClick={onEditProfile}
            className="btn-ghost flex items-center gap-1.5 text-xs" title="Settings">
            <UserCog size={14}/> <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>
    </header>
  )
}
