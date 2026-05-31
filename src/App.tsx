import { useState, useEffect } from 'react'
import { AppProvider } from './context/AppContext'
import { useApp } from './context/AppContext'
import Header from './components/Header'
import OnboardingWizard from './components/OnboardingWizard'
import DemoBanner from './components/DemoBanner'
import BackupReminder from './components/BackupReminder'
import KpiRow from './components/KpiRow'
import HealthScoreCard from './components/HealthScoreCard'
import ActionCards from './components/ActionCards'
import LifetimeTimeline from './components/LifetimeTimeline'
import NetWorthCard from './components/NetWorthCard'
import CashFlowCard from './components/CashFlowCard'
import AssetAllocationCard from './components/AssetAllocationCard'
import DebtCard from './components/DebtCard'
import GoalsCard from './components/GoalsCard'
import SipCalculator from './components/SipCalculator'
import ImportCard from './components/ImportCard'
import CrorepatiCalc from './components/CrorepatiCalc'
import MonthlyReportCard from './components/MonthlyReportCard'
import FireHorizon from './components/FireHorizon'
import ScenarioPanel from './components/ScenarioPanel'
import { DEMO_FLAG, ONBOARD_KEY, setDemoMode, isDemoMode } from './lib/demoData'

function AppContent() {
  const [wizardOpen, setWizardOpen] = useState(false)
  const [demoMode, setDemoMode_]    = useState(() => isDemoMode())
  const { data, loading } = useApp()

  // Auto-load demo on very first visit
  useEffect(() => {
    const onboarded = localStorage.getItem(ONBOARD_KEY)
    const demo      = localStorage.getItem(DEMO_FLAG)
    if (!onboarded && !demo) {
      setDemoMode()
      setDemoMode_(true)
      window.location.reload()   // reload so AppContext picks up demo data
    }
  }, [])

  function handleUseMyData() {
    setDemoMode_(false)
    setWizardOpen(true)
  }

  const hasAnyData      = data.snapshots.length > 0 || data.transactions.length > 0 || data.holdings.length > 0 || data.debts.length > 0
  const hasPlanningData = data.snapshots.length > 0 || data.holdings.length > 0

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
      <BackupReminder />
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 flex flex-col gap-4 sm:gap-8">

        <KpiRow />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HealthScoreCard />
          <div className="md:col-span-2 flex flex-col gap-4">
            <ActionCards />
            {hasAnyData && <MonthlyReportCard />}
          </div>
        </div>

        <section id="section-import"><ImportCard /></section>

        <section id="section-timeline"><LifetimeTimeline /></section>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          <section id="section-networth"><NetWorthCard /></section>
          <section id="section-cashflow"><CashFlowCard /></section>
        <section id="section-portfolio"><AssetAllocationCard /></section>
          <section id="section-debt"><DebtCard /></section>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section id="section-goals"><GoalsCard /></section>
          <SipCalculator />
        </div>

        {hasPlanningData ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <section id="section-crorepati"><CrorepatiCalc /></section>
              <section id="section-fire"><FireHorizon /></section>
            </div>
            <section id="section-scenarios"><ScenarioPanel /></section>
          </>
        ) : (
          <div className="card p-6 flex flex-col items-center gap-3 text-center border-2 border-dashed border-surface-100">
            <p className="text-sm font-semibold text-surface-700">Corpus Projections &amp; Scenario Analysis</p>
            <p className="text-xs text-surface-400 max-w-sm leading-relaxed">
              Add a net worth snapshot or import your portfolio to unlock your Financial Independence Horizon, Corpus Projections, and Scenario Analysis tools.
            </p>
          </div>
        )}

      </main>
      <footer className="text-center py-10 flex flex-col items-center gap-2">
        <img src="/DhanPath/logo.png" alt="DhanPath" className="h-8 w-auto opacity-30 mix-blend-multiply" />
        <p className="text-xs text-surface-300">DhanPath — Navigate, Plan, Prosper</p>
        <p className="text-xs text-surface-300">All data stored locally on your device. Nothing leaves your browser.</p>
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
