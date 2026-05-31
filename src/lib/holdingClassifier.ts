// ─── Classification engine: 4-layer approach ─────────────────────────────────
// Layer 1: ISIN prefix  →  instrument type
// Layer 2: SEBI 36 category mapping (from Zerodha Instrument Type column)
// Layer 3: Bundled ETF lookup (popular ETFs by ISIN/name)
// Layer 4: mfapi.in live lookup + IndexedDB cache

import type { AssetClass } from './zerodhaXLSXParser'

// ─── Layer 1: ISIN prefix ─────────────────────────────────────────────────────

export type ISINType = 'mutual_fund' | 'equity' | 'g_sec' | 'sgb' | 'tbill' | 'other'

export function classifyISINPrefix(isin: string): ISINType {
  if (!isin || isin.length < 4) return 'other'
  const prefix = isin.toUpperCase()
  if (prefix.startsWith('INF'))  return 'mutual_fund'
  if (prefix.startsWith('INE'))  return 'equity'
  if (prefix.startsWith('IN0020')) return 'g_sec'        // central govt securities
  if (prefix.startsWith('IN0')) return 'g_sec'
  if (prefix.startsWith('IN8')) return 'sgb'             // sovereign gold bonds
  if (prefix.startsWith('IN9')) return 'other'           // pref shares, warrants
  return 'other'
}

// ─── Layer 2: SEBI 36 MF category mapping ────────────────────────────────────
// All 36 SEBI-standardised categories → our asset classes

const SEBI_CATEGORY_MAP: Record<string, { assetClass: AssetClass; subType: string }> = {
  // Equity schemes
  'Equity - Multi Cap':               { assetClass: 'Equity', subType: 'Multi Cap' },
  'Equity - Large Cap':               { assetClass: 'Equity', subType: 'Large Cap' },
  'Equity - Large & Mid Cap':         { assetClass: 'Equity', subType: 'Large & Mid Cap' },
  'Equity - Mid Cap':                 { assetClass: 'Equity', subType: 'Mid Cap' },
  'Equity - Small Cap':               { assetClass: 'Equity', subType: 'Small Cap' },
  'Equity - Dividend Yield':          { assetClass: 'Equity', subType: 'Dividend Yield' },
  'Equity - Value':                   { assetClass: 'Equity', subType: 'Value' },
  'Equity - Contra':                  { assetClass: 'Equity', subType: 'Contra' },
  'Equity - Focused':                 { assetClass: 'Equity', subType: 'Focused' },
  'Equity - Sectoral/Thematic':       { assetClass: 'Equity', subType: 'Sectoral / Thematic' },
  'Equity - ELSS':                    { assetClass: 'Equity', subType: 'ELSS (Tax Saving)' },
  'Equity - Flexi Cap':               { assetClass: 'Equity', subType: 'Flexi Cap' },
  'Equity - International':           { assetClass: 'International',       subType: 'International Fund' },

  // Hybrid schemes
  'Hybrid - Balanced Advantage':      { assetClass: 'Equity', subType: 'Balanced Advantage' },
  'Hybrid - Aggressive Hybrid':       { assetClass: 'Equity', subType: 'Aggressive Hybrid' },
  'Hybrid - Conservative Hybrid':     { assetClass: 'Debt',                subType: 'Conservative Hybrid' },
  'Hybrid - Arbitrage':               { assetClass: 'Debt',                subType: 'Arbitrage' },
  'Hybrid - Multi Asset Allocation':  { assetClass: 'Equity', subType: 'Multi Asset' },
  'Hybrid - Equity Savings':          { assetClass: 'Equity', subType: 'Equity Savings' },

  // Debt schemes
  'Debt - Overnight':                 { assetClass: 'Debt', subType: 'Overnight / Liquid' },
  'Debt - Liquid':                    { assetClass: 'Debt', subType: 'Overnight / Liquid' },
  'Debt - Ultra Short Duration':      { assetClass: 'Debt', subType: 'Ultra Short Duration' },
  'Debt - Low Duration':              { assetClass: 'Debt', subType: 'Low Duration' },
  'Debt - Money Market':              { assetClass: 'Debt', subType: 'Money Market' },
  'Debt - Short Duration':            { assetClass: 'Debt', subType: 'Short Duration' },
  'Debt - Medium Duration':           { assetClass: 'Debt', subType: 'Medium Duration' },
  'Debt - Medium to Long Duration':   { assetClass: 'Debt', subType: 'Medium to Long Duration' },
  'Debt - Long Duration':             { assetClass: 'Debt', subType: 'Long Duration' },
  'Debt - Dynamic Bond':              { assetClass: 'Debt', subType: 'Dynamic Bond' },
  'Debt - Corporate Bond':            { assetClass: 'Debt', subType: 'Corporate Bond' },
  'Debt - Credit Risk':               { assetClass: 'Debt', subType: 'Credit Risk' },
  'Debt - Banking and PSU':           { assetClass: 'Debt', subType: 'Banking & PSU' },
  'Debt - Gilt':                      { assetClass: 'Debt', subType: 'Gilt' },
  'Debt - Gilt with 10 year Constant Duration': { assetClass: 'Debt', subType: 'Gilt (10yr)' },
  'Debt - Floater':                   { assetClass: 'Debt', subType: 'Floater' },

  // Others (index/ETF/FoF from Zerodha's Instrument Type labels)
  'Others - Index Funds/ETFs':        { assetClass: 'Equity',        subType: 'Index ETF' },
  'Others - Fund of Funds':           { assetClass: 'International', subType: 'International Fund' },
  'Others - Fund of Funds (Domestic)':{ assetClass: 'Equity',        subType: 'Fund of Funds (Domestic)' },
  'Others - ETF':                     { assetClass: 'Equity',        subType: 'Index ETF' },
  // Gold & commodity explicit SEBI categories (Zerodha sometimes uses these)
  'Other - Gold':                     { assetClass: 'Gold',          subType: 'Gold Fund' },
  'Others - Gold':                    { assetClass: 'Gold',          subType: 'Gold Fund' },
  'Commodity - Gold':                 { assetClass: 'Gold',          subType: 'Gold Fund' },
  'Other - Silver':                   { assetClass: 'Gold',          subType: 'Silver Fund' },
}

export function classifyBySebiCategory(instrumentType: string): { assetClass: AssetClass; subType: string } | null {
  // Exact match
  if (SEBI_CATEGORY_MAP[instrumentType]) return SEBI_CATEGORY_MAP[instrumentType]

  // Prefix match (handles Zerodha variations)
  for (const [key, val] of Object.entries(SEBI_CATEGORY_MAP)) {
    if (instrumentType.startsWith(key) || key.startsWith(instrumentType)) return val
  }

  // Fuzzy: category prefix
  const t = instrumentType.toLowerCase()
  if (t.startsWith('equity'))  return { assetClass: 'Equity', subType: instrumentType.split(' - ').slice(1).join(' ') || 'Equity' }
  if (t.startsWith('debt'))    return { assetClass: 'Debt',                subType: instrumentType.split(' - ').slice(1).join(' ') || 'Debt' }
  if (t.startsWith('hybrid'))  return { assetClass: 'Equity', subType: instrumentType.split(' - ').slice(1).join(' ') || 'Hybrid' }

  return null
}

// ─── Layer 3: Bundled ETF lookup table ───────────────────────────────────────
// ISINs for ~150 popular Indian ETFs (updated periodically, not live)

// Gold ETFs
const GOLD_ISINS = new Set([
  'INF204K01011', // HDFC Gold ETF
  'INF204KB18I0', // HDFC Gold ETF (new)
  'INF205K01HK3', // ICICI Pru Gold ETF
  'INF090I01239', // Kotak Gold ETF
  'INF179K01BT7', // SBI Gold ETF
  'INF247L01396', // Axis Gold ETF
  'INF846K01L48', // Nippon India ETF Gold BeES
  'INF732E01060', // Quantum Gold ETF
  'INF917L01FK8', // Mirae Asset Gold ETF
  'INF200K01YR4', // Aditya Birla SL Gold ETF
])

// SGB (Sovereign Gold Bond) - all start with IN8
// Handled by ISIN prefix IN8

// International / US equity ETFs
const INTERNATIONAL_ISINS = new Set([
  'INF204K01RC8', // HDFC S&P 500
  'INF205K01JQ6', // ICICI Pru S&P 500
  'INF846K01PX4', // Nippon India ETF Nifty 50
  'INF200K01VO3', // Aditya Birla SL NYSE FANG+
  'INF917L01FZ6', // Mirae Asset NYSE FANG+ ETF
  'INF247L01917', // Axis NASDAQ 100
  'INF769K01GS6', // Motilal Oswal NASDAQ 100 ETF
  'INF769K01GR8', // Motilal Oswal S&P 500 ETF
])

// Liquid / Cash equivalent ETFs
const LIQUID_ISINS = new Set([
  'INF846K01Q41', // Nippon India ETF Liquid BeES
])

// Name-based patterns for ETF sub-classification (when ISIN not in table)
const ETF_NAME_PATTERNS: [RegExp, { assetClass: AssetClass; subType: string }][] = [
  [/gold\s*bees|gold\s*etf|sovereign\s*gold/i,    { assetClass: 'Gold',              subType: 'Gold ETF'      }],
  [/liquid\s*bees|liquid\s*etf|money\s*market/i,  { assetClass: 'Debt',              subType: 'Overnight / Liquid'  }],
  [/nasdaq|s&p\s*500|us\s*equity|global|fang/i,   { assetClass: 'International',     subType: 'Global ETF'   }],
  [/nifty\s*bank|bank\s*bees/i,                   { assetClass: 'Equity', subType: 'Equity ETF' }],
  [/nifty\s*50|nifty\s*100|sensex|bse\s*200/i,    { assetClass: 'Equity', subType: 'Index ETF'     }],
  [/nifty\s*mid|nifty\s*small|nifty\s*next/i,     { assetClass: 'Equity', subType: 'Index ETF'}],
  [/psu\s*bond|gilt|government|g-sec/i,            { assetClass: 'Debt',              subType: 'Debt ETF'            }],
  [/silver/i,                                      { assetClass: 'Gold',              subType: 'Silver ETF'          }],
]

export function classifyByBundledLookup(isin: string, name: string): { assetClass: AssetClass; subType: string } | null {
  if (GOLD_ISINS.has(isin))          return { assetClass: 'Gold',          subType: 'Gold ETF'           }
  if (INTERNATIONAL_ISINS.has(isin)) return { assetClass: 'International', subType: 'Global ETF'  }
  if (LIQUID_ISINS.has(isin))        return { assetClass: 'Debt',          subType: 'Overnight / Liquid' }

  // ISIN prefix IN8 = SGB
  if (isin.startsWith('IN8'))        return { assetClass: 'Gold',          subType: 'Sovereign Gold Bond'}

  // Name pattern matching
  for (const [pattern, result] of ETF_NAME_PATTERNS) {
    if (pattern.test(name)) return result
  }

  return null
}

// ─── Layer 4: mfapi.in live lookup + IndexedDB cache ─────────────────────────

const CACHE_DB    = 'dhanpath-isin-cache'
const CACHE_STORE = 'isin-classifications'
const CACHE_TTL   = 30 * 24 * 60 * 60 * 1000   // 30 days

interface CachedClassification {
  isin:      string
  name:      string
  category:  string
  assetClass: AssetClass
  subType:   string
  fetchedAt: number
}

async function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB, 1)
    req.onerror   = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'isin' })
      }
    }
  })
}

async function getCached(isin: string): Promise<CachedClassification | null> {
  try {
    const db = await openCacheDB()
    return new Promise((resolve, reject) => {
      const req = db.transaction(CACHE_STORE, 'readonly').objectStore(CACHE_STORE).get(isin)
      req.onsuccess = () => {
        const r = req.result as CachedClassification | undefined
        if (!r || Date.now() - r.fetchedAt > CACHE_TTL) { resolve(null); return }
        resolve(r)
      }
      req.onerror = () => reject(req.error)
    })
  } catch { return null }
}

async function setCached(c: CachedClassification): Promise<void> {
  try {
    const db = await openCacheDB()
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(CACHE_STORE, 'readwrite').objectStore(CACHE_STORE).put(c)
      req.onsuccess = () => resolve()
      req.onerror   = () => reject(req.error)
    })
  } catch { /* non-critical */ }
}

async function fetchFromMFAPI(isin: string): Promise<CachedClassification | null> {
  try {
    // mfapi.in search by ISIN
    const res  = await fetch(`https://api.mfapi.in/mf/search?q=${isin}`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json() as any[]
    if (!data?.length) return null

    const scheme = data[0]
    const name   = scheme.schemeName ?? ''

    // Use SEBI category from the scheme name heuristics + our existing logic
    const sebi = classifyByBundledLookup(isin, name) ?? classifyFromSchemeName(name)

    if (!sebi) return null

    return {
      isin, name,
      category:  name,
      assetClass: sebi.assetClass,
      subType:    sebi.subType,
      fetchedAt:  Date.now(),
    }
  } catch { return null }
}

function classifyFromSchemeName(name: string): { assetClass: AssetClass; subType: string } | null {
  const n = name.toLowerCase()
  for (const [pattern, result] of ETF_NAME_PATTERNS) {
    if (pattern.test(n)) return result
  }
  if (n.includes('liquid') || n.includes('overnight')) return { assetClass: 'Debt', subType: 'Liquid' }
  if (n.includes('gilt'))     return { assetClass: 'Debt',   subType: 'Gilt' }
  if (n.includes('debt') || n.includes('bond') || n.includes('income') || n.includes('credit'))
    return { assetClass: 'Debt', subType: 'Debt Fund' }
  if (n.includes('index') || n.includes('nifty') || n.includes('sensex'))
    return { assetClass: 'Equity', subType: 'Index Fund' }
  if (n.includes('elss') || n.includes('tax sav')) return { assetClass: 'Equity', subType: 'ELSS (Tax Saving)' }
  if (n.includes('equity') || n.includes('growth')) return { assetClass: 'Equity', subType: 'Equity Mutual Fund' }
  return null
}

// ─── Main classification function (all 4 layers) ─────────────────────────────

export async function classifyHolding(
  isin: string,
  name: string,
  instrumentType: string,   // from Zerodha MF sheet
  sector: string,           // from Zerodha equity sheet
): Promise<{ assetClass: AssetClass; subType: string; source: string }> {

  // ── Layer 1: ISIN prefix ──────────────────────────────────────────────────
  const isinType = classifyISINPrefix(isin)

  if (isinType === 'g_sec') return { assetClass: 'Debt',  subType: 'Government Securities', source: 'isin-prefix' }
  if (isinType === 'sgb')   return { assetClass: 'Gold',  subType: 'Sovereign Gold Bond',   source: 'isin-prefix' }

  // ── Layer 1.5: Name-pattern override for ambiguous SEBI categories ──────────
  // FoF (domestic) can be Gold, Silver, or International — SEBI lumps them together.
  // Disambiguate by fund name before SEBI lookup runs.
  const nameLower = name.toLowerCase()
  const isFoF = /fund.of.fund|fof/i.test(instrumentType)
  if (isFoF || isinType === 'mutual_fund') {
    if (/\bgold\b/i.test(name))
      return { assetClass: 'Gold',          subType: 'Gold Fund',          source: 'name-pattern' }
    if (/\bsilver\b/i.test(name))
      return { assetClass: 'Gold',          subType: 'Silver Fund',        source: 'name-pattern' }
    if (isFoF && /international|overseas|us equity|nasdaq|s&p 500|global|world|foreign/i.test(nameLower))
      return { assetClass: 'International', subType: 'International Fund', source: 'name-pattern' }
  }

  // ── Layer 2: SEBI category (from Zerodha Instrument Type column) ──────────
  if (instrumentType && instrumentType !== '-') {
    const sebi = classifyBySebiCategory(instrumentType)
    if (sebi) return { ...sebi, source: 'sebi-category' }
  }

  // ── Layer 3: Bundled lookup table ─────────────────────────────────────────
  const bundled = classifyByBundledLookup(isin, name)
  if (bundled) return { ...bundled, source: 'bundled-lookup' }

  // ── Layer 4: mfapi.in with IndexedDB cache (only for mutual funds) ─────────
  if (isinType === 'mutual_fund') {
    // Check cache first
    const cached = await getCached(isin)
    if (cached) return { assetClass: cached.assetClass, subType: cached.subType, source: 'cache' }

    // Live fetch
    const live = await fetchFromMFAPI(isin)
    if (live) {
      await setCached(live)
      return { assetClass: live.assetClass, subType: live.subType, source: 'mfapi' }
    }
  }

  // ── Fallback: sector-based (for equity) ────────────────────────────────────
  if (isinType === 'equity') {
    if (sector.toUpperCase() === 'DEBT') return { assetClass: 'Debt', subType: 'Debt Security', source: 'sector' }
    if (sector.toUpperCase() === 'ETF') {
      const etfGuess = classifyByBundledLookup(isin, name)
      if (etfGuess) return { ...etfGuess, source: 'etf-pattern' }
      return { assetClass: 'Equity', subType: 'Index ETF', source: 'sector' }
    }
    return { assetClass: 'Equity', subType: sector || 'Equity', source: 'sector' }
  }

  return { assetClass: 'Other', subType: instrumentType || sector || 'Unknown', source: 'fallback' }
}

// ─── Batch classify all holdings (with progress callback) ─────────────────────

export async function classifyAll(
  holdings: Array<{ isin: string; name: string; instrumentType: string; sector: string }>,
  onProgress?: (done: number, total: number) => void,
): Promise<Array<{ assetClass: AssetClass; subType: string; source: string }>> {
  const results = []
  for (let i = 0; i < holdings.length; i++) {
    const h = holdings[i]
    results.push(await classifyHolding(h.isin, h.name, h.instrumentType, h.sector))
    onProgress?.(i + 1, holdings.length)
  }
  return results
}
