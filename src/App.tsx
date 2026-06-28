import { useState } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import Header from './components/Header'
import OnboardingWizard from './components/OnboardingWizard'
import DemoBanner from './components/DemoBanner'
import HeroSection from './components/HeroSection'
import CashFlowOverview from './components/CashFlowOverview'
import AssetAllocationCard from './components/AssetAllocationCard'
import FinancialArc from './components/FinancialArc'
import GoalsCard from './components/GoalsCard'
import DataManagement from './components/DataManagement'
import HealthScoreCard from './components/HealthScoreCard'
import MonthlyReportCard from './components/MonthlyReportCard'
import DebtCard from './components/DebtCard'
import PlanSummary from './components/PlanSummary'
import { ONBOARD_KEY, isDemoMode } from './lib/demoData'
import { DEFAULT_DATA } from './lib/storage'

function AppContent() {
  const [wizardOpen, setWizardOpen] = useState(false)
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
      <Header onEditProfile={() => setWizardOpen(true)} />
      {demoMode && <DemoBanner onUseMyData={handleUseMyData} />}

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 flex flex-col gap-5 sm:gap-6">

        {/* Net worth + key metrics */}
        <HeroSection />

        {/* Plan narrative */}
        <PlanSummary />

        {/* What you own | How money moved */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <AssetAllocationCard />
          <CashFlowOverview />
        </div>

        {/* Financial health | Monthly summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <HealthScoreCard />
          <MonthlyReportCard />
        </div>

        {/* Goals */}
        <GoalsCard />

        {/* Debt tracker */}
        <DebtCard />

        {/* Financial Arc — history + projection + what-if */}
        <FinancialArc />

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
