import type { AppData } from '../types'
import { netWorth } from './calc'

export interface HealthScoreBreakdown {
  total:          number
  grade:          'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D'
  color:          string
  savingsRate:    { score: number; max: number; value: number; label: string }
  emergencyFund:  { score: number; max: number; value: number; label: string }
  debtRatio:      { score: number; max: number; value: number; label: string }
  investmentRate: { score: number; max: number; value: number; label: string }
  fireProgress:   { score: number; max: number; value: number; label: string }
}

function grade(score: number): HealthScoreBreakdown['grade'] {
  if (score >= 90) return 'A+'
  if (score >= 80) return 'A'
  if (score >= 70) return 'B+'
  if (score >= 60) return 'B'
  if (score >= 50) return 'C+'
  if (score >= 40) return 'C'
  return 'D'
}

function gradeColor(score: number): string {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#f59e0b'
  if (score >= 40) return '#f97316'
  return '#ef4444'
}

export function calcHealthScore(data: AppData): HealthScoreBreakdown {
  const { snapshots, debts, scenarios, settings } = data
  const baseline  = scenarios.find(s => s.id === 'baseline') ?? scenarios[0]

  const monthlyIncome   = baseline?.assumptions.monthlyIncome   ?? settings.monthlyExpenses * 2
  const monthlyExpenses = baseline?.assumptions.monthlyExpenses ?? settings.monthlyExpenses

  // 1. Savings rate (25 pts) — target 20%+
  const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100 : 0
  const savingsScore = Math.min(Math.round((savingsRate / 30) * 25), 25)

  // 2. Emergency fund (20 pts) — target 6 months expenses
  const nw            = snapshots.length ? netWorth(snapshots[snapshots.length - 1]) : 0
  const liquid        = snapshots.length
    ? (snapshots[snapshots.length - 1].assets.checking + snapshots[snapshots.length - 1].assets.savings)
    : 0
  const emergencyMonths = monthlyExpenses > 0 ? liquid / monthlyExpenses : 0
  const emergencyScore  = Math.min(Math.round((emergencyMonths / 6) * 20), 20)

  // 3. Debt-to-income ratio (20 pts) — target <30%
  const totalEMI     = debts.reduce((a, d) => a + d.minPayment, 0)
  const dtiRatio     = monthlyIncome > 0 ? (totalEMI / monthlyIncome) * 100 : 0
  const debtScore    = debts.length === 0 ? 20 : Math.max(Math.round((1 - dtiRatio / 50) * 20), 0)

  // 4. Investment rate (20 pts) — target 15%+ of income in SIPs/market
  const monthlySIP       = baseline?.assumptions.extraMonthlySavings ?? 0
  const investmentRate   = monthlyIncome > 0 ? (monthlySIP / monthlyIncome) * 100 : 0
  const investmentScore  = Math.min(Math.round((investmentRate / 20) * 20), 20)

  // 5. FIRE progress (15 pts)
  const fireTarget    = settings.monthlyExpenses * 12 * 25
  const firePct       = fireTarget > 0 ? (nw / fireTarget) * 100 : 0
  const fireScore     = Math.min(Math.round((firePct / 100) * 15), 15)

  const total = savingsScore + emergencyScore + debtScore + investmentScore + fireScore

  return {
    total,
    grade:         grade(total),
    color:         gradeColor(total),
    savingsRate:   { score: savingsScore,   max: 25, value: Math.round(savingsRate),    label: `${Math.round(savingsRate)}% savings rate` },
    emergencyFund: { score: emergencyScore, max: 20, value: emergencyMonths,            label: `${emergencyMonths.toFixed(1)}x months covered` },
    debtRatio:     { score: debtScore,      max: 20, value: Math.round(dtiRatio),       label: debts.length === 0 ? 'No active debts 🎉' : `${Math.round(dtiRatio)}% debt-to-income` },
    investmentRate:{ score: investmentScore,max: 20, value: Math.round(investmentRate), label: `${Math.round(investmentRate)}% income invested` },
    fireProgress:  { score: fireScore,      max: 15, value: Math.round(firePct),        label: `${Math.round(firePct)}% to FIRE number` },
  }
}

export const HEALTH_LABELS: Record<HealthScoreBreakdown['grade'], { emoji: string; text: string; sub: string }> = {
  'A+': { emoji: '🏆', text: 'Exceptional',      sub: 'You are in the top tier. Keep it up!' },
  'A':  { emoji: '🌟', text: 'Excellent',         sub: 'Great financial discipline. Nearly perfect.' },
  'B+': { emoji: '💪', text: 'Very Good',         sub: 'Strong foundation. A few tweaks and you\'re elite.' },
  'B':  { emoji: '👍', text: 'Good',              sub: 'On the right track. Room to grow.' },
  'C+': { emoji: '📈', text: 'Improving',         sub: 'Making progress. Focus on savings and debt.' },
  'C':  { emoji: '⚠️', text: 'Needs Attention',  sub: 'Some areas need urgent focus.' },
  'D':  { emoji: '🚨', text: 'Critical',          sub: 'Time to take action. Start with an emergency fund.' },
}
