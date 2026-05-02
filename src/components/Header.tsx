import { Download, UserCog } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { exportData } from '../lib/storage'

interface HeaderProps { onEditProfile: () => void }

export default function Header({ onEditProfile }: HeaderProps) {
  const { data, updateSettings } = useApp()

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-surface-100">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">

        <div className="flex items-center gap-2.5">
          <img src="/DhanPath/logo.png" alt="DhanPath logo" className="h-9 sm:h-10 w-auto object-contain" />
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-base font-bold tracking-tight text-[#2d5a27]">DhanPath</span>
            <span className="text-[10px] font-medium text-[#5a8a4a] tracking-wide">Navigate, Plan, Prosper</span>
          </div>
          <span className="sm:hidden text-base font-bold text-[#2d5a27]">DhanPath</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <input
            className="hidden md:block input-field w-36 text-sm py-1"
            placeholder="Your name"
            value={data.settings.name}
            onChange={e => updateSettings({ name: e.target.value })}
          />
          <button
            onClick={onEditProfile}
            className="btn-ghost flex items-center gap-1.5 text-xs"
            title="Edit profile & settings"
          >
            <UserCog size={14} />
            <span className="hidden sm:inline">Edit Profile</span>
          </button>
          <button
            onClick={() => exportData(data)}
            className="btn-ghost flex items-center gap-1.5 text-xs"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>
    </header>
  )
}
