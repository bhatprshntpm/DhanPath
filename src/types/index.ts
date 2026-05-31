export interface NetWorthSnapshot {
  id: string
  date: string
  assets: {
    checking: number
    savings: number
    brokerage: number
    retirement: number
    realEstate: number
    other: number
  }
  liabilities: {
    mortgage: number
    studentLoans: number
    creditCards: number
    autoLoans: number
    other: number
  }
}

export interface Transaction {
  id: string
  date: string
  amount: number
  category: string
  type: 'income' | 'expense'
  note: string
}

export interface Holding {
  id: string
  name: string
  ticker: string
  type: 'stock' | 'etf' | 'bond' | 'crypto' | 'retirement' | 'cash'
  assetClass?: string
  subType?: string
  qty?: number
  avgPrice?: number
  lastPrice?: number
  priceUpdatedAt?: string
  value: number
  costBasis: number
}

export interface Debt {
  id: string
  name: string
  balance: number
  rate: number
  minPayment: number
  color: string
}

export interface Goal {
  id: string
  name: string
  targetAge: number
  amountToday: number
  inflate: boolean
  priority: 'Must' | 'Should' | 'Nice'
  enabled: boolean
  emoji: string
}

export interface Scenario {
  id: string
  name: string
  color: string
  enabled: boolean
  assumptions: {
    monthlyIncome: number
    monthlyExpenses: number
    annualReturn: number
    equityReturn: number
    debtReturn: number
    equityAllocation: number
    extraMonthlySavings: number
    sipStepUp: number
    incomeGrowthRate: number
    inflationRate: number
    lifestyleMultiplier: number
    oneTimeEvent?: { year: number; amount: number; label: string }
  }
}

export interface Settings {
  name: string
  currentAge: number
  retirementAge: number
  lifeExpectancy: number
  annualReturn: number
  equityReturn: number
  debtReturn: number
  equityAllocation: number
  sipStepUp: number
  incomeGrowthRate: number
  inflationRate: number
  safeWithdrawalRate: number
  monthlyExpenses: number
  lifestyleMultiplier: number
  currency: string
}

export interface AppData {
  snapshots: NetWorthSnapshot[]
  transactions: Transaction[]
  holdings: Holding[]
  debts: Debt[]
  goals: Goal[]
  scenarios: Scenario[]
  settings: Settings
}
