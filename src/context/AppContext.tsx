import {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, type ReactNode,
} from 'react'
import type { AppData, NetWorthSnapshot, Transaction, Holding, Debt, Goal, Scenario, Settings } from '../types'
import { loadData, saveData, DEFAULT_DATA } from '../lib/storage'
import { nanoid } from '../lib/nanoid'

interface AppContextValue {
  data:        AppData
  loading:     boolean
  addSnapshot:    (s: Omit<NetWorthSnapshot, 'id'>) => void
  addTransaction: (t: Omit<Transaction, 'id'>)      => void
  deleteTransaction: (id: string)                   => void
  addHolding:     (h: Omit<Holding, 'id'>)          => void
  deleteHolding:  (id: string)                       => void
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
  const [data, setData]       = useState<AppData>(DEFAULT_DATA)
  const [loading, setLoading] = useState(true)
  const latestData            = useRef<AppData>(DEFAULT_DATA)

  // Async initial load from IndexedDB
  useEffect(() => {
    loadData().then(d => {
      setData(d)
      latestData.current = d
      setLoading(false)
    })
  }, [])

  // Always use latest ref in mutations to avoid stale closure issues
  const update = useCallback((next: AppData) => {
    latestData.current = next
    setData(next)
    saveData(next)   // fire-and-forget async write
  }, [])

  // Use ref-based data for all mutations so they never close over stale state
  const get = () => latestData.current

  const addSnapshot       = (s: Omit<NetWorthSnapshot, 'id'>) =>
    update({ ...get(), snapshots: [...get().snapshots, { ...s, id: nanoid() }] })

  const addTransaction    = (t: Omit<Transaction, 'id'>) =>
    update({ ...get(), transactions: [...get().transactions, { ...t, id: nanoid() }] })

  const deleteTransaction = (id: string) =>
    update({ ...get(), transactions: get().transactions.filter(x => x.id !== id) })

  const addHolding        = (h: Omit<Holding, 'id'>) =>
    update({ ...get(), holdings: [...get().holdings, { ...h, id: nanoid() }] })

  const deleteHolding     = (id: string) =>
    update({ ...get(), holdings: get().holdings.filter(x => x.id !== id) })

  const addDebt           = (d: Omit<Debt, 'id'>) =>
    update({ ...get(), debts: [...get().debts, { ...d, id: nanoid() }] })

  const updateDebt        = (d: Debt) =>
    update({ ...get(), debts: get().debts.map(x => x.id === d.id ? d : x) })

  const deleteDebt        = (id: string) =>
    update({ ...get(), debts: get().debts.filter(x => x.id !== id) })

  const addGoal           = (g: Omit<Goal, 'id'>) =>
    update({ ...get(), goals: [...get().goals, { ...g, id: nanoid() }] })

  const updateGoal        = (g: Goal) =>
    update({ ...get(), goals: get().goals.map(x => x.id === g.id ? g : x) })

  const deleteGoal        = (id: string) =>
    update({ ...get(), goals: get().goals.filter(x => x.id !== id) })

  const addScenario       = (s: Omit<Scenario, 'id'>) =>
    update({ ...get(), scenarios: [...get().scenarios, { ...s, id: nanoid() }] })

  const updateScenario    = (s: Scenario) =>
    update({ ...get(), scenarios: get().scenarios.map(x => x.id === s.id ? s : x) })

  const deleteScenario    = (id: string) =>
    update({ ...get(), scenarios: get().scenarios.filter(x => x.id !== id) })

  const updateSettings    = (s: Partial<Settings>) =>
    update({ ...get(), settings: { ...get().settings, ...s } })

  const replaceData       = (d: AppData) => update(d)

  return (
    <AppContext.Provider value={{
      data, loading,
      addSnapshot, addTransaction, deleteTransaction,
      addHolding, deleteHolding,
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
