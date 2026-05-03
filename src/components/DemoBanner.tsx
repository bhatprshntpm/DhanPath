
import { clearDemoMode } from '../lib/demoData'

interface DemoBannerProps { onUseMyData: () => void }

export default function DemoBanner({ onUseMyData }: DemoBannerProps) {
  function handleUseMyData() {
    clearDemoMode()
    onUseMyData()
  }

  return (
    <div className="sticky top-16 z-40 bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between gap-3 shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full bg-white opacity-80 shrink-0 animate-pulse" />
        <p className="text-xs font-medium truncate">
          <span className="font-bold">Sample data</span> — Arjun Sharma, 32, Bangalore.
          <span className="hidden sm:inline"> Explore to see how DhanPath works.</span>
        </p>
      </div>
      <button
        onClick={handleUseMyData}
        className="shrink-0 text-xs font-semibold bg-white text-amber-600 hover:bg-amber-50 transition-colors px-3 py-1.5 rounded-lg whitespace-nowrap">
        Use my own data
      </button>
    </div>
  )
}
