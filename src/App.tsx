import { AppProvider } from './context/AppContext'
import Header from './components/Header'
import KpiRow from './components/KpiRow'
import LifetimeTimeline from './components/LifetimeTimeline'
import NetWorthCard from './components/NetWorthCard'
import CashFlowCard from './components/CashFlowCard'
import PortfolioCard from './components/PortfolioCard'
import DebtCard from './components/DebtCard'
import GoalsCard from './components/GoalsCard'
import SipCalculator from './components/SipCalculator'
import ImportCard from './components/ImportCard'
import FireHorizon from './components/FireHorizon'
import ScenarioPanel from './components/ScenarioPanel'

export default function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-surface-50">
        <Header />
        <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 flex flex-col gap-4 sm:gap-8">
          <KpiRow />
          <LifetimeTimeline />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <NetWorthCard />
            <CashFlowCard />
            <PortfolioCard />
            <DebtCard />
          </div>
          <ImportCard />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GoalsCard />
            <SipCalculator />
          </div>
          <FireHorizon />
          <ScenarioPanel />
        </main>
        <footer className="text-center text-xs text-surface-300 py-8">
          All data stored locally in your browser · Nothing leaves your device
        </footer>
      </div>
    </AppProvider>
  )
}
