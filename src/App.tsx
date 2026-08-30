import { useState } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import Header from './components/Header'
import OnboardingWizard from './components/OnboardingWizard'
import PlanSettings from './components/PlanSettings'
import DemoBanner from './components/DemoBanner'
import VitalsBar from './components/VitalsBar'
import FinancialArc from './components/FinancialArc'
import GoalsCard from './components/GoalsCard'
import AssetAllocationCard from './components/AssetAllocationCard'
import DebtCard from './components/DebtCard'
import SourcesPanel from './components/SourcesPanel'
import { ONBOARD_KEY, isDemoMode } from './lib/demoData'
import { DEFAULT_DATA } from './lib/storage'

function AppContent() {
  const [wizardOpen,    setWizardOpen]    = useState(false)
  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [sourcesOpen,   setSourcesOpen]   = useState(false)
  const [demoMode,   setDemoMode_]  = useState(() => isDemoMode())
  const { loading, replaceData, data }    = useApp()

  function handleUseMyData() {
    localStorage.setItem(ONBOARD_KEY, '1')
    setDemoMode_(false)
    replaceData(DEFAULT_DATA)
    setWizardOpen(true)
  }

  if (loading) return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center gap-3">
      <img src="/DhanPath/logo.png" alt="DhanPath" className="h-10 w-auto mix-blend-multiply animate-pulse" />
      <span className="text-sm text-surface-400 font-medium">Loading your data…</span>
    </div>
  )

  const hasData = data.holdings.length > 0 || data.snapshots.length > 0

  return (
    <div className="min-h-screen bg-surface-50">
      <OnboardingWizard forceOpen={wizardOpen} onClose={() => { setWizardOpen(false); setDemoMode_(false) }} />
      <PlanSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <SourcesPanel open={sourcesOpen} onClose={() => setSourcesOpen(false)} />

      <Header
        onEditProfile={() => setSettingsOpen(true)}
        onOpenSources={() => setSourcesOpen(true)}
      />

      {demoMode && <DemoBanner onUseMyData={handleUseMyData} />}

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 flex flex-col gap-6 sm:gap-8">

        {!hasData ? (
          /* ── First-time empty state ── */
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <img src="/DhanPath/logo.png" alt="DhanPath" className="h-16 w-auto mix-blend-multiply opacity-40" />
            <div className="text-center max-w-sm">
              <p className="text-xl font-semibold text-surface-800 mb-2">Your financial arc starts here</p>
              <p className="text-sm text-surface-500 leading-relaxed">
                Connect your Zerodha account or import a statement to see your net worth, FIRE age, and projection.
              </p>
            </div>
            <button
              onClick={() => setSourcesOpen(true)}
              className="btn-primary flex items-center gap-2">
              Connect data sources
            </button>
          </div>
        ) : (
          <>
            {/* Zone 1 — The headline */}
            <VitalsBar />

            {/* Zone 2 — The arc (story + projection) */}
            <FinancialArc onOpenSettings={() => setSettingsOpen(true)} />

            {/* Zone 3 — Where your money is */}
            <AssetAllocationCard />

            {/* Zone 4 — Goals */}
            <GoalsCard />

            {/* Zone 5 — Debt (only when there are debts) */}
            {data.debts.length > 0 && <DebtCard />}
          </>
        )}

      </main>

      <footer className="text-center py-10 flex flex-col items-center gap-2">
        <img src="/DhanPath/logo.png" alt="DhanPath" className="h-8 w-auto opacity-30 mix-blend-multiply" />
        <p className="text-xs text-surface-300">DhanPath — Navigate, Plan, Prosper</p>
        <p className="text-xs text-surface-300">All data stored on your device · Nothing leaves your browser</p>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
