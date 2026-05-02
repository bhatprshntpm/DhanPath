import type { AppData, Settings } from '../types'

const STORAGE_KEY = 'finance-os-data'

const DEFAULT_SETTINGS: Settings = {
  name: 'My Finances',
  currentAge: 30,
  retirementAge: 55,
  lifeExpectancy: 95,
  annualReturn: 7,
  equityReturn: 12,
  debtReturn: 7,
  equityAllocation: 70,
  sipStepUp: 10,
  incomeGrowthRate: 5,
  inflationRate: 6,
  safeWithdrawalRate: 4,
  monthlyExpenses: 5000,
  lifestyleMultiplier: 1.0,
  currency: 'USD',
}

export const DEFAULT_DATA: AppData = {
  snapshots: [],
  transactions: [],
  holdings: [],
  debts: [],
  goals: [],
  scenarios: [
    {
      id: 'baseline',
      name: 'Baseline',
      color: '#f59e0b',
      enabled: true,
      assumptions: {
        monthlyIncome: 10000,
        monthlyExpenses: 6000,
        annualReturn: 9,
        equityReturn: 12,
        debtReturn: 7,
        equityAllocation: 70,
        extraMonthlySavings: 0,
        sipStepUp: 10,
        incomeGrowthRate: 5,
        inflationRate: 6,
        lifestyleMultiplier: 1.0,
      },
    },
  ],
  settings: DEFAULT_SETTINGS,
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DATA
    const parsed = JSON.parse(raw) as Partial<AppData>
    return {
      snapshots:    parsed.snapshots    ?? [],
      transactions: parsed.transactions ?? [],
      holdings:     parsed.holdings     ?? [],
      debts:        parsed.debts        ?? [],
      goals:        parsed.goals        ?? [],
      scenarios:    parsed.scenarios    ?? DEFAULT_DATA.scenarios,
      settings:     { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    }
  } catch {
    return DEFAULT_DATA
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function exportData(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `finance-os-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importData(file: File): Promise<AppData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string) as AppData
        resolve(parsed)
      } catch {
        reject(new Error('Invalid backup file'))
      }
    }
    reader.readAsText(file)
  })
}
