// ─── Live price fetcher ───────────────────────────────────────────────────────
// MF NAV  : mfapi.in  (free, CORS-enabled, all AMFI funds)
// Equity  : Yahoo Finance v8  (15-min delayed, free, CORS-enabled)
// Gold    : metals.live + exchange rate (free, CORS-enabled)

import type { Holding } from '../types'

const CACHE_KEY  = 'dhanpath_price_cache'
const CACHE_TTL  = 60 * 60 * 1000  // 1 hour

interface PriceCache {
  [isinOrSymbol: string]: { price: number; updatedAt: string }
}

function loadCache(): PriceCache {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') } catch { return {} }
}
function saveCache(c: PriceCache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch {}
}
function cacheGet(key: string): number | null {
  const c = loadCache()
  const entry = c[key]
  if (!entry) return null
  if (Date.now() - new Date(entry.updatedAt).getTime() > CACHE_TTL) return null
  return entry.price
}
function cacheSet(key: string, price: number) {
  const c = loadCache()
  c[key] = { price, updatedAt: new Date().toISOString() }
  saveCache(c)
}

// ─── MF NAV via mfapi.in ──────────────────────────────────────────────────────
// ISIN → scheme code → latest NAV
async function fetchMFNAV(isin: string): Promise<number | null> {
  const cached = cacheGet(isin)
  if (cached !== null) return cached

  try {
    // Step 1: search by ISIN to get scheme code
    const searchRes = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(isin)}`)
    if (!searchRes.ok) return null
    const results: { schemeCode: number; schemeName: string }[] = await searchRes.json()
    if (!results.length) return null

    const code = results[0].schemeCode

    // Step 2: get latest NAV
    const navRes = await fetch(`https://api.mfapi.in/mf/${code}/latest`)
    if (!navRes.ok) return null
    const navData = await navRes.json()
    const nav = parseFloat(navData?.data?.[0]?.nav)
    if (isNaN(nav)) return null

    cacheSet(isin, nav)
    return nav
  } catch {
    return null
  }
}

// ─── Equity/ETF price via Yahoo Finance ──────────────────────────────────────
// Tries NSE (.NS) then BSE (.BO)
async function fetchEquityPrice(symbol: string): Promise<number | null> {
  const cacheKey = `eq:${symbol}`
  const cached = cacheGet(cacheKey)
  if (cached !== null) return cached

  const suffixes = ['.NS', '.BO']
  for (const suffix of suffixes) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol + suffix)}?interval=1d&range=1d`
      const res = await fetch(url)
      if (!res.ok) continue
      const json = await res.json()
      const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice
      if (price && price > 0) {
        cacheSet(cacheKey, price)
        return price
      }
    } catch { continue }
  }
  return null
}

// ─── Gold price in INR ────────────────────────────────────────────────────────
async function fetchGoldPriceINR(): Promise<number | null> {
  const cacheKey = 'gold_inr_per_gram'
  const cached = cacheGet(cacheKey)
  if (cached !== null) return cached

  try {
    // metals.live gives price per troy oz in USD
    const [metalRes, fxRes] = await Promise.all([
      fetch('https://api.metals.live/v1/spot/gold'),
      fetch('https://api.exchangerate-api.com/v4/latest/USD'),
    ])
    if (!metalRes.ok || !fxRes.ok) return null
    const metalData = await metalRes.json()
    const fxData    = await fxRes.json()

    const usdPerOz  = metalData?.[0]?.price ?? metalData?.price
    const inrPerUsd = fxData?.rates?.INR
    if (!usdPerOz || !inrPerUsd) return null

    const inrPerGram = (usdPerOz * inrPerUsd) / 31.1035  // troy oz → grams
    cacheSet(cacheKey, inrPerGram)
    return inrPerGram
  } catch {
    return null
  }
}

// ─── Main: refresh a single holding ──────────────────────────────────────────
export async function fetchLivePrice(h: Holding): Promise<number | null> {
  const isin = h.ticker?.trim()
  const cls  = h.assetClass ?? ''

  if (!isin && !h.name) return null

  // Mutual funds: ISIN starts with INF
  if (isin?.startsWith('INF')) {
    return fetchMFNAV(isin)
  }

  // Gold (non-equity, non-MF) — physical gold or SGB
  if (cls === 'Gold' && (!isin || isin.startsWith('IN8'))) {
    const inrPerGram = await fetchGoldPriceINR()
    if (inrPerGram && h.qty) return inrPerGram * h.qty
    return null
  }

  // Equity / ETF / Debt ETF / Gold ETF on exchange — use Yahoo Finance
  if (isin?.startsWith('INE') || isin?.startsWith('IN8') ||
      h.type === 'stock' || h.type === 'etf') {
    // Zerodha stores NSE symbol in h.name for equity
    const symbol = h.name?.replace(/\s+/g, '-').toUpperCase()
    if (symbol) return fetchEquityPrice(symbol)
  }

  return null
}

// ─── Refresh all holdings, return updated list ───────────────────────────────
export interface RefreshResult {
  updated: number
  failed:  number
  skipped: number
}

export async function refreshAllPrices(
  holdings: Holding[],
  onProgress: (done: number, total: number) => void,
  updateHolding: (id: string, patch: Partial<Holding>) => void,
): Promise<RefreshResult> {
  let updated = 0, failed = 0, skipped = 0
  const now = new Date().toISOString()

  for (let i = 0; i < holdings.length; i++) {
    const h = holdings[i]
    onProgress(i, holdings.length)

    if (!h.qty || h.qty <= 0) { skipped++; continue }

    const price = await fetchLivePrice(h)
    if (price && price > 0) {
      const newValue = Math.round(price * h.qty)
      updateHolding(h.id, { lastPrice: price, value: newValue, priceUpdatedAt: now })
      updated++
    } else {
      failed++
    }
  }
  onProgress(holdings.length, holdings.length)
  return { updated, failed, skipped }
}
