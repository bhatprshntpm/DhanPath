import * as XLSX from 'xlsx'
import type { Holding, NetWorthSnapshot } from '../types'
import { classifyAll } from './holdingClassifier'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssetClass =
  | 'Equity'
  | 'Debt'
  | 'Gold'
  | 'International'
  | 'Cryptocurrency'
  | 'Real Estate'
  | 'Cash'
  | 'Other'

export type EquitySubType = 'Direct Stock' | 'Equity Mutual Fund' | 'Index ETF' | 'Equity ETF' | 'Debt Mutual Fund' | 'Debt ETF' | 'G-Sec / Bond' | 'Gold ETF' | 'Gold Fund' | 'Gold SGB' | 'International Fund' | 'International ETF' | 'Crypto' | 'Real Estate' | 'Liquid Fund' | 'Other'

export interface ZerodhaHolding {
  symbol:      string
  isin:        string
  sector:      string        // raw sector from Zerodha (equity) or instrument type (MF)
  qty:         number
  avgPrice:    number
  currentPrice:number
  currentValue:number
  costBasis:   number
  unrealisedPL:number
  unrealisedPLPct: number
  assetClass:  AssetClass
  subType:     string        // e.g. "Large Cap", "Mid Cap", "Flexi Cap", "G-Sec", etc.
  isEquity:    boolean
  isMF:        boolean
  isETF:       boolean
}

export interface ZerodhaParseResult {
  status:   'success' | 'error'
  message:  string
  holdings: ZerodhaHolding[]
  summary: {
    totalValue:     number
    totalCost:      number
    totalUnrealised:number
    byAssetClass:   Record<AssetClass, number>
    bySubType:      Record<string, number>
    bySector:       Record<string, number>
  }
}

// ─── Classification helpers ───────────────────────────────────────────────────

const GOLD_PATTERNS = /gold|sgb|sovereign gold/i
const INTL_PATTERNS = /international|overseas|foreign|us equity|nasdaq|s&p|fund of fund|fof|global/i
const LIQUID_PATTERNS = /liquid|overnight|money market|ultra short/i

function classifyEquity(sector: string, symbol: string): { assetClass: AssetClass; subType: string; isETF: boolean } {
  const s = sector.toUpperCase()
  const sym = symbol.toUpperCase()

  if (s === 'DEBT' || sym.includes('-GS') || sym.includes('GS20') || sym.includes('GS19')) {
    return { assetClass: 'Debt', subType: 'Government Securities', isETF: false }
  }
  if (s === 'ETF' || GOLD_PATTERNS.test(sym)) {
    if (GOLD_PATTERNS.test(sym)) return { assetClass: 'Gold', subType: 'Gold ETF', isETF: true }
    return { assetClass: 'Equity', subType: 'Index ETF', isETF: true }
  }
  return { assetClass: 'Equity', subType: 'Direct Stock', isETF: false }
}

function classifyMF(instrumentType: string, symbol: string): { assetClass: AssetClass; subType: string } {
  const t = instrumentType.toLowerCase()
  const s = symbol.toLowerCase()

  if (GOLD_PATTERNS.test(s) || GOLD_PATTERNS.test(t)) return { assetClass: 'Gold',          subType: 'Gold Fund'           }
  if (INTL_PATTERNS.test(s) || INTL_PATTERNS.test(t)) return { assetClass: 'International',  subType: 'International Fund'  }
  if (LIQUID_PATTERNS.test(t))                        return { assetClass: 'Debt',            subType: 'Liquid / Money Mkt'  }
  if (t.includes('index') || t.includes('etf'))       return { assetClass: 'Equity', subType: 'Index ETF' }
  if (t.startsWith('debt') || t.startsWith('hybrid - debt') || t.includes('gilt'))
                                                       return { assetClass: 'Debt',            subType: extractMFSubtype(instrumentType) }
  if (t.startsWith('equity') || t.includes('elss'))   return { assetClass: 'Equity', subType: extractMFSubtype(instrumentType) }
  if (t.includes('fund of fund'))                     return { assetClass: 'International',   subType: 'Fund of Funds'       }
  return { assetClass: 'Other', subType: instrumentType }
}

function extractMFSubtype(instrumentType: string): string {
  // "Equity - Large Cap" → "Large Cap", "Debt - Floater" → "Floater"
  const parts = instrumentType.split(' - ')
  return parts.length > 1 ? parts.slice(1).join(' - ') : instrumentType
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export async function parseZerodhaXLSX(file: File): Promise<ZerodhaParseResult> {
  try {
    const buffer = await file.arrayBuffer()
    const wb     = XLSX.read(buffer, { type: 'array' })

    // Use Combined sheet if available, else try Equity/MF separately
    const combinedSheet = wb.SheetNames.find(n => /combined/i.test(n))
    const equitySheet   = wb.SheetNames.find(n => /equity/i.test(n) && !/mutual/i.test(n))
    const mfSheet       = wb.SheetNames.find(n => /mutual fund/i.test(n))

    const holdings: ZerodhaHolding[] = []

    if (combinedSheet) {
      const ws   = wb.Sheets[combinedSheet]
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null })
      parseCombinedRows(rows, holdings)
    } else {
      if (equitySheet) {
        const ws   = wb.Sheets[equitySheet]
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null })
        parseEquityRows(rows, holdings)
      }
      if (mfSheet) {
        const ws   = wb.Sheets[mfSheet]
        const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null })
        parseMFRows(rows, holdings)
      }
    }

    if (!holdings.length) {
      return { status: 'error', message: 'No holdings found. Check the file format.', holdings: [], summary: makeSummary([]) }
    }

    // ── Run 4-layer classifier to refine asset classes ─────────────────────
    const inputs = holdings.map(h => ({
      isin: h.isin, name: h.symbol,
      instrumentType: h.isMF ? h.sector : '',
      sector: !h.isMF ? h.sector : '',
    }))
    const classifications = await classifyAll(inputs)
    classifications.forEach((c, i) => {
      holdings[i].assetClass = c.assetClass
      holdings[i].subType    = c.subType
    })

    return {
      status:  'success',
      message: `Found ${holdings.length} holdings across ${new Set(holdings.map(h => h.assetClass)).size} asset classes`,
      holdings,
      summary: makeSummary(holdings),
    }
  } catch (err: any) {
    return { status: 'error', message: String(err?.message ?? 'Failed to parse file'), holdings: [], summary: makeSummary([]) }
  }
}

// ─── Row parsers ──────────────────────────────────────────────────────────────

// Build column index map from header row — position-independent
function colMap(headerRow: any[]): Record<string, number> {
  const map: Record<string, number> = {}
  headerRow.forEach((cell, idx) => {
    if (cell != null) map[String(cell).trim()] = idx
  })
  return map
}

function findHeaderRow(rows: any[][]): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    // Symbol column can be at any position — scan entire row
    if (row.some(c => c === 'Symbol')) return i
  }
  return -1
}

function n(v: any): number {
  if (v === null || v === undefined || v === '-') return 0
  return parseFloat(String(v).replace(/,/g, '')) || 0
}

function parseCombinedRows(rows: any[][], out: ZerodhaHolding[]) {
  const headerIdx = findHeaderRow(rows)
  if (headerIdx === -1) return

  const cm = colMap(rows[headerIdx])
  const S = cm['Symbol'], IS = cm['ISIN'], SEC = cm['Sector'], IT = cm['Instrument Type']
  const QA = cm['Quantity Available'], AP = cm['Average Price']
  const CP = cm['Previous Closing Price'], PL = cm['Unrealized P&L'], PP = cm['Unrealize P&L Pct.']

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row[S] == null || row[S] === '') continue
    const symbol   = String(row[S]).trim()
    const isin     = String(row[IS] ?? '').trim()
    const sector   = String(row[SEC] ?? '').trim()
    const instType = String(row[IT] ?? '').trim()
    const qty      = n(row[QA])
    const avgPrice = n(row[AP])
    const curPrice = n(row[CP])
    const pnl      = n(row[PL])
    const pnlPct   = n(row[PP])

    if (!qty || !curPrice) continue

    const isMF  = instType && instType !== '-' && instType !== ''
    const { assetClass, subType, isETF } = isMF
      ? { ...classifyMF(instType, symbol), isETF: false }
      : classifyEquity(sector, symbol)

    out.push({
      symbol, isin, sector: isMF ? instType : sector,
      qty, avgPrice, currentPrice: curPrice,
      currentValue: qty * curPrice, costBasis: qty * avgPrice,
      unrealisedPL: pnl, unrealisedPLPct: pnlPct,
      assetClass, subType,
      isEquity: !isMF && assetClass === 'Equity',
      isMF: !!isMF, isETF: isETF || (!!isMF && assetClass === 'Equity'),
    })
  }
}

function parseEquityRows(rows: any[][], out: ZerodhaHolding[]) {
  const headerIdx = findHeaderRow(rows)
  if (headerIdx === -1) return

  const cm = colMap(rows[headerIdx])
  const S = cm['Symbol'], IS = cm['ISIN'], SEC = cm['Sector']
  const QA = cm['Quantity Available'], AP = cm['Average Price']
  const CP = cm['Previous Closing Price'], PL = cm['Unrealized P&L'], PP = cm['Unrealized P&L Pct.']

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row[S] == null || row[S] === '') continue
    const symbol = String(row[S]).trim()
    const isin   = String(row[IS] ?? '').trim()
    const sector = String(row[SEC] ?? '').trim()
    const qty    = n(row[QA])
    const avg    = n(row[AP])
    const cur    = n(row[CP])
    const pnl    = n(row[PL])
    const pct    = n(row[PP])
    if (!qty || !cur) continue
    const { assetClass, subType, isETF } = classifyEquity(sector, symbol)
    out.push({
      symbol, isin, sector, qty, avgPrice: avg, currentPrice: cur,
      currentValue: qty * cur, costBasis: qty * avg,
      unrealisedPL: pnl, unrealisedPLPct: pct,
      assetClass, subType, isEquity: true, isMF: false, isETF,
    })
  }
}

function parseMFRows(rows: any[][], out: ZerodhaHolding[]) {
  const headerIdx = findHeaderRow(rows)
  if (headerIdx === -1) return

  const cm = colMap(rows[headerIdx])
  const S = cm['Symbol'], IS = cm['ISIN'], IT = cm['Instrument Type']
  const QA = cm['Quantity Available'], AP = cm['Average Price']
  const CP = cm['Previous Closing Price'], PL = cm['Unrealized P&L'], PP = cm['Unrealized P&L Pct.']

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row[S] == null || row[S] === '') continue
    const symbol   = String(row[S]).trim()
    const isin     = String(row[IS] ?? '').trim()
    const instType = String(row[IT] ?? '').trim()
    const qty      = n(row[QA])
    const avg      = n(row[AP])
    const cur      = n(row[CP])
    const pnl      = n(row[PL])
    const pct      = n(row[PP])
    if (!qty || !cur) continue
    const { assetClass, subType } = classifyMF(instType, symbol)
    out.push({
      symbol, isin, sector: instType, qty, avgPrice: avg, currentPrice: cur,
      currentValue: qty * cur, costBasis: qty * avg,
      unrealisedPL: pnl, unrealisedPLPct: pct,
      assetClass, subType, isEquity: false, isMF: true,
      isETF: assetClass === 'Equity',
    })
  }
}

// ─── Summary builder ──────────────────────────────────────────────────────────

function makeSummary(holdings: ZerodhaHolding[]): ZerodhaParseResult['summary'] {
  const byAssetClass: Record<string, number>  = {}
  const bySubType:    Record<string, number>  = {}
  const bySector:     Record<string, number>  = {}
  let totalValue = 0, totalCost = 0, totalPL = 0

  for (const h of holdings) {
    totalValue += h.currentValue
    totalCost  += h.costBasis
    totalPL    += h.unrealisedPL
    byAssetClass[h.assetClass] = (byAssetClass[h.assetClass] ?? 0) + h.currentValue
    bySubType[h.subType]        = (bySubType[h.subType]        ?? 0) + h.currentValue
    if (h.isEquity && h.sector) {
      bySector[h.sector] = (bySector[h.sector] ?? 0) + h.currentValue
    }
  }

  return {
    totalValue, totalCost, totalUnrealised: totalPL,
    byAssetClass: byAssetClass as Record<AssetClass, number>,
    bySubType, bySector,
  }
}

// ─── Convert to AppData holdings ──────────────────────────────────────────────



export function zerodhaToHoldings(parsed: ZerodhaParseResult): Omit<Holding, 'id'>[] {
  return parsed.holdings.map(h => ({
    name:       h.symbol,
    ticker:     h.isin,
    type:       holdingType(h),
    assetClass: h.assetClass,
    subType:    h.subType,
    value:      Math.round(h.currentValue),
    costBasis:  Math.round(h.costBasis),
  }))
}

function holdingType(h: ZerodhaHolding): Holding['type'] {
  if (h.assetClass === 'Gold')           return 'bond'
  if (h.assetClass === 'Debt')           return 'bond'
  if (h.assetClass === 'Cryptocurrency') return 'crypto'
  if (h.assetClass === 'International')  return 'etf'
  if (h.assetClass === 'Equity' && h.subType === 'Direct Stock') return 'stock'
  return 'etf'
}


export function zerodhaToSnapshot(parsed: ZerodhaParseResult): Omit<NetWorthSnapshot, 'id'> {
  const by: Record<string, number> = {}
  for (const h of parsed.holdings) {
    by[h.assetClass] = (by[h.assetClass] ?? 0) + h.currentValue
  }
  return {
    date: new Date().toISOString().slice(0, 7),
    assets: {
      checking:   0,
      savings:    0,
      brokerage:  Math.round((by['Equity'] ?? 0) + (by['Debt'] ?? 0) + (by['International'] ?? 0) + (by['Cryptocurrency'] ?? 0)),
      retirement: 0,
      realEstate: 0,
      other:      Math.round(by['Gold'] ?? 0),
    },
    liabilities: { mortgage: 0, studentLoans: 0, creditCards: 0, autoLoans: 0, other: 0 },
  }
}
