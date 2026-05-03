import { useApp } from '../context/AppContext'
import { netWorth, monthlyCashFlow, fmtINR } from '../lib/calc'

function scrollTo(sectionId: string, expandAttr?: string) {
  const el = document.getElementById(sectionId)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  // Flash highlight
  el.style.transition = 'outline 0.1s'
  el.style.outline = '2px solid #f59e0b'
  el.style.borderRadius = '16px'
  setTimeout(() => { el.style.outline = 'none' }, 1800)
  // Expand the card inside if it has a toggle button
  if (expandAttr) {
    setTimeout(() => {
      const btn = el.querySelector<HTMLButtonElement>(`[data-expand="${expandAttr}"]`)
      btn?.click()
    }, 400)
  }
}

interface ActionCard {
  priority: 'high' | 'quick' | 'insight'
  icon:     string
  title:    string
  body:     string
  cta:      string
  section:  string
  expand?:  string
}

function useActionCards(): ActionCard[] {
  const { data } = useApp()
  const { snapshots, debts, scenarios, settings, transactions } = data
  const baseline       = scenarios.find(s => s.id === 'baseline') ?? scenarios[0]
  const nw             = snapshots.length ? netWorth(snapshots[snapshots.length - 1]) : 0
  const monthlyIncome  = baseline?.assumptions.monthlyIncome   ?? 0
  const monthlyExp     = baseline?.assumptions.monthlyExpenses ?? settings.monthlyExpenses
  const sip            = baseline?.assumptions.extraMonthlySavings ?? 0
  const liquid         = snapshots.length
    ? snapshots[snapshots.length - 1].assets.checking + snapshots[snapshots.length - 1].assets.savings : 0
  const savingsRate    = monthlyIncome > 0 ? ((monthlyIncome - monthlyExp) / monthlyIncome) * 100 : 0
  const emergencyMonths = monthlyExp > 0 ? liquid / monthlyExp : 0
  const highestRateDebt = [...debts].sort((a, b) => b.rate - a.rate)[0]
  const fireTarget     = settings.monthlyExpenses * 12 * 25
  const firePct        = fireTarget > 0 ? (nw / fireTarget) * 100 : 0
  const thisMonth      = new Date().toISOString().slice(0, 7)
  const cf             = monthlyCashFlow(transactions, thisMonth)

  const cards: ActionCard[] = []

  if (!snapshots.length) {
    cards.push({
      priority: 'high',
      icon: '',
      title: 'Add your first Net Worth snapshot',
      body: 'Record your assets and liabilities today. This seeds your Lifetime Timeline and unlocks all projections.',
      cta: 'Add snapshot →',
      section: 'section-networth',
      expand: 'networth',
    })
  }

  if (!baseline?.assumptions.monthlyIncome) {
    cards.push({
      priority: 'high',
      icon: '',
      title: 'Set your income & expenses',
      body: 'Your Baseline scenario needs your monthly income and expenses to calculate projections, savings rate, and FIRE date.',
      cta: 'Open Scenario panel →',
      section: 'section-scenarios',
    })
  }

  if (emergencyMonths < 3 && snapshots.length) {
    const needed = monthlyExp * 3 - liquid
    cards.push({
      priority: 'high',
      icon: '',
      title: 'Build your Emergency Fund',
      body: `You have ${emergencyMonths.toFixed(1)} months covered. Target is 3 months (${fmtINR(needed)} more in savings/checking).`,
      cta: 'Update savings balance →',
      section: 'section-networth',
      expand: 'networth',
    })
  }

  if (highestRateDebt && highestRateDebt.rate > 10) {
    cards.push({
      priority: 'high',
      icon: '',
      title: `Pay off ${highestRateDebt.name} first`,
      body: `At ${highestRateDebt.rate}% APR this costs you the most. Use the Debt Simulator to see how extra payments help.`,
      cta: 'Open Debt Simulator →',
      section: 'section-debt',
      expand: 'debt',
    })
  }

  if (sip > 0 && savingsRate > 15 && monthlyIncome > 0) {
    const extra = Math.round(monthlyIncome * 0.05)
    const growth = Math.round(extra * 12 * ((Math.pow(1.12, 20) - 1) / 0.12))
    cards.push({
      priority: 'quick',
      icon: '',
      title: `Increase SIP by ${fmtINR(extra)}/mo`,
      body: `You're saving ${Math.round(savingsRate)}% — you have room. That extra ${fmtINR(extra)}/mo becomes ${fmtINR(growth)} in 20 years.`,
      cta: 'Simulate in Scenarios →',
      section: 'section-scenarios',
    })
  }

  if (sip === 0 && monthlyIncome > monthlyExp) {
    const suggested = Math.round((monthlyIncome - monthlyExp) * 0.5)
    cards.push({
      priority: 'quick',
      icon: '',
      title: 'Start your first SIP today',
      body: `You can invest ${fmtINR(suggested)}/month from your surplus. Set it in the Baseline scenario to see your FIRE date.`,
      cta: 'Set SIP in Scenarios →',
      section: 'section-scenarios',
    })
  }

  if (debts.length === 0 && snapshots.length) {
    cards.push({
      priority: 'quick',
      icon: '',
      title: 'Add your life goals',
      body: 'Add goals like home, education, or car. They appear as pins on your Lifetime Timeline and affect your projections.',
      cta: 'Add goals →',
      section: 'section-goals',
      expand: 'goals',
    })
  }

  if (transactions.length === 0) {
    cards.push({
      priority: 'quick',
      icon: '',
      title: 'Import your bank statement',
      body: 'Upload your bank CSV to auto-populate your income and expenses. HDFC, ICICI, SBI, Axis, Kotak all supported.',
      cta: 'Open Import →',
      section: 'section-import',
      expand: 'import',
    })
  }

  if (cf.net > 0 && transactions.length > 0) {
    cards.push({
      priority: 'insight',
      icon: '',
      title: `Saved ${fmtINR(cf.net)} this month`,
      body: `Savings rate: ${monthlyIncome > 0 ? Math.round((cf.net / monthlyIncome) * 100) : Math.round((cf.net / Math.max(cf.income, 1)) * 100)}%. ${cf.net > monthlyExp * 0.3 ? 'Consider putting extra into your SIP.' : 'Keep it up!'}`,
      cta: 'View Cash Flow →',
      section: 'section-cashflow',
      expand: 'cashflow',
    })
  }

  if (firePct > 0 && firePct < 100) {
    cards.push({
      priority: 'insight',
      icon: '',
      title: `${firePct.toFixed(1)}% to FIRE`,
      body: firePct < 25
        ? 'Focus on increasing savings rate and SIP step-up to accelerate your FIRE journey.'
        : firePct < 75
        ? 'Solid progress! Compounding kicks in harder from here. Stay consistent.'
        : 'Almost there — protect your portfolio from big drawdowns now.',
      cta: 'View Independence plan →',
      section: 'section-fire',
    })
  }

  return cards.filter(c => c.priority === 'high').slice(0, 2)
}

const PRIORITY_CONFIG = {
  high:    { bg: 'bg-rose-50',   border: 'border-rose-200',   badge: 'bg-rose-100 text-rose-600',   label: 'Needs Attention' },
  quick:   { bg: 'bg-indigo-50', border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-600', label: 'Quick Win'      },
  insight: { bg: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700',  label: 'Insight'        },
}

export default function ActionCards() {
  const cards = useActionCards()
  if (!cards.length) return null

  return (
    <div className="flex flex-col gap-3">
      <p className="section-title">Recommended Actions</p>
      <div className="flex flex-col gap-3">
        {cards.map((c, i) => {
          const cfg = PRIORITY_CONFIG[c.priority]
          return (
            <div key={i} className={`rounded-2xl border p-4 flex flex-col gap-2 ${cfg.bg} ${cfg.border}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${cfg.badge}`}>
                  {cfg.label}
                </span>
              </div>
              <p className="text-sm font-semibold text-surface-800">{c.title}</p>
              <p className="text-xs text-surface-600 leading-relaxed">{c.body}</p>
              <button
                onClick={() => scrollTo(c.section, c.expand)}
                className="mt-1 text-xs font-semibold text-amber-600 hover:text-amber-700 text-left transition-colors underline-offset-2 hover:underline">
                {c.cta}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
