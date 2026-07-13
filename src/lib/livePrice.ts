// ─── Live price fetcher ───────────────────────────────────────────────────────
// MF NAV  : mfapi.in  (free, CORS-enabled, all AMFI funds)
// Equity  : Yahoo Finance v8  (15-min delayed, free, CORS-enabled)
// Gold    : metals.live + exchange rate (free, CORS-enabled)
// Crypto  : Yahoo Finance {SYMBOL}-USD → INR

import type { Holding } from '../types'

const CACHE_KEY = 'dhanpath_price_cache'
const CACHE_TTL = 60 * 60 * 1000  // 1 hour

interface PriceCache {
  [key: string]: { price: number; updatedAt: string }
}

function loadCache(): PriceCache {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') } catch { return {} }
}
function cacheGet(key: string): number | null {
  const c = loadCache(); const e = c[key]
  if (!e) return null
  if (Date.now() - new Date(e.updatedAt).getTime() > CACHE_TTL) return null
  return e.price
}
function cacheSet(key: string, price: number) {
  const c = loadCache()
  c[key] = { price, updatedAt: new Date().toISOString() }
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch {}
}

// ─── USD/INR exchange rate ────────────────────────────────────────────────────
async function getUSDINR(): Promise<number | null> {
  const cached = cacheGet('usd_inr')
  if (cached) return cached
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD')
    if (!res.ok) return null
    const data = await res.json()
    const rate = data?.rates?.INR
    if (rate) { cacheSet('usd_inr', rate); return rate }
  } catch {}
  return null
}

// ─── MF NAV via mfapi.in ──────────────────────────────────────────────────────
async function fetchMFNAV(isin: string): Promise<number | null> {
  const cached = cacheGet(isin)
  if (cached !== null) return cached
  try {
    const res = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(isin)}`)
    if (!res.ok) return null
    const results: { schemeCode: number }[] = await res.json()
    if (!results.length) return null
    const navRes = await fetch(`https://api.mfapi.in/mf/${results[0].schemeCode}/latest`)
    if (!navRes.ok) return null
    const navData = await navRes.json()
    const nav = parseFloat(navData?.data?.[0]?.nav)
    if (isNaN(nav) || nav <= 0) return null
    cacheSet(isin, nav)
    return nav
  } catch { return null }
}

// ─── Yahoo Finance price (tries multiple endpoints) ───────────────────────────
async function fetchYahooPrice(symbol: string): Promise<number | null> {
  const cacheKey = `yf:${symbol}`
  const cached = cacheGet(cacheKey)
  if (cached !== null) return cached

  // Try v8 chart endpoint (most reliable for CORS)
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } })
      if (!res.ok) continue
      const json = await res.json()
      const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice
              ?? json?.chart?.result?.[0]?.meta?.previousClose
      if (price && price > 0) { cacheSet(cacheKey, price); return price }
    } catch { continue }
  }
  return null
}

// ─── Indian equity/ETF — NSE (.NS) then BSE (.BO) ────────────────────────────
// Uses h.name directly as NSE symbol (Zerodha stores NSE ticker in name field)
async function fetchEquityPrice(symbol: string): Promise<number | null> {
  // Try the symbol as-is first (already clean NSE ticker from Zerodha)
  for (const suffix of ['.NS', '.BO', '']) {
    const price = await fetchYahooPrice(symbol + suffix)
    if (price) return price
  }
  return null
}

// ─── Gold spot price in INR per gram ─────────────────────────────────────────
async function fetchGoldPriceINR(): Promise<number | null> {
  const cached = cacheGet('gold_inr_per_gram')
  if (cached !== null) return cached
  try {
    const [metalRes, fxRes] = await Promise.all([
      fetch('https://api.metals.live/v1/spot/gold'),
      fetch('https://api.exchangerate-api.com/v4/latest/USD'),
    ])
    if (!metalRes.ok || !fxRes.ok) return null
    const metalData = await metalRes.json()
    const fxData = await fxRes.json()
    const usdPerOz = metalData?.[0]?.price ?? metalData?.price
    const inrPerUsd = fxData?.rates?.INR
    if (!usdPerOz || !inrPerUsd) return null
    const inrPerGram = (usdPerOz * inrPerUsd) / 31.1035
    cacheSet('gold_inr_per_gram', inrPerGram)
    return inrPerGram
  } catch { return null }
}

// ─── Returns true if this holding has a live price feed ──────────────────────
export function hasPriceFeed(h: Holding): boolean {
  const isin = h.ticker?.trim() ?? ''
  const cls  = h.assetClass ?? ''
  // Bank savings, FDs, deposits — no market price
  if (h.type === 'cash') return false
  if (['Savings', 'FD', 'Fixed Deposit', 'RecurringDeposit'].includes(h.subType ?? '')) return false
  if (/^(SAV|FD|CANARA_SAV|CANARA_FD|CANARA_PPF)-/i.test(isin)) return false
  // Retirement instruments — EPF/PPF/NPS have no live price
  if (h.type === 'retirement') return false
  if (/^(EPF|PPF|NPS|VPF)-/i.test(isin)) return false
  // Manual placeholders
  if (isin === '' || isin === 'MANUAL') return false
  // Mutual funds, equity, gold, crypto, international stocks — all have feeds
  if (isin.startsWith('INF')) return true  // MF
  if (isin.startsWith('INE')) return true  // Indian equity
  if (isin.startsWith('IN8')) return true  // SGB
  if (cls === 'Gold') return true
  if (cls === 'Cryptocurrency' || h.type === 'crypto') return true
  if (cls === 'International') return true
  if (h.type === 'stock' || h.type === 'etf') return true
  return false
}

// ─── Main: returns PRICE PER UNIT in INR (caller multiplies by qty) ──────────
// Exception: for Gold physical where qty = grams, returns INR per gram
export async function fetchLivePrice(h: Holding): Promise<number | null> {
  const isin = h.ticker?.trim()
  const cls  = h.assetClass ?? ''

  // Mutual funds (all types including ETFs traded as MFs)
  if (isin?.startsWith('INF')) {
    return fetchMFNAV(isin)  // returns NAV per unit
  }

  // Sovereign Gold Bonds (IN8 prefix)
  if (isin?.startsWith('IN8') || (cls === 'Gold' && h.subType === 'Sovereign Gold Bond')) {
    return fetchEquityPrice(h.name ?? '')  // SGB trades on NSE — price per unit
  }

  // Physical gold — price per gram
  if (cls === 'Gold') {
    return fetchGoldPriceINR()  // returns INR per gram (caller × qty_grams)
  }

  // Cryptocurrency — price per token in INR
  if (cls === 'Cryptocurrency' || h.type === 'crypto') {
    const symbol = (h.ticker || h.name)?.split(/[\s-]/)[0].toUpperCase()
    if (!symbol) return null
    const inrPerUsd = await getUSDINR()
    if (!inrPerUsd) return null
    const usdPrice = await fetchYahooPrice(`${symbol}-USD`)
    if (usdPrice) return usdPrice * inrPerUsd  // returns INR per token
    return null
  }

  // US stocks / International (AMZN, SNOW, AAPL etc.)
  if (cls === 'International' && h.ticker && !h.ticker.startsWith('IN')) {
    const inrPerUsd = await getUSDINR()
    if (!inrPerUsd) return null
    const usdPrice = await fetchYahooPrice(h.ticker.toUpperCase())
    if (usdPrice) return usdPrice * inrPerUsd  // returns INR per share (caller × qty)
    return null
  }

  // Indian equity/ETF (INE prefix or stock/etf type)
  if (isin?.startsWith('INE') || h.type === 'stock' || h.type === 'etf') {
    return fetchEquityPrice(h.name?.toUpperCase() ?? '')  // NSE symbol as-is
  }

  return null
}

// ─── Refresh all holdings ─────────────────────────────────────────────────────
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

    // Skip non-marketable assets (bank accounts, FDs, PPF, EPF, NPS etc.)
    if (!hasPriceFeed(h)) { skipped++; continue }

    // Skip holdings with no quantity
    if (!h.qty || h.qty <= 0) { skipped++; continue }

    const pricePerUnit = await fetchLivePrice(h)
    if (pricePerUnit && pricePerUnit > 0) {
      const newValue = Math.round(pricePerUnit * h.qty)
      updateHolding(h.id, { lastPrice: pricePerUnit, value: newValue, priceUpdatedAt: now })
      updated++
    } else {
      failed++
    }
  }
  onProgress(holdings.length, holdings.length)
  return { updated, failed, skipped }
}
