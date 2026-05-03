import type { AppData } from '../types'
import { netWorth } from './calc'

export interface Badge {
  id:       string
  emoji:    string
  title:    string
  desc:     string
  unlocked: boolean
  hint:     string
}

export function calcBadges(data: AppData): Badge[] {
  const { snapshots, debts, holdings, scenarios } = data
  const baseline     = scenarios.find(s => s.id === 'baseline') ?? scenarios[0]
  const nw           = snapshots.length ? netWorth(snapshots[snapshots.length - 1]) : 0
  const thisMonth    = new Date().toISOString().slice(0, 7)
  void thisMonth
  const monthlyIncome   = baseline?.assumptions.monthlyIncome   ?? 0
  const monthlyExpenses = baseline?.assumptions.monthlyExpenses ?? 0
  const sip          = baseline?.assumptions.extraMonthlySavings ?? 0
  const savingsRate  = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100 : 0
  const liquid       = snapshots.length ? (snapshots[snapshots.length - 1].assets.checking + snapshots[snapshots.length - 1].assets.savings) : 0
  const emergencyMonths = monthlyExpenses > 0 ? liquid / monthlyExpenses : 0
  const portfolioVal = holdings.reduce((a, h) => a + h.value, 0)
  const debtFree     = debts.every(d => d.balance <= 0)

  return [
    {
      id: 'first_step',
      emoji: '🌱',
      title: 'First Step',
      desc: 'Completed your financial profile',
      unlocked: !!localStorage.getItem('dhanpath-onboarded'),
      hint: 'Complete the onboarding wizard',
    },
    {
      id: 'first_sip',
      emoji: '📈',
      title: 'SIP Starter',
      desc: 'Started your first SIP',
      unlocked: sip > 0 || holdings.length > 0,
      hint: 'Add your first SIP or investment',
    },
    {
      id: 'emergency_shield',
      emoji: '🛡️',
      title: 'Emergency Shield',
      desc: '3 months expenses saved',
      unlocked: emergencyMonths >= 3,
      hint: `Save ${Math.max(0, 3 - emergencyMonths).toFixed(1)} more months of expenses`,
    },
    {
      id: 'saver_10',
      emoji: '💪',
      title: '10% Club',
      desc: 'Saving 10%+ of income',
      unlocked: savingsRate >= 10,
      hint: 'Increase savings rate to 10%',
    },
    {
      id: 'saver_20',
      emoji: '🚀',
      title: '20% Champion',
      desc: 'Saving 20%+ of income',
      unlocked: savingsRate >= 20,
      hint: 'Increase savings rate to 20%',
    },
    {
      id: 'debt_slayer',
      emoji: '⚔️',
      title: 'Debt Slayer',
      desc: 'Completely debt-free!',
      unlocked: debtFree && debts.length > 0,
      hint: 'Pay off all your loans',
    },
    {
      id: 'lakhpati',
      emoji: '💰',
      title: 'Lakhpati',
      desc: 'Net worth crossed ₹1 Lakh',
      unlocked: nw >= 100000,
      hint: `₹${Math.max(0, 100000 - nw).toLocaleString('en-IN')} to go`,
    },
    {
      id: 'ten_lakh',
      emoji: '💎',
      title: '10 Lakh Club',
      desc: 'Net worth crossed ₹10 Lakh',
      unlocked: nw >= 1000000,
      hint: `₹${Math.max(0, 1000000 - nw).toLocaleString('en-IN')} to go`,
    },
    {
      id: 'crorepati',
      emoji: '👑',
      title: 'Crorepati!',
      desc: 'Net worth crossed ₹1 Crore',
      unlocked: nw >= 10000000,
      hint: `₹${Math.max(0, 10000000 - nw).toLocaleString('en-IN')} to go`,
    },
    {
      id: 'ten_cr',
      emoji: '🏆',
      title: 'Top 1%',
      desc: 'Net worth crossed ₹10 Crore',
      unlocked: nw >= 100000000,
      hint: `₹${Math.max(0, 100000000 - nw).toLocaleString('en-IN')} to go`,
    },
    {
      id: 'fire_25',
      emoji: '🔥',
      title: 'Independence Starter',
      desc: '25% of the way to financial independence',
      unlocked: (() => { const t = data.settings.monthlyExpenses * 12 * 25; return t > 0 && nw / t >= 0.25 })(),
      hint: 'Reach 25% of your independence number',
    },
    {
      id: 'fire_50',
      emoji: '🌟',
      title: 'Halfway There',
      desc: '50% of the way to FIRE',
      unlocked: (() => { const t = data.settings.monthlyExpenses * 12 * 25; return t > 0 && nw / t >= 0.5 })(),
      hint: 'Reach 50% of your independence number',
    },
    {
      id: 'investor',
      emoji: '📊',
      title: 'Market Participant',
      desc: 'Portfolio value over ₹1 Lakh',
      unlocked: portfolioVal >= 100000,
      hint: 'Grow your portfolio to ₹1 Lakh',
    },
    {
      id: 'diversified',
      emoji: '🌈',
      title: 'Diversified',
      desc: '3+ different asset types',
      unlocked: new Set(holdings.map(h => h.type)).size >= 3,
      hint: 'Hold 3+ different asset types',
    },
  ]
}
