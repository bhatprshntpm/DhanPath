import { Settings, Download } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { exportData } from '../lib/storage'

export default function Header() {
  const { data, updateSettings } = useApp()

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-surface-100">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-12 sm:h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-surface-800 tracking-tight">FinanceOS</span>
          <span className="text-xs text-surface-300 font-medium hidden sm:block">
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            className="hidden sm:block input-field w-40 text-sm py-1"
            placeholder="Your name"
            value={data.settings.name}
            onChange={e => updateSettings({ name: e.target.value })}
          />
          <button
            onClick={() => exportData(data)}
            className="btn-ghost flex items-center gap-1.5 text-xs"
          >
            <Download size={14}/> Export
          </button>
          <button
            onClick={() => {}}
            className="btn-ghost flex items-center gap-1.5 text-xs"
            title="Settings"
          >
            <Settings size={14}/>
          </button>
        </div>
      </div>
    </header>
  )
}
