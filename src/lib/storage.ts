import type { AppData, Settings } from '../types'
import { DEMO_FLAG, DEMO_DATA } from './demoData'

const STORAGE_KEY = 'finance-os-data'

const DEFAULT_SETTINGS: Settings = {
  name: 'My Finances',
  currentAge: 28,
  retirementAge: 55,
  lifeExpectancy: 85,
  annualReturn: 12,
  equityReturn: 14,
  debtReturn: 7,
  equityAllocation: 70,
  sipStepUp: 10,
  incomeGrowthRate: 8,
  inflationRate: 6,
  safeWithdrawalRate: 4,
  monthlyExpenses: 60000,
  lifestyleMultiplier: 1.0,
  currency: 'INR',
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
        monthlyIncome: 100000,
        monthlyExpenses: 60000,
        annualReturn: 12,
        equityReturn: 14,
        debtReturn: 7,
        equityAllocation: 70,
        extraMonthlySavings: 10000,
        sipStepUp: 10,
        incomeGrowthRate: 8,
        inflationRate: 6,
        lifestyleMultiplier: 1.0,
      },
    },
  ],
  settings: DEFAULT_SETTINGS,
}

export function loadData(): AppData {
  if (localStorage.getItem(DEMO_FLAG) === '1') return DEMO_DATA
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
  if (localStorage.getItem(DEMO_FLAG) === '1') return  // don't persist demo changes
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
