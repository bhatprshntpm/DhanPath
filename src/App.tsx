import { useState } from 'react'
import { AppProvider } from './context/AppContext'
import Header from './components/Header'
import OnboardingWizard from './components/OnboardingWizard'
import KpiRow from './components/KpiRow'
import HealthScoreCard from './components/HealthScoreCard'
import ActionCards from './components/ActionCards'
import LifetimeTimeline from './components/LifetimeTimeline'
import NetWorthCard from './components/NetWorthCard'
import CashFlowCard from './components/CashFlowCard'
import PortfolioCard from './components/PortfolioCard'
import DebtCard from './components/DebtCard'
import GoalsCard from './components/GoalsCard'
import SipCalculator from './components/SipCalculator'
import ImportCard from './components/ImportCard'
import CrorepatiCalc from './components/CrorepatiCalc'
import MonthlyReportCard from './components/MonthlyReportCard'
import FireHorizon from './components/FireHorizon'
import ScenarioPanel from './components/ScenarioPanel'

function AppContent() {
  const [wizardOpen, setWizardOpen] = useState(false)

  return (
    <div className="min-h-screen bg-surface-50">
      <OnboardingWizard forceOpen={wizardOpen} onClose={() => setWizardOpen(false)} />
      <Header onEditProfile={() => setWizardOpen(true)} />
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 flex flex-col gap-4 sm:gap-8">
        <KpiRow />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HealthScoreCard />
          <div className="md:col-span-2 flex flex-col gap-4">
            <ActionCards />
            <MonthlyReportCard />
          </div>
        </div>

        <section id="section-timeline">
          <LifetimeTimeline />
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <section id="section-networth"><NetWorthCard /></section>
          <section id="section-cashflow"><CashFlowCard /></section>
          <section id="section-portfolio"><PortfolioCard /></section>
          <section id="section-debt"><DebtCard /></section>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section id="section-goals"><GoalsCard /></section>
          <SipCalculator />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section id="section-crorepati"><CrorepatiCalc /></section>
          <section id="section-fire"><FireHorizon /></section>
        </div>

        <section id="section-import"><ImportCard /></section>
        <section id="section-scenarios"><ScenarioPanel /></section>
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
