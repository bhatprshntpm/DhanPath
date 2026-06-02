import type { AppData } from '../types'

export const DEMO_FLAG   = 'dhanpath-demo-mode'
export const ONBOARD_KEY = 'dhanpath-onboarded'

export function isDemoMode(): boolean {
  return localStorage.getItem(DEMO_FLAG) === '1'
}
export function clearDemoMode(): void {
  localStorage.removeItem(DEMO_FLAG)
  localStorage.setItem(ONBOARD_KEY, '1')  // mark onboarded so demo never re-triggers
}
export function setDemoMode(): void {
  localStorage.setItem(DEMO_FLAG, '1')
  localStorage.setItem(ONBOARD_KEY, '1')
}

// ─── Fictional profile: Arjun Sharma, 32, Bangalore software engineer ─────────
export const DEMO_DATA: AppData = {
  settings: {
    name:                'Arjun Sharma',
    currentAge:          32,
    retirementAge:       50,
    lifeExpectancy:      85,
    annualReturn:        12,
    equityReturn:        14,
    debtReturn:          7,
    equityAllocation:    70,
    sipStepUp:           10,
    incomeGrowthRate:    8,
    inflationRate:       6,
    safeWithdrawalRate:  4,
    monthlyExpenses:     80000,
    monthlyIncome:       200000,
    existingSIP:         30000,
    monthlyEMI:          0,
    realEstateReturn:    5,
    lifestyleMultiplier: 1.0,
    currency:            'INR',
  },

  snapshots: (() => {
    const snaps = []
    const assets = [
      { checking: 180000, savings: 350000, brokerage: 420000, retirement: 680000, realEstate: 0,       other: 45000  },
      { checking: 200000, savings: 380000, brokerage: 510000, retirement: 730000, realEstate: 0,       other: 45000  },
      { checking: 155000, savings: 400000, brokerage: 580000, retirement: 785000, realEstate: 0,       other: 50000  },
      { checking: 175000, savings: 420000, brokerage: 640000, retirement: 840000, realEstate: 4200000, other: 52000  },
      { checking: 190000, savings: 445000, brokerage: 710000, retirement: 895000, realEstate: 4250000, other: 55000  },
      { checking: 210000, savings: 470000, brokerage: 790000, retirement: 950000, realEstate: 4300000, other: 58000  },
    ]
    const liab = [
      { mortgage: 2800000, studentLoans: 0, creditCards: 22000, autoLoans: 280000, other: 0 },
      { mortgage: 2780000, studentLoans: 0, creditCards: 15000, autoLoans: 265000, other: 0 },
      { mortgage: 2760000, studentLoans: 0, creditCards: 18000, autoLoans: 250000, other: 0 },
      { mortgage: 2740000, studentLoans: 0, creditCards: 12000, autoLoans: 234000, other: 0 },
      { mortgage: 2720000, studentLoans: 0, creditCards: 8000,  autoLoans: 218000, other: 0 },
      { mortgage: 2700000, studentLoans: 0, creditCards: 14000, autoLoans: 202000, other: 0 },
    ]
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      snaps.push({
        id:          `demo-snap-${i}`,
        date:        d.toISOString().slice(0, 7),
        assets:      assets[5 - i],
        liabilities: liab[5 - i],
      })
    }
    return snaps
  })(),

  transactions: (() => {
    const txns = []
    const categories = [
      { cat: 'Salary',        type: 'income'  as const, min: 165000, max: 175000 },
      { cat: 'Freelance',     type: 'income'  as const, min: 15000,  max: 30000  },
      { cat: 'Housing',       type: 'expense' as const, min: 28000,  max: 28000  },
      { cat: 'Food',          type: 'expense' as const, min: 8000,   max: 12000  },
      { cat: 'Transport',     type: 'expense' as const, min: 4000,   max: 6000   },
      { cat: 'Investments',   type: 'expense' as const, min: 25000,  max: 30000  },
      { cat: 'Subscriptions', type: 'expense' as const, min: 2000,   max: 3000   },
      { cat: 'Loan EMI',      type: 'expense' as const, min: 32000,  max: 32000  },
      { cat: 'Healthcare',    type: 'expense' as const, min: 1500,   max: 5000   },
      { cat: 'Entertainment', type: 'expense' as const, min: 3000,   max: 6000   },
    ]
    let id = 0
    for (let m = 5; m >= 0; m--) {
      const d = new Date(); d.setMonth(d.getMonth() - m)
      const month = d.toISOString().slice(0, 7)
      for (const c of categories) {
        const amount = c.min + Math.floor(Math.random() * (c.max - c.min + 1))
        txns.push({
          id:       `demo-txn-${id++}`,
          date:     `${month}-${String(5 + Math.floor(Math.random() * 20)).padStart(2, '0')}`,
          amount,
          category: c.cat,
          type:     c.type,
          note:     c.cat === 'Salary' ? 'Monthly salary credit' : c.cat === 'Housing' ? 'Rent — Whitefield' : '',
        })
      }
    }
    return txns
  })(),

  holdings: [
    { id: 'demo-h1',  name: 'Nifty 50 Index Fund',         ticker: 'NIFTY50',   type: 'etf',        value: 285000,  costBasis: 210000 },
    { id: 'demo-h2',  name: 'Parag Parikh Flexi Cap',       ticker: 'PPFCF',     type: 'etf',        value: 175000,  costBasis: 140000 },
    { id: 'demo-h3',  name: 'HDFC Mid Cap Opportunities',   ticker: 'HDFCMC',    type: 'etf',        value: 130000,  costBasis: 98000  },
    { id: 'demo-h4',  name: 'Reliance Industries',          ticker: 'RELIANCE',  type: 'stock',      value: 85000,   costBasis: 62000  },
    { id: 'demo-h5',  name: 'Infosys',                      ticker: 'INFY',      type: 'stock',      value: 68000,   costBasis: 55000  },
    { id: 'demo-h6',  name: 'HDFC Bank',                    ticker: 'HDFCBANK',  type: 'stock',      value: 47000,   costBasis: 40000  },
    { id: 'demo-h7',  name: 'SBI Liquid Fund',              ticker: 'SBILF',     type: 'etf',        value: 120000,  costBasis: 118000 },
    { id: 'demo-h8',  name: 'EPF Corpus',                   ticker: 'EPF',       type: 'retirement', value: 950000,  costBasis: 720000 },
    { id: 'demo-h9',  name: 'NPS Tier 1',                   ticker: 'NPS',       type: 'retirement', value: 180000,  costBasis: 150000 },
    { id: 'demo-h10', name: 'HDFC FD',                      ticker: 'FD',        type: 'bond',       value: 200000,  costBasis: 200000 },
    { id: 'demo-h11', name: 'Sovereign Gold Bond 2026',     ticker: 'SGB',       type: 'bond',       value: 85000,   costBasis: 72000  },
  ],

  debts: [
    { id: 'demo-d1', name: 'Home Loan — HDFC',  balance: 2700000, rate: 8.5,  minPayment: 28000, color: '#ef4444' },
    { id: 'demo-d2', name: 'Car Loan — Axis',    balance: 202000,  rate: 9.2,  minPayment: 7200,  color: '#f59e0b' },
    { id: 'demo-d3', name: 'Credit Card — ICICI',balance: 14000,   rate: 42.0, minPayment: 2500,  color: '#8b5cf6' },
  ],

  goals: [
    { id: 'demo-g1', name: 'Home Renovation',    targetAge: 34, amountToday: 500000,  inflate: true,  priority: 'Should', enabled: true, emoji: '🏠' },
    { id: 'demo-g2', name: "Child's Education",  targetAge: 48, amountToday: 2000000, inflate: true,  priority: 'Must',   enabled: true, emoji: '🎓' },
    { id: 'demo-g3', name: 'International Trip', targetAge: 35, amountToday: 150000,  inflate: true,  priority: 'Nice',   enabled: true, emoji: '✈️' },
  ],

  scenarios: [
    {
      id: 'baseline',
      name: 'Baseline',
      color: '#f59e0b',
      enabled: true,
      assumptions: {
        monthlyIncome:        170000,
        monthlyExpenses:      80000,
        annualReturn:         12,
        equityReturn:         14,
        debtReturn:           7,
        equityAllocation:     70,
        extraMonthlySavings:  25000,
        sipStepUp:            10,
        incomeGrowthRate:     8,
        inflationRate:        6,
        lifestyleMultiplier:  1.0,
      },
    },
  ],
}
