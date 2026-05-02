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
import BadgesCard from './components/BadgesCard'
import CrorepatiCalc from './components/CrorepatiCalc'
import ChaiMoney from './components/ChaiMoney'
import MonthlyReportCard from './components/MonthlyReportCard'
import FireHorizon from './components/FireHorizon'
import ScenarioPanel from './components/ScenarioPanel'

export default function App() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-surface-50">
        <OnboardingWizard />
        <Header />
        <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 flex flex-col gap-4 sm:gap-8">
          <KpiRow />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <HealthScoreCard />
            <div className="md:col-span-2 flex flex-col gap-4">
              <ActionCards />
              <MonthlyReportCard />
            </div>
          </div>

          <LifetimeTimeline />
          <ChaiMoney />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <NetWorthCard />
            <CashFlowCard />
            <PortfolioCard />
            <DebtCard />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GoalsCard />
            <SipCalculator />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CrorepatiCalc />
            <BadgesCard />
          </div>

          <ImportCard />
          <FireHorizon />
          <ScenarioPanel />
        </main>
        <footer className="text-center text-xs text-surface-300 py-8">
          DhanPath · सब data आपके device पर · Nothing leaves your browser
        </footer>
      </div>
    </AppProvider>
  )
}
