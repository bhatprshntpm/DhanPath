import { useState } from 'react'
import { ChevronDown, ChevronUp, Database } from 'lucide-react'
import ImportCard from './ImportCard'
import NetWorthCard from './NetWorthCard'
import CashFlowCard from './CashFlowCard'
import AssetAllocationCard from './AssetAllocationCard'
import DebtCard from './DebtCard'
import GoalsCard from './GoalsCard'
import SipCalculator from './SipCalculator'
import ScenarioPanel from './ScenarioPanel'

const TABS = [
  { id: 'import',     label: 'Connect Sources' },
  { id: 'networth',   label: 'Net Worth'        },
  { id: 'cashflow',   label: 'Transactions'     },
  { id: 'portfolio',  label: 'Portfolio'        },
  { id: 'debt',       label: 'Loans & Debt'     },
  { id: 'goals',      label: 'Goals'            },
  { id: 'scenarios',  label: 'Scenarios'        },
  { id: 'sip',        label: 'SIP Calculator'   },
]

export default function DataManagement() {
  const [open,       setOpen]       = useState(false)
  const [activeTab, setActiveTab]   = useState('import')

  return (
    <div className="card overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-5 hover:bg-surface-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface-100 flex items-center justify-center">
            <Database size={15} className="text-surface-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-surface-800">Manage Your Data</p>
            <p className="text-xs text-surface-400">Import statements, add snapshots, track loans and goals</p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-surface-400" /> : <ChevronDown size={16} className="text-surface-400" />}
      </button>

      {open && (
        <div className="border-t border-surface-100 animate-fade-up">
          {/* Tab bar */}
          <div className="flex overflow-x-auto border-b border-surface-100 px-5 gap-0 scrollbar-hide">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`shrink-0 px-4 py-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap
                  ${activeTab === t.id
                    ? 'border-amber-500 text-amber-600'
                    : 'border-transparent text-surface-400 hover:text-surface-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-5">
            {activeTab === 'import'    && <section id="section-import"><ImportCard /></section>}
            {activeTab === 'networth'  && <section id="section-networth"><NetWorthCard /></section>}
            {activeTab === 'cashflow'  && <section id="section-cashflow"><CashFlowCard /></section>}
            {activeTab === 'portfolio' && <section id="section-portfolio"><AssetAllocationCard /></section>}
            {activeTab === 'debt'      && <section id="section-debt"><DebtCard /></section>}
            {activeTab === 'goals'     && <section id="section-goals"><GoalsCard /></section>}
            {activeTab === 'scenarios' && <section id="section-scenarios"><ScenarioPanel /></section>}
            {activeTab === 'sip'       && <SipCalculator />}
          </div>
        </div>
      )}
    </div>
  )
}
