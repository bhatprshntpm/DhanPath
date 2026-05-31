import * as XLSX from 'xlsx'
import { classifyAll } from './holdingClassifier'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssetClass =
  | 'Direct Equity'
  | 'Equity Mutual Funds'
  | 'Index Funds & ETFs'
  | 'Debt'
  | 'Gold'
  | 'International'
  | 'Other'

export type EquitySubType = 'Direct Equity' | 'Equity MF' | 'Index ETF' | 'Debt MF' | 'Gold' | 'International' | 'Other'

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
    return { assetClass: 'Index Funds & ETFs', subType: 'ETF', isETF: true }
  }
  return { assetClass: 'Direct Equity', subType: sector || 'Equity', isETF: false }
}

function classifyMF(instrumentType: string, symbol: string): { assetClass: AssetClass; subType: string } {
  const t = instrumentType.toLowerCase()
  const s = symbol.toLowerCase()

  if (GOLD_PATTERNS.test(s) || GOLD_PATTERNS.test(t)) return { assetClass: 'Gold',          subType: 'Gold Fund'           }
  if (INTL_PATTERNS.test(s) || INTL_PATTERNS.test(t)) return { assetClass: 'International',  subType: 'International Fund'  }
  if (LIQUID_PATTERNS.test(t))                        return { assetClass: 'Debt',            subType: 'Liquid / Money Mkt'  }
  if (t.includes('index') || t.includes('etf'))       return { assetClass: 'Index Funds & ETFs', subType: extractMFSubtype(instrumentType) }
  if (t.startsWith('debt') || t.startsWith('hybrid - debt') || t.includes('gilt'))
                                                       return { assetClass: 'Debt',            subType: extractMFSubtype(instrumentType) }
  if (t.startsWith('equity') || t.includes('elss'))   return { assetClass: 'Equity Mutual Funds', subType: extractMFSubtype(instrumentType) }
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

function findHeaderRow(rows: any[][], symbolColGuess = 1): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (row && row[symbolColGuess] === 'Symbol') return i
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

  // Combined cols: [null, Symbol, ISIN, Sector, InstrumentType, QtyAvail, QtyDisc, QtyLT, QtyPledgeM, QtyPledgeL, AvgPrice, ClosingPrice, PL, PLPct]
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row[1]) continue
    const symbol   = String(row[1]).trim()
    const isin     = String(row[2] ?? '').trim()
    const sector   = String(row[3] ?? '').trim()
    const instType = String(row[4] ?? '').trim()
    const qty      = n(row[5])
    const avgPrice = n(row[10])
    const curPrice = n(row[11])
    const pnl      = n(row[12])
    const pnlPct   = n(row[13])

    if (!qty || !curPrice) continue

    const currentValue = qty * curPrice
    const costBasis    = qty * avgPrice

    const isMF  = instType !== '-' && instType !== ''
    const { assetClass, subType, isETF } = isMF
      ? { ...classifyMF(instType, symbol), isETF: false }
      : classifyEquity(sector, symbol)

    out.push({
      symbol, isin, sector: isMF ? instType : sector,
      qty, avgPrice, currentPrice: curPrice,
      currentValue, costBasis,
      unrealisedPL: pnl, unrealisedPLPct: pnlPct,
      assetClass, subType,
      isEquity: !isMF && assetClass === 'Direct Equity',
      isMF, isETF: isETF || (isMF && assetClass === 'Index Funds & ETFs'),
    })
  }
}

function parseEquityRows(rows: any[][], out: ZerodhaHolding[]) {
  const headerIdx = findHeaderRow(rows)
  if (headerIdx === -1) return
  // Equity cols: [null, Symbol, ISIN, Sector, QtyAvail, QtyDisc, QtyLT, QtyPledgeM, QtyPledgeL, AvgPrice, ClosingPrice, PL, PLPct]
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row[1]) continue
    const symbol = String(row[1]).trim()
    const isin   = String(row[2] ?? '').trim()
    const sector = String(row[3] ?? '').trim()
    const qty    = n(row[4])
    const avg    = n(row[9])
    const cur    = n(row[10])
    const pnl    = n(row[11])
    const pct    = n(row[12])
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
  // MF cols: [null, Symbol, ISIN, InstrumentType, QtyAvail, QtyDisc, QtyPledgeM, QtyPledgeL, AvgPrice, ClosingPrice, PL, PLPct]
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row[1]) continue
    const symbol   = String(row[1]).trim()
    const isin     = String(row[2] ?? '').trim()
    const instType = String(row[3] ?? '').trim()
    const qty      = n(row[4])
    const avg      = n(row[8])
    const cur      = n(row[9])
    const pnl      = n(row[10])
    const pct      = n(row[11])
    if (!qty || !cur) continue
    const { assetClass, subType } = classifyMF(instType, symbol)
    out.push({
      symbol, isin, sector: instType, qty, avgPrice: avg, currentPrice: cur,
      currentValue: qty * cur, costBasis: qty * avg,
      unrealisedPL: pnl, unrealisedPLPct: pct,
      assetClass, subType, isEquity: false, isMF: true,
      isETF: assetClass === 'Index Funds & ETFs',
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

import type { Holding } from '../types'

export function zerodhaToHoldings(parsed: ZerodhaParseResult): Omit<Holding, 'id'>[] {
  return parsed.holdings.map(h => ({
    name:      h.symbol,
    ticker:    h.isin,
    type:      holdingType(h),
    value:     Math.round(h.currentValue),
    costBasis: Math.round(h.costBasis),
  }))
}

function holdingType(h: ZerodhaHolding): Holding['type'] {
  if (h.assetClass === 'Gold')                 return 'bond'       // using 'bond' bucket for gold too
  if (h.assetClass === 'Debt')                 return 'bond'
  if (h.assetClass === 'Index Funds & ETFs')   return 'etf'
  if (h.assetClass === 'Equity Mutual Funds')  return 'etf'
  if (h.assetClass === 'International')        return 'etf'
  if (h.assetClass === 'Direct Equity')        return 'stock'
  return 'etf'
}
