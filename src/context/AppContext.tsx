import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { AppData, NetWorthSnapshot, Transaction, Holding, Debt, Goal, Scenario, Settings } from '../types'
import { loadData, saveData } from '../lib/storage'
import { nanoid } from '../lib/nanoid'

interface AppContextValue {
  data: AppData
  addSnapshot:    (s: Omit<NetWorthSnapshot, 'id'>) => void
  addTransaction: (t: Omit<Transaction, 'id'>)      => void
  addHolding:     (h: Omit<Holding, 'id'>)          => void
  addDebt:        (d: Omit<Debt, 'id'>)             => void
  updateDebt:     (d: Debt)                          => void
  deleteDebt:     (id: string)                       => void
  addGoal:        (g: Omit<Goal, 'id'>)              => void
  updateGoal:     (g: Goal)                          => void
  deleteGoal:     (id: string)                       => void
  addScenario:    (s: Omit<Scenario, 'id'>)          => void
  updateScenario: (s: Scenario)                      => void
  deleteScenario: (id: string)                       => void
  updateSettings: (s: Partial<Settings>)             => void
  replaceData:    (d: AppData)                       => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadData())

  const update = useCallback((next: AppData) => {
    setData(next)
    saveData(next)
  }, [])

  const addSnapshot    = (s: Omit<NetWorthSnapshot, 'id'>) =>
    update({ ...data, snapshots: [...data.snapshots, { ...s, id: nanoid() }] })

  const addTransaction = (t: Omit<Transaction, 'id'>) =>
    update({ ...data, transactions: [...data.transactions, { ...t, id: nanoid() }] })

  const addHolding     = (h: Omit<Holding, 'id'>) =>
    update({ ...data, holdings: [...data.holdings, { ...h, id: nanoid() }] })

  const addDebt        = (d: Omit<Debt, 'id'>) =>
    update({ ...data, debts: [...data.debts, { ...d, id: nanoid() }] })

  const updateDebt     = (d: Debt) =>
    update({ ...data, debts: data.debts.map(x => x.id === d.id ? d : x) })

  const deleteDebt     = (id: string) =>
    update({ ...data, debts: data.debts.filter(x => x.id !== id) })

  const addGoal        = (g: Omit<Goal, 'id'>) =>
    update({ ...data, goals: [...data.goals, { ...g, id: nanoid() }] })

  const updateGoal     = (g: Goal) =>
    update({ ...data, goals: data.goals.map(x => x.id === g.id ? g : x) })

  const deleteGoal     = (id: string) =>
    update({ ...data, goals: data.goals.filter(x => x.id !== id) })

  const addScenario    = (s: Omit<Scenario, 'id'>) =>
    update({ ...data, scenarios: [...data.scenarios, { ...s, id: nanoid() }] })

  const updateScenario = (s: Scenario) =>
    update({ ...data, scenarios: data.scenarios.map(x => x.id === s.id ? s : x) })

  const deleteScenario = (id: string) =>
    update({ ...data, scenarios: data.scenarios.filter(x => x.id !== id) })

  const updateSettings = (s: Partial<Settings>) =>
    update({ ...data, settings: { ...data.settings, ...s } })

  const replaceData    = (d: AppData) => update(d)

  return (
    <AppContext.Provider value={{
      data, addSnapshot, addTransaction, addHolding,
      addDebt, updateDebt, deleteDebt,
      addGoal, updateGoal, deleteGoal,
      addScenario, updateScenario, deleteScenario,
      updateSettings, replaceData,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
