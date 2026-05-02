import type { Holding, Transaction } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BrokerName = 'Zerodha' | 'Groww' | 'Angel' | 'Upstox' | 'Generic'

export interface ParsedEquityHolding {
  symbol:       string
  name:         string
  isin:         string
  quantity:     number
  avgCost:      number
  currentPrice: number
  currentValue: number
  investedValue:number
  pnl:          number
  pnlPct:       number
  type:         'stock' | 'etf' | 'mf'
}

export interface ParsedEquityTransaction {
  date:      string
  symbol:    string
  isin:      string
  quantity:  number
  price:     number
  amount:    number
  tradeType: 'buy' | 'sell'
  exchange:  string
}

export interface EquityParseResult {
  status:       'success' | 'error' | 'empty'
  message:      string
  broker:       BrokerName
  mode:         'holdings' | 'transactions' | 'both'
  holdings:     ParsedEquityHolding[]
  transactions: ParsedEquityTransaction[]
  totalValue:   number
  totalInvested:number
  totalPnL:     number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(s: string | undefined): number {
  if (!s) return 0
  return parseFloat(s.replace(/[,%₹\s]/g, '')) || 0
}

function csvRows(text: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    const cols: string[] = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue }
      if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    cols.push(cur.trim())
    if (cols.some(c => c)) rows.push(cols)
  }
  return rows
}

function col(header: string[], ...keys: string[]): number {
  const lh = header.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
  for (const k of keys) {
    const kl = k.toLowerCase().replace(/[^a-z0-9]/g, '')
    const i  = lh.indexOf(kl)
    if (i >= 0) return i
  }
  for (const k of keys) {
    const kl = k.toLowerCase().replace(/[^a-z0-9]/g, '')
    const i  = lh.findIndex(h => h.includes(kl) || kl.includes(h))
    if (i >= 0) return i
  }
  return -1
}

function parseDate(s: string): string {
  if (!s) return ''
  s = s.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`
  return ''
}

const ETF_PATTERNS = /\bETF\b|BeES|NIFTY\s*ETF|SENSEX\s*ETF|LIQUID|GILT|BOND/i

// ─── Broker detection ─────────────────────────────────────────────────────────

function detectBroker(header: string): BrokerName {
  const h = header.toLowerCase()
  // Zerodha holdings: "Instrument,Qty,Avg. cost,LTP,Cur. val,P&L"
  if (/instrument.*qty.*avg.*cost.*ltp|cur.*val.*p.*l/i.test(h)) return 'Zerodha'
  // Zerodha P&L / tradebook: "Symbol,ISIN,Trade date,Exchange,Quantity,Trade type,Price"
  if (/trade date.*exchange.*trade type/i.test(h)) return 'Zerodha'
  // Groww: "Stock Name,Quantity,Average Buy Price,Current Price,Current Value"
  if (/stock name.*average buy price|current value.*invested/i.test(h)) return 'Groww'
  // Angel: "Symbol,Net Qty,Avg Price,LTP,Current Value,P&L"
  if (/net qty.*avg price.*ltp/i.test(h)) return 'Angel'
  // Upstox: "Instrument Name,ISIN,Quantity,Average Price,LTP,Current Value"
  if (/instrument name.*isin.*average price/i.test(h)) return 'Upstox'
  return 'Generic'
}

// ─── Zerodha ──────────────────────────────────────────────────────────────────

function parseZerodhHoldings(header: string[], rows: string[][]): ParsedEquityHolding[] {
  const iSymbol = col(header, 'Instrument', 'Symbol')
  const iQty    = col(header, 'Qty.', 'Qty', 'Quantity')
  const iAvg    = col(header, 'Avg. cost', 'Avg cost', 'Average Cost')
  const iLTP    = col(header, 'LTP')
  const iVal    = col(header, 'Cur. val', 'Current Value')
  const iPnL    = col(header, 'P&L', 'PnL', 'Net P&L')

  return rows.map(r => {
    const symbol       = r[iSymbol] ?? ''
    const qty          = num(r[iQty])
    const avg          = num(r[iAvg])
    const ltp          = num(r[iLTP])
    const curVal       = num(r[iVal]) || qty * ltp
    const invested     = qty * avg
    const pnl          = num(r[iPnL]) || curVal - invested
    const pnlPct       = invested > 0 ? (pnl / invested) * 100 : 0
    return {
      symbol, name: symbol, isin: '', quantity: qty, avgCost: avg,
      currentPrice: ltp, currentValue: curVal, investedValue: invested,
      pnl, pnlPct, type: ETF_PATTERNS.test(symbol) ? 'etf' : 'stock',
    } as ParsedEquityHolding
  }).filter(h => h.symbol && h.quantity > 0)
}

function parseZerodhaTradeBook(header: string[], rows: string[][]): ParsedEquityTransaction[] {
  const iSymbol   = col(header, 'Symbol', 'Instrument', 'Stock Symbol')
  const iISIN     = col(header, 'ISIN')
  const iDate     = col(header, 'Trade Date', 'Order Date', 'Date')
  const iExchange = col(header, 'Exchange')
  const iQty      = col(header, 'Quantity', 'Qty')
  const iType     = col(header, 'Trade Type', 'Buy/Sell', 'Type')
  const iPrice    = col(header, 'Price')

  return rows.map(r => {
    const qty   = num(r[iQty])
    const price = num(r[iPrice])
    const type  = (r[iType] ?? '').toLowerCase().trim()
    return {
      date:      parseDate(r[iDate] ?? ''),
      symbol:    r[iSymbol] ?? '',
      isin:      iISIN >= 0 ? (r[iISIN] ?? '') : '',
      quantity:  qty,
      price,
      amount:    qty * price,
      tradeType: type === 'sell' ? 'sell' : 'buy',
      exchange:  iExchange >= 0 ? (r[iExchange] ?? 'NSE') : 'NSE',
    } as ParsedEquityTransaction
  }).filter(t => t.symbol && t.quantity > 0 && t.date)
}

// ─── Groww ───────────────────────────────────────────────────────────────────

function parseGrowwHoldings(header: string[], rows: string[][]): ParsedEquityHolding[] {
  const iName    = col(header, 'Stock Name', 'Fund Name', 'Name', 'Scheme Name')
  const iSymbol  = col(header, 'Symbol', 'NSE Symbol')
  const iISIN    = col(header, 'ISIN')
  const iQty     = col(header, 'Quantity', 'Units', 'Qty')
  const iAvg     = col(header, 'Average Buy Price', 'Avg Buy Price', 'Buy Price')
  const iLTP     = col(header, 'Current Price', 'LTP', 'NAV')
  const iVal     = col(header, 'Current Value', 'Market Value')
  const iInvested= col(header, 'Invested Value', 'Invested Amount', 'Purchase Value')

  return rows.map(r => {
    const name      = r[iName]    ?? ''
    const symbol    = iSymbol >= 0 ? (r[iSymbol] ?? name) : name
    const qty       = num(r[iQty])
    const avg       = num(r[iAvg])
    const ltp       = num(r[iLTP])
    const curVal    = num(r[iVal])   || qty * ltp
    const invested  = iInvested >= 0 ? num(r[iInvested]) : qty * avg
    const pnl       = curVal - invested
    const pnlPct    = invested > 0 ? (pnl / invested) * 100 : 0
    return {
      symbol: symbol.slice(0, 20), name: name.slice(0, 80),
      isin: iISIN >= 0 ? (r[iISIN] ?? '') : '',
      quantity: qty, avgCost: avg, currentPrice: ltp,
      currentValue: curVal, investedValue: invested,
      pnl, pnlPct,
      type: ETF_PATTERNS.test(name) ? 'etf' : /fund|scheme/i.test(name) ? 'mf' : 'stock',
    } as ParsedEquityHolding
  }).filter(h => h.name && h.quantity > 0)
}

// ─── Angel / Upstox (generic fallback) ───────────────────────────────────────

function parseGenericHoldings(header: string[], rows: string[][]): ParsedEquityHolding[] {
  const iSymbol  = col(header, 'Symbol', 'Instrument', 'Instrument Name', 'Stock', 'Name')
  const iISIN    = col(header, 'ISIN')
  const iQty     = col(header, 'Net Qty', 'Quantity', 'Qty', 'Units', 'Holdings')
  const iAvg     = col(header, 'Avg Price', 'Average Price', 'Avg. Cost', 'Buy Price', 'Cost Price')
  const iLTP     = col(header, 'LTP', 'Current Price', 'Market Price', 'Last Price')
  const iVal     = col(header, 'Current Value', 'Market Value', 'Cur. val', 'Value')
  const iPnL     = col(header, 'P&L', 'PnL', 'Profit/Loss', 'Unrealised P&L')

  if (iSymbol === -1 || iQty === -1) return []

  return rows.map(r => {
    const symbol    = r[iSymbol] ?? ''
    const qty       = num(r[iQty])
    const avg       = num(r[iAvg])
    const ltp       = iLTP >= 0 ? num(r[iLTP]) : 0
    const curVal    = iVal >= 0 ? num(r[iVal])  : qty * ltp
    const invested  = qty * avg
    const pnl       = iPnL >= 0 ? num(r[iPnL])  : curVal - invested
    const pnlPct    = invested > 0 ? (pnl / invested) * 100 : 0
    return {
      symbol: symbol.slice(0, 20), name: symbol.slice(0, 80),
      isin: iISIN >= 0 ? (r[iISIN] ?? '') : '',
      quantity: qty, avgCost: avg, currentPrice: ltp,
      currentValue: curVal, investedValue: invested,
      pnl, pnlPct, type: ETF_PATTERNS.test(symbol) ? 'etf' : 'stock',
    } as ParsedEquityHolding
  }).filter(h => h.symbol && h.quantity > 0)
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function parseEquityCSV(csvText: string): EquityParseResult {
  const rows = csvRows(csvText)
  if (rows.length < 2) return { status: 'empty', message: 'File appears empty', broker: 'Generic', mode: 'holdings', holdings: [], transactions: [], totalValue: 0, totalInvested: 0, totalPnL: 0 }

  // Find header
  let headerIdx = 0
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = rows[i].join(',').toLowerCase()
    if (/symbol|instrument|stock|fund|isin|qty|quantity|price|value|trade|buy|sell/i.test(joined)) {
      headerIdx = i
      break
    }
  }

  const header  = rows[headerIdx]
  const dataRows = rows.slice(headerIdx + 1).filter(r => r.some(c => c && !/^\s*$/.test(c)))
  const broker  = detectBroker(header.join(','))

  const isTradeBook = /trade date|trade type|buy.*sell/i.test(header.join(','))
  let holdings: ParsedEquityHolding[]       = []
  let transactions: ParsedEquityTransaction[] = []

  if (isTradeBook && (broker === 'Zerodha' || broker === 'Generic')) {
    transactions = parseZerodhaTradeBook(header, dataRows)
  } else if (broker === 'Zerodha') {
    holdings = parseZerodhHoldings(header, dataRows)
  } else if (broker === 'Groww') {
    holdings = parseGrowwHoldings(header, dataRows)
  } else {
    holdings = parseGenericHoldings(header, dataRows)
  }

  const totalValue    = holdings.reduce((a, h) => a + h.currentValue,  0)
  const totalInvested = holdings.reduce((a, h) => a + h.investedValue, 0)
  const totalPnL      = holdings.reduce((a, h) => a + h.pnl, 0)

  const count = holdings.length + transactions.length
  if (count === 0) return { status: 'empty', message: 'No holdings or trades found. Verify the file is a holdings/tradebook export.', broker, mode: 'holdings', holdings, transactions, totalValue, totalInvested, totalPnL }

  return {
    status: 'success',
    message: `Found ${holdings.length} holdings, ${transactions.length} trades from ${broker}`,
    broker,
    mode: isTradeBook ? 'transactions' : 'holdings',
    holdings, transactions, totalValue, totalInvested, totalPnL,
  }
}

// ─── Convert to app types ─────────────────────────────────────────────────────

export function equityHoldingsToAppHoldings(holdings: ParsedEquityHolding[]): Omit<Holding, 'id'>[] {
  return holdings.map(h => ({
    name:      h.name || h.symbol,
    ticker:    h.symbol,
    type:      h.type === 'mf' ? 'etf' : h.type,
    value:     h.currentValue,
    costBasis: h.investedValue || h.currentValue,
  }))
}

export function equityTradesToAppTransactions(trades: ParsedEquityTransaction[]): Omit<Transaction, 'id'>[] {
  return trades
    .filter(t => t.date)
    .map(t => ({
      date:     t.date,
      amount:   t.amount,
      category: 'Investments',
      type:     t.tradeType === 'buy' ? 'expense' : 'income',
      note:     `${t.tradeType === 'buy' ? 'Buy' : 'Sell'} ${t.quantity} × ${t.symbol} @ ₹${t.price}`,
    }))
}


