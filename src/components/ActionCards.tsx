import { useApp } from '../context/AppContext'
import { netWorth, monthlyCashFlow, fmtINR } from '../lib/calc'

interface ActionCard {
  priority: 'high' | 'quick' | 'insight'
  icon:     string
  title:    string
  body:     string
  cta?:     string
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
  // const totalDebt      = debts.reduce((a, d) => a + d.balance, 0)
  const highestRateDebt = debts.sort((a, b) => b.rate - a.rate)[0]
  const fireTarget     = settings.monthlyExpenses * 12 * 25
  const firePct        = fireTarget > 0 ? (nw / fireTarget) * 100 : 0
  const thisMonth      = new Date().toISOString().slice(0, 7)
  const cf             = monthlyCashFlow(transactions, thisMonth)

  const cards: ActionCard[] = []

  // HIGH PRIORITY
  if (emergencyMonths < 3) {
    const needed = monthlyExp * 3 - liquid
    cards.push({
      priority: 'high',
      icon: '🚨',
      title: 'Build your Emergency Fund',
      body: `You have ${emergencyMonths.toFixed(1)} months covered. You need at least 3 months (${fmtINR(needed)} more) in savings before investing aggressively.`,
      cta: 'Add to savings',
    })
  }

  if (highestRateDebt && highestRateDebt.rate > 10) {
    cards.push({
      priority: 'high',
      icon: '💣',
      title: `Pay off ${highestRateDebt.name} first`,
      body: `At ${highestRateDebt.rate}% APR, this is your most expensive debt. Paying ${fmtINR(2000)} extra/month saves ${fmtINR(Math.round(highestRateDebt.balance * highestRateDebt.rate / 100 * 0.3))} in interest.`,
      cta: 'Use debt simulator',
    })
  }

  // QUICK WINS
  if (sip > 0 && savingsRate > 15) {
    const extra = Math.round(monthlyIncome * 0.05)
    const growth20yr = Math.round(extra * 12 * ((Math.pow(1.12, 20) - 1) / 0.12))
    cards.push({
      priority: 'quick',
      icon: '💡',
      title: `Increase SIP by ${fmtINR(extra)}/mo`,
      body: `You're saving ${Math.round(savingsRate)}% — you can afford ${fmtINR(extra)} more in SIP. That becomes ${fmtINR(growth20yr)} in 20 years at 12% returns.`,
      cta: 'Update in scenarios',
    })
  }

  if (sip === 0 && monthlyIncome > monthlyExp) {
    const suggested = Math.round((monthlyIncome - monthlyExp) * 0.5)
    cards.push({
      priority: 'quick',
      icon: '🚀',
      title: 'Start your first SIP today',
      body: `You can afford to invest ${fmtINR(suggested)}/month. Starting now vs 1 year later can make a difference of ${fmtINR(Math.round(suggested * 12 * ((Math.pow(1.12, 20) - 1) / 0.12) * 0.12))} over 20 years.`,
      cta: 'See how in scenarios',
    })
  }

  // INSIGHTS
  if (cf.net > 0 && transactions.length > 0) {
    cards.push({
      priority: 'insight',
      icon: '🎉',
      title: `Great month! Saved ${fmtINR(cf.net)}`,
      body: `Your savings rate this month is ${monthlyIncome > 0 ? Math.round((cf.net / monthlyIncome) * 100) : Math.round((cf.net / cf.income) * 100)}%. ${cf.net > monthlyExp * 0.3 ? 'Consider putting extra into your SIP.' : 'Keep it up!'}`,
    })
  }

  if (firePct > 0) {
    cards.push({
      priority: 'insight',
      icon: '🔥',
      title: `${firePct.toFixed(1)}% of the way to FIRE`,
      body: firePct < 25
        ? `You need ${fmtINR(fireTarget - nw)} more. At current pace, focus on increasing your SIP step-up rate.`
        : firePct < 50
        ? `Solid progress! The power of compounding kicks in more from here. Stay consistent.`
        : `You're past the halfway mark. FIRE is within sight — keep your expenses in check.`,
    })
  }

  return cards.slice(0, 4)
}

const PRIORITY_CONFIG = {
  high:    { bg: 'bg-rose-50',    border: 'border-rose-200',   text: 'text-rose-600',   label: '🚨 High Priority' },
  quick:   { bg: 'bg-indigo-50',  border: 'border-indigo-200', text: 'text-indigo-600', label: '💡 Quick Win' },
  insight: { bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',  label: '📊 This Month' },
}

export default function ActionCards() {
  const cards = useActionCards()

  if (!cards.length) return null

  return (
    <div className="flex flex-col gap-3">
      <p className="section-title">What to do next</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((c, i) => {
          const cfg = PRIORITY_CONFIG[c.priority]
          return (
            <div key={i} className={`rounded-2xl border p-4 flex flex-col gap-2 ${cfg.bg} ${cfg.border}`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{c.icon}</span>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${cfg.text}`}>{cfg.label}</span>
              </div>
              <p className="text-sm font-semibold text-surface-800">{c.title}</p>
              <p className="text-xs text-surface-600 leading-relaxed">{c.body}</p>
              {c.cta && (
                <p className={`text-xs font-semibold mt-1 ${cfg.text}`}>{c.cta} →</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
