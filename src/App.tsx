import { useState } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import Header from './components/Header'
import OnboardingWizard from './components/OnboardingWizard'
import PlanSettings from './components/PlanSettings'
import DemoBanner from './components/DemoBanner'
import VitalsBar from './components/VitalsBar'
import FinancialArc from './components/FinancialArc'
import GoalsCard from './components/GoalsCard'
import CashFlowOverview from './components/CashFlowOverview'
import AssetAllocationCard from './components/AssetAllocationCard'
import DebtCard from './components/DebtCard'
import DataManagement from './components/DataManagement'
import { ONBOARD_KEY, isDemoMode } from './lib/demoData'
import { DEFAULT_DATA } from './lib/storage'

function AppContent() {
  const [wizardOpen,    setWizardOpen]    = useState(false)
  const [settingsOpen,  setSettingsOpen]  = useState(false)
  const [demoMode,   setDemoMode_]  = useState(() => isDemoMode())
  const { loading, replaceData }    = useApp()

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

  return (
    <div className="min-h-screen bg-surface-50">
      <OnboardingWizard forceOpen={wizardOpen} onClose={() => { setWizardOpen(false); setDemoMode_(false) }} />
      <PlanSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Header onEditProfile={() => setSettingsOpen(true)} />
      {demoMode && <DemoBanner onUseMyData={handleUseMyData} />}

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 flex flex-col gap-6 sm:gap-8">

        {/* Vitals — 3 numbers, no card border */}
        <VitalsBar />

        {/* THE MAIN STORY — arc is hero */}
        <FinancialArc onOpenSettings={() => setSettingsOpen(true)} />

        {/* Goals — the "why" behind the arc */}
        <GoalsCard />

        {/* Supporting context */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <AssetAllocationCard />
          <CashFlowOverview />
        </div>

        {/* Debt */}
        <DebtCard />

        {/* Data sources */}
        <DataManagement />

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
