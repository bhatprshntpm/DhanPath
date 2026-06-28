import type { NetWorthSnapshot, Debt, Scenario, Settings, Transaction, Goal } from '../types'

export function fmt(value: number, currency = 'INR'): string {
  if (currency === 'INR') return fmtINR(value)
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency,
    maximumFractionDigits: 0,
  }).format(value)
}

export function fmtINR(n: number): string {
  if (n === null || n === undefined || isNaN(n)) return '₹0'
  const sign = n < 0 ? '-' : ''
  const abs  = Math.abs(n)
  if (abs >= 1e7)  return `${sign}₹${(abs / 1e7).toFixed(2)} Cr`
  if (abs >= 1e5)  return `${sign}₹${(abs / 1e5).toFixed(2)} L`
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}k`
  return `${sign}₹${abs.toFixed(0)}`
}

export function fmtINRFull(n: number): string {
  if (isNaN(n)) return '₹0'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(n)
}

export function fmtPct(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

export function totalAssets(s: NetWorthSnapshot): number {
  return Object.values(s.assets).reduce((a, b) => a + b, 0)
}

export function totalLiabilities(s: NetWorthSnapshot): number {
  return Object.values(s.liabilities).reduce((a, b) => a + b, 0)
}

export function netWorth(s: NetWorthSnapshot): number {
  return totalAssets(s) - totalLiabilities(s)
}

export function monthlyCashFlow(transactions: Transaction[], month: string): { income: number; expenses: number; net: number } {
  const filtered = transactions.filter(t => t.date.startsWith(month))
  const income   = filtered.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0)
  const expenses = filtered.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)
  return { income, expenses, net: income - expenses }
}

export function fireNumber(monthlyExpenses: number, swr: number): number {
  return (monthlyExpenses * 12) / (swr / 100)
}

function blendedReturn(equityReturn: number, debtReturn: number, equityAllocation: number): number {
  const eq = Math.min(Math.max(equityAllocation, 0), 100) / 100
  return (eq * equityReturn + (1 - eq) * debtReturn) / 100
}

// Correct FIRE year: earliest year where retiring produces a portfolio that
// never depletes before lifeExpectancy — accounts for actual retirement horizon.
// This replaces the naive 25× rule which assumes a 30-yr retirement.
export function computeFireYear(
  currentNetWorth: number,
  settings: Settings,
  scenario: Scenario,
): number | null {
  const { currentAge, lifeExpectancy } = settings
  const {
    monthlyExpenses, monthlyIncome, extraMonthlySavings,
    equityReturn, debtReturn, equityAllocation,
    sipStepUp, incomeGrowthRate, inflationRate, lifestyleMultiplier,
  } = scenario.assumptions

  const r      = blendedReturn(equityReturn, debtReturn, equityAllocation)
  const inf    = inflationRate / 100
  const stepUp = (sipStepUp ?? 10) / 100
  const incG   = (incomeGrowthRate ?? 5) / 100
  const lsM    = lifestyleMultiplier ?? 1
  const curYr  = new Date().getFullYear()
  const endYr  = curYr + (lifeExpectancy - currentAge)
  const maxTestAge = Math.min(lifeExpectancy - 5, currentAge + 60)

  function survives(portfolio: number, fromYear: number): boolean {
    let p = portfolio
    for (let yr = fromYear + 1; yr <= endYr; yr++) {
      const y = yr - curYr
      p = p * (1 + r) - (monthlyExpenses * 12) * Math.pow(1 + inf, y) * lsM
      if (p <= 0) return false
    }
    return true
  }

  let portfolio = Math.max(currentNetWorth, 0)
  for (let year = curYr; year <= curYr + (maxTestAge - currentAge); year++) {
    const age = currentAge + (year - curYr)
    const y   = year - curYr

    // Apply one year of accumulation growth
    const inc  = (monthlyIncome * 12) * Math.pow(1 + incG, y)
    const exp  = (monthlyExpenses * 12) * Math.pow(1 + inf, y)
    const sip  = (extraMonthlySavings * 12) * Math.pow(1 + stepUp, y)
    portfolio  = Math.max(portfolio * (1 + r) + (inc - exp) + sip, 0)

    if (age >= currentAge && survives(portfolio, year)) return year
  }
  return null
}


export interface ProjectionPoint {
  year: number
  age: number
  value: number
  netFlow: number
  phase: 'past' | 'accumulation' | 'drawdown'
  goalNames: string[]
  goalSpend: number
  goalShortfall: number
  goalAtRisk: boolean
}

export function projectLifetimeNoGoals(
  currentNetWorth: number,
  settings: Settings,
  scenario: Scenario,
): ProjectionPoint[] {
  return projectLifetime(currentNetWorth, settings, scenario, [])
}

export function projectLifetime(
  currentNetWorth: number,
  settings: Settings,
  scenario: Scenario,
  goals: Goal[],
): ProjectionPoint[] {
  const { currentAge, lifeExpectancy, retirementAge } = settings
  const {
    monthlyIncome,
    monthlyExpenses,
    extraMonthlySavings,
    equityReturn,
    debtReturn,
    equityAllocation,
    sipStepUp,
    incomeGrowthRate,
    inflationRate,
    lifestyleMultiplier,
  } = scenario.assumptions

  const r          = blendedReturn(equityReturn, debtReturn, equityAllocation)
  const inf        = inflationRate / 100
  const incGrowth  = (incomeGrowthRate ?? 5) / 100
  const stepUp     = (sipStepUp ?? 10) / 100
  const currentYear = new Date().getFullYear()
  const endYear     = currentYear + (lifeExpectancy - currentAge)

  const goalsByAge: Record<number, Goal[]> = {}
  goals.filter(g => g.enabled).forEach(g => {
    const yr = currentYear + (g.targetAge - currentAge)
    ;(goalsByAge[yr] = goalsByAge[yr] ?? []).push(g)
  })

  const points: ProjectionPoint[] = []
  let portfolio = Math.max(currentNetWorth, 0)

  for (let year = currentYear; year <= endYear; year++) {
    const age = currentAge + (year - currentYear)
    const y   = year - currentYear
    const phase: ProjectionPoint['phase'] = age < retirementAge ? 'accumulation' : 'drawdown'

    let annualNetFlow = 0

    if (phase === 'accumulation') {
      const annualIncome   = (monthlyIncome * 12) * Math.pow(1 + incGrowth, y)
      const annualExpenses = (monthlyExpenses * 12) * Math.pow(1 + inf, y)
      const annualSip      = (extraMonthlySavings * 12) * Math.pow(1 + stepUp, y)
      annualNetFlow        = (annualIncome - annualExpenses) + annualSip
      portfolio            = Math.max(portfolio * (1 + r) + annualNetFlow, 0)
    } else {
      const retiredExpenses = (monthlyExpenses * 12) * Math.pow(1 + inf, y) * (lifestyleMultiplier ?? 1)
      annualNetFlow         = -retiredExpenses
      portfolio             = Math.max(portfolio * (1 + r) - retiredExpenses, 0)
    }

    let goalNames: string[]      = []
    let goalSpend                = 0
    let goalShortfall            = 0
    let goalAtRisk               = false
    let remaining                = portfolio

    if (goalsByAge[year]) {
      for (const g of goalsByAge[year]) {
        const cost = g.inflate ? g.amountToday * Math.pow(1 + inf, y) : g.amountToday
        if (remaining >= cost) {
          remaining  -= cost
          goalSpend  += cost
          goalNames.push(g.name)
        } else {
          goalShortfall += cost - Math.max(remaining, 0)
          goalAtRisk     = true
          goalNames.push(`${g.name} ⚠`)
          goalSpend     += Math.max(remaining, 0)
          remaining      = 0
        }
      }
      portfolio = Math.max(remaining, 0)
    }

    points.push({
      year, age,
      value: Math.round(portfolio),
      netFlow: Math.round(annualNetFlow / 12),
      phase,
      goalNames,
      goalSpend: Math.round(goalSpend),
      goalShortfall: Math.round(goalShortfall),
      goalAtRisk,
    })
  }

  return points
}

export function debtAvalanche(debts: Debt[], extraPayment: number): { months: number; totalInterest: number } {
  if (!debts.length) return { months: 0, totalInterest: 0 }
  let balances = debts.map(d => d.balance)
  const rates  = debts.map(d => d.rate / 100 / 12)
  const mins   = debts.map(d => d.minPayment)
  const sorted = [...debts.map((_, i) => i)].sort((a, b) => debts[b].rate - debts[a].rate)

  let months = 0
  let totalInterest = 0

  while (balances.some(b => b > 0) && months < 600) {
    months++
    let extra = extraPayment
    for (const i of sorted) {
      if (balances[i] <= 0) continue
      const interest = balances[i] * rates[i]
      totalInterest += interest
      balances[i]   += interest - mins[i]
      if (balances[i] < 0) { extra += Math.abs(balances[i]); balances[i] = 0 }
    }
    for (const i of sorted) {
      if (balances[i] <= 0 || extra <= 0) continue
      const pay    = Math.min(extra, balances[i])
      balances[i] -= pay
      extra       -= pay
    }
  }
  return { months, totalInterest: Math.round(totalInterest) }
}

export function yearsToFire(
  currentNetWorth: number,
  settings: Settings,
  scenario: Scenario,
  goals: Goal[],
): number {
  const target = fireNumber(settings.monthlyExpenses, settings.safeWithdrawalRate)
  const points = projectLifetime(currentNetWorth, settings, scenario, goals)
  const hit    = points.find(p => p.value >= target && p.phase === 'accumulation')
  return hit ? hit.year - new Date().getFullYear() : -1
}

// Find earliest retirement age where portfolio never depletes through lifeExpectancy.
// This is the REAL FIRE age — NOT the naive 25× rule which is calibrated for 30-yr retirements.
// For a 38-year-old planning to 100, a 62-year drawdown needs a much larger corpus.
export function trueFireAge(
  currentNetWorth: number,
  settings: Settings,
  scenario: Scenario,
  goals: Goal[],
): number | null {
  const maxTestAge = Math.min(settings.lifeExpectancy - 5, settings.currentAge + 60)
  for (let retAge = settings.currentAge; retAge <= maxTestAge; retAge++) {
    const proj = projectLifetime(currentNetWorth, { ...settings, retirementAge: retAge }, scenario, goals)
    if (proj.every(p => p.value > 0)) return retAge
  }
  return null
}


export function requiredMonthlySIP(
  currentNetWorth: number,
  settings: Settings,
  baseScenario: Scenario,
  goals: Goal[],
  maxSIP = 100000,
): number {
  function isFeasible(sip: number): boolean {
    const s = { ...baseScenario, assumptions: { ...baseScenario.assumptions, extraMonthlySavings: sip } }
    const pts = projectLifetime(currentNetWorth, settings, s, goals)
    const noShortfall = pts.every(p => p.goalShortfall <= 1)
    const neverDepletes = pts.every(p => p.value > 1)
    return noShortfall && neverDepletes
  }

  if (isFeasible(baseScenario.assumptions.extraMonthlySavings)) {
    return baseScenario.assumptions.extraMonthlySavings
  }

  let lo = 0, hi = maxSIP
  if (!isFeasible(hi)) return maxSIP

  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2
    if (isFeasible(mid)) hi = mid
    else lo = mid
  }
  return Math.ceil(hi)
}
