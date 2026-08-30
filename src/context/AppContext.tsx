import {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, type ReactNode,
} from 'react'
import type { AppData, NetWorthSnapshot, Transaction, Holding, Debt, Goal, Scenario, Settings } from '../types'
import { loadData, saveData, DEFAULT_DATA } from '../lib/storage'
import { nanoid } from '../lib/nanoid'
import { refreshAllPrices } from '../lib/livePrice'
import { isKiteConfigured, isKiteTokenValid, fetchKiteSync } from '../lib/kiteConnect'
import { classifyHolding as classifyISIN } from '../lib/holdingClassifier'

/** Infer type, assetClass and subType for a new holding coming from Kite,
 *  using the ISIN prefix as the primary signal. */
function classifyKiteIsin(isin: string, tradingsymbol: string) {
  const p = isin.slice(0, 3).toUpperCase()
  if (isin.startsWith('IN8'))
    return { hType: 'bond' as const, hClass: 'Gold',  hSub: 'Sovereign Gold Bond' }
  if (isin.startsWith('IN0'))
    return { hType: 'bond' as const, hClass: 'Debt',  hSub: 'Government Securities' }
  if (p === 'INF')
    return { hType: 'etf'  as const, hClass: 'Equity', hSub: 'Mutual Fund' }
  if (p === 'INE')
    return { hType: 'stock' as const, hClass: 'Equity', hSub: tradingsymbol }
  return   { hType: 'stock' as const, hClass: 'Equity', hSub: tradingsymbol }
}

// Build a monthly snapshot from live holdings, carrying forward non-market
// buckets (cash, real estate) from the previous snapshot. Used both on app
// load and on manual refresh so the growth history builds automatically.
function snapshotFromHoldings(prev: AppData): AppData {
  const now = new Date().toISOString().slice(0, 10)  // YYYY-MM-DD — one entry per day synced
  const latest = prev.snapshots.length
    ? [...prev.snapshots].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
    : undefined

  if (prev.holdings.length === 0) return prev

  const byClass: Record<string, number> = {}
  let brokerage = 0
  let retirement = 0
  for (const h of prev.holdings) {
    const cls = h.assetClass ?? (h.type === 'retirement' ? 'Retirement' : 'Other')
    byClass[cls] = (byClass[cls] ?? 0) + h.value
    if (h.type === 'retirement') retirement += h.value
    else brokerage += h.value
  }

  // Only write a snapshot if the month changed or values moved — avoids
  // clobbering an existing same-month snapshot with identical data.
  const existingThisMonth = prev.snapshots.find(s => s.date === now)
  if (existingThisMonth) {
    const isSame = Math.abs((existingThisMonth.assets.brokerage ?? 0) - brokerage) < 1
      && Math.abs((existingThisMonth.assets.retirement ?? 0) - retirement) < 1
    if (isSame) return prev
  }

  const snap: NetWorthSnapshot = {
    id: existingThisMonth?.id ?? nanoid(),
    date: now,
    assets: {
      checking:   latest?.assets.checking   ?? 0,
      savings:    latest?.assets.savings     ?? 0,
      brokerage:  Math.round(brokerage),
      retirement: Math.round(retirement),
      realEstate: latest?.assets.realEstate  ?? 0,
      other:      Math.round(byClass['Other'] ?? 0),
    },
    liabilities: latest?.liabilities ?? { mortgage: 0, studentLoans: 0, creditCards: 0, autoLoans: 0, other: 0 },
    breakdown: Object.fromEntries(Object.entries(byClass).map(([k, v]) => [k, Math.round(v)])),
  }

  const snapshots = existingThisMonth
    ? prev.snapshots.map(s => s.id === existingThisMonth.id ? snap : s)
    : [...prev.snapshots, snap]

  return { ...prev, snapshots }
}

interface AppContextValue {
  data:        AppData
  loading:     boolean
  addSnapshot:          (s: Omit<NetWorthSnapshot, 'id'>) => void
  addOrUpdateSnapshot:  (s: Omit<NetWorthSnapshot, 'id'>) => void
  captureSnapshot:      () => void
  syncKiteHoldings:       () => Promise<{ updated: number; added: number; sips: number }>
  reclassifyUnknownMFs:   () => Promise<number>   // returns count fixed
  addTransaction:    (t: Omit<Transaction, 'id'>)      => void
  deleteTransaction: (id: string)                      => void
  addHolding:        (h: Omit<Holding, 'id'>)        => void
  replaceHoldings:   (hs: Omit<Holding, 'id'>[])      => void
  upsertHoldings:    (hs: Omit<Holding, 'id'>[])      => void
  updateHolding:     (id: string, patch: Partial<Holding>) => void
  deleteHolding:     (id: string)                     => void
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

  // ── Capture Kite token from URL fragment after OAuth redirect ──────────────
  // The Worker redirects to DhanPath as:  /DhanPath/#kite_token=ACCESS_TOKEN
  // We grab it once, store it, and clean the URL so it's not in browser history.
  useEffect(() => {
    const hash = window.location.hash
    if (!hash.includes('kite_token=')) return
    const token = new URLSearchParams(hash.slice(1)).get('kite_token')
    if (!token) return
    // Clear the fragment immediately
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    // Persist token — will be picked up by the load effect below
    loadData().then(d => {
      const next = { ...d, settings: { ...d.settings, kiteToken: token, kiteConnectedAt: new Date().toISOString() } }
      saveData(next).catch(() => {})
      latestData.current = next
      setData(next)
    }).catch(() => {})
  }, [])

  // Async initial load from IndexedDB
  useEffect(() => {
    loadData().then(d => {
      setData(d)
      latestData.current = d
      setLoading(false)
      // Auto-refresh prices on load if holdings exist, then capture a monthly
      // snapshot so the wealth history builds automatically over time.
      if (d.holdings.length > 0) {
        refreshAllPrices(d.holdings, () => {}, (id, patch) => {
          const current = latestData.current
          const updated = { ...current, holdings: current.holdings.map(h => h.id === id ? { ...h, ...patch } : h) }
          latestData.current = updated
          setData(updated)
          saveData(updated).catch(() => {})
        }).then(result => {
          // Capture a snapshot if anything moved — builds history automatically
          if (result.updated > 0) {
            const snap = snapshotFromHoldings(latestData.current)
            latestData.current = snap
            setData(snap)
            saveData(snap).catch(() => {})
          }
        }).catch(() => {})
      }
    })
  }, [])

  // Always use latest ref in mutations to avoid stale closure issues
  const update = useCallback((next: AppData) => {
    latestData.current = next
    setData(next)
    saveData(next).catch(err => console.error('[DhanPath] Save failed:', err))
  }, [])

  // Use ref-based data for all mutations so they never close over stale state
  const get = () => latestData.current

  const addSnapshot       = (s: Omit<NetWorthSnapshot, 'id'>) =>
    update({ ...get(), snapshots: [...get().snapshots, { ...s, id: nanoid() }] })

  // Update existing snapshot for same month, or add new one
  const addOrUpdateSnapshot = (s: Omit<NetWorthSnapshot, 'id'>) => {
    const existing = get().snapshots.find(x => x.date === s.date)
    if (existing) {
      const mergedBreakdown: Record<string, number> = {}
      for (const [k, v] of Object.entries(existing.breakdown ?? {})) {
        if (v !== undefined) mergedBreakdown[k] = v
      }
      for (const [cls, val] of Object.entries(s.breakdown ?? {})) {
        if (val !== undefined) mergedBreakdown[cls] = (mergedBreakdown[cls] ?? 0) + val
      }
      const merged: NetWorthSnapshot = {
        ...existing,
        assets: {
          checking:   existing.assets.checking,
          savings:    existing.assets.savings,
          brokerage:  s.assets.brokerage > 0 ? s.assets.brokerage : existing.assets.brokerage,
          retirement: s.assets.retirement > 0 ? s.assets.retirement : existing.assets.retirement,
          realEstate: existing.assets.realEstate,
          other:      s.assets.other > 0 ? s.assets.other : existing.assets.other,
        },
        liabilities: existing.liabilities,
        breakdown:   Object.keys(mergedBreakdown).length > 0 ? mergedBreakdown : undefined,
      }
      update({ ...get(), snapshots: get().snapshots.map(x => x.id === existing.id ? merged : x) })
    } else {
      update({ ...get(), snapshots: [...get().snapshots, { ...s, id: nanoid() }] })
    }
  }

  // Capture a fresh monthly snapshot from current holdings (builds history over time)
  const captureSnapshot = useCallback(() => {
    const snap = snapshotFromHoldings(get())
    update(snap)
  }, [update])

  // Auto-classify INF holdings using mfapi.in + bundled lookup (cached 30 days).
  //
  // Three outcomes per holding:
  //  A) Not userClassified + is a sentinel (subType 'Mutual Fund' or 'Other/ETF'):
  //     → auto-apply mfapi suggestion (as before)
  //  B) userClassified + mfapi DISAGREES with current assetClass/subType:
  //     → store suggestion fields + set classificationConflict: true
  //       (user sees a review card but their choice is preserved)
  //  C) userClassified + mfapi AGREES with current:
  //     → clear any previous conflict flag (no review needed)
  //
  // Returns count of holdings auto-fixed (case A only).
  const reclassifyUnknownMFs = useCallback(async (): Promise<number> => {
    const allINF = get().holdings.filter(h => h.ticker?.startsWith('INF'))
    if (allINF.length === 0) return 0

    const results = await Promise.allSettled(
      allINF.map(h => classifyISIN(h.ticker!, h.name, '', '').catch(() => null)),
    )

    const current = [...get().holdings]
    let fixed = 0, changed = false

    results.forEach((r, i) => {
      if (r.status !== 'fulfilled' || !r.value) return
      const sug = r.value
      // mfapi returned the same vague default — no useful info, skip
      if (sug.subType === 'Mutual Fund' || sug.assetClass === 'Other') return

      const h    = allINF[i]
      const idx  = current.findIndex(x => x.id === h.id)
      if (idx < 0) return

      const ex      = current[idx]
      const differs = ex.assetClass !== sug.assetClass || ex.subType !== sug.subType

      if (ex.userClassified) {
        // Case B / C — never overwrite, but track disagreements
        if (differs) {
          current[idx] = {
            ...ex,
            suggestedAssetClass:    sug.assetClass,
            suggestedSubType:       sug.subType,
            classificationConflict: true,
          }
          changed = true
        } else if (ex.classificationConflict) {
          // mfapi now agrees — clear stale conflict flag
          current[idx] = {
            ...ex,
            classificationConflict: false,
            suggestedAssetClass:    undefined,
            suggestedSubType:       undefined,
          }
          changed = true
        }
      } else {
        // Case A — auto-apply for sentinel subTypes
        const isSentinel = ex.subType === 'Mutual Fund' ||
                           (ex.assetClass === 'Other' && ex.subType === 'ETF')
        if (isSentinel && differs) {
          current[idx] = { ...ex, assetClass: sug.assetClass, subType: sug.subType }
          fixed++; changed = true
        }
      }
    })

    if (changed) update({ ...get(), holdings: current })
    return fixed
  }, [update])

  // Sync live holdings from Zerodha Kite API.
  // Fetches equity holdings (/portfolio/holdings) AND Coin MF holdings (/mf/holdings)
  // in one round-trip, plus active SIPs (/mf/sips).
  // Merges into existing DhanPath holdings by ISIN — preserves classification of
  // previously-imported holdings and only updates qty/price/value fields.
  const syncKiteHoldings = useCallback(async (): Promise<{ updated: number; added: number; sips: number }> => {
    const { kiteToken, kiteConnectedAt } = get().settings
    if (!isKiteConfigured()) throw new Error('Kite not configured')
    if (!kiteToken || !isKiteTokenValid(kiteConnectedAt))
      throw new Error('Kite session expired — please reconnect')

    const { equity, mf, sips } = await fetchKiteSync(kiteToken)
    const current = [...get().holdings]
    let updated = 0, added = 0
    const now = new Date().toISOString()

    // Helper: upsert one holding by ISIN
    function upsert(
      isin: string, name: string, qty: number,
      avgPrice: number, lastPrice: number,
      fallbackType: string, fallbackClass: string, fallbackSub: string,
    ) {
      if (!isin || qty <= 0) return
      const idx = current.findIndex(h => h.ticker === isin)
      if (idx >= 0) {
        current[idx] = {
          ...current[idx],
          qty,
          avgPrice,
          lastPrice,
          value:          Math.round(qty * lastPrice),
          costBasis:      Math.round(qty * avgPrice),
          priceUpdatedAt: now,
        }
        updated++
      } else {
        const { hType, hClass, hSub } = classifyKiteIsin(isin, fallbackSub)
        current.push({
          id:             nanoid(),
          name,
          ticker:         isin,
          type:           hType || fallbackType,
          assetClass:     hClass || fallbackClass,
          subType:        hSub  || fallbackSub,
          qty,
          avgPrice,
          lastPrice,
          value:          Math.round(qty * lastPrice),
          costBasis:      Math.round(qty * avgPrice),
          priceUpdatedAt: now,
        })
        added++
      }
    }

    // 1. Equity stocks + exchange-traded ETFs
    for (const h of equity) {
      upsert(h.isin, h.tradingsymbol, h.quantity, h.average_price, h.last_price,
             'stock', 'Equity', h.tradingsymbol)
    }

    // 2. Coin mutual funds (separate endpoint, not in /portfolio/holdings)
    for (const h of mf) {
      // Use last_price from NAV; if 0 fall back to average_price to avoid zero values
      const nav = h.last_price > 0 ? h.last_price : h.average_price
      upsert(h.tradingsymbol, h.fund, h.quantity, h.average_price, nav,
             'etf', 'Equity', 'Mutual Fund')
    }

    const activeSips = sips.filter(s => s.status === 'ACTIVE')

    // Normalise all active SIPs to a monthly equivalent.
    // weekly × (52/12) ≈ 4.33 · quarterly ÷ 3 · monthly = as-is
    function toMonthly(amount: number, freq: string): number {
      if (freq === 'weekly')    return Math.round(amount * 52 / 12)
      if (freq === 'quarterly') return Math.round(amount / 3)
      return Math.round(amount)
    }
    const kiteMonthlyInvestment = activeSips.reduce(
      (sum, s) => sum + toMonthly(s.instalment_amount, s.frequency), 0,
    )

    const next = snapshotFromHoldings({ ...get(), holdings: current })
    // Persist the SIP total so projections use real data automatically
    const withSIP = kiteMonthlyInvestment > 0
      ? { ...next, settings: { ...next.settings, kiteMonthlyInvestment } }
      : next
    update(withSIP)
    // Auto-fix any newly added MFs that got the default 'Mutual Fund' subType
    reclassifyUnknownMFs().catch(() => {})
    return { updated, added, sips: activeSips.length }
  }, [update, reclassifyUnknownMFs])

  const addTransaction    = (t: Omit<Transaction, 'id'>) =>
    update({ ...get(), transactions: [...get().transactions, { ...t, id: nanoid() }] })

  // Once loading completes, silently try to fix any stale 'Mutual Fund' subtype holdings
  // (from a previous sync before proper classification was in place).
  useEffect(() => {
    if (!loading) reclassifyUnknownMFs().catch(() => {})
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  const deleteTransaction = (id: string) =>
    update({ ...get(), transactions: get().transactions.filter(x => x.id !== id) })

  const addHolding        = (h: Omit<Holding, 'id'>) =>
    update({ ...get(), holdings: [...get().holdings, { ...h, id: nanoid() }] })

  const replaceHoldings   = (hs: Omit<Holding, 'id'>[]) =>
    update({ ...get(), holdings: hs.map(h => ({ ...h, id: nanoid() })) })

  // Upsert by ticker — updates existing if ticker matches, adds if new
  const upsertHoldings = (hs: Omit<Holding, 'id'>[]) => {
    const current = [...get().holdings]
    for (const h of hs) {
      const idx = current.findIndex(x => x.ticker && x.ticker === h.ticker)
      if (idx >= 0) {
        const existing = current[idx]
        if (existing.userClassified) {
          // User explicitly chose this classification — preserve it across XLSX re-imports.
          // Only update price/quantity fields; never touch assetClass, subType, userClassified.
          current[idx] = {
            ...existing,
            ...h,
            assetClass:     existing.assetClass,
            subType:        existing.subType,
            userClassified: true,
          }
        } else {
          current[idx] = { ...existing, ...h }
        }
      } else {
        current.push({ ...h, id: nanoid() })
      }
    }
    update({ ...get(), holdings: current })
  }

  const updateHolding     = (id: string, patch: Partial<Holding>) =>
    update({ ...get(), holdings: get().holdings.map(h => h.id === id ? { ...h, ...patch } : h) })

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
      addSnapshot, addOrUpdateSnapshot, captureSnapshot, syncKiteHoldings, reclassifyUnknownMFs,
      addTransaction, deleteTransaction,
      addHolding, replaceHoldings, upsertHoldings, updateHolding, deleteHolding,
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
