import * as pdfjsLib from 'pdfjs-dist'
import type { Holding, Transaction, NetWorthSnapshot } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

// ─── Types ────────────────────────────────────────────────────────────────────

export type CASFormat = 'CAMS' | 'KFintech' | 'Unknown'

export interface ParsedFund {
  name:         string
  currentValue: number
  investedValue:number
  units:        number
  nav:          number
  gain:         number
  gainPct:      number
}

export interface ParsedTransaction {
  date:     string   // YYYY-MM-DD
  amount:   number
  type:     'SIP' | 'Purchase' | 'Redemption' | 'Switch' | 'Dividend' | 'Other'
  fundName: string
}

export interface MonthlyFlow {
  month:               string  // YYYY-MM
  invested:            number
  cumulativeInvested:  number
}

export interface CASParseResult {
  status:         'success' | 'password_required' | 'parse_error' | 'no_data'
  message:        string
  format:         CASFormat
  totalValue:     number
  totalInvested:  number
  funds:          ParsedFund[]
  transactions:   ParsedTransaction[]
  monthlyHistory: MonthlyFlow[]
  pan:            string
  statementDate:  string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanNum(s: string): number {
  return parseFloat(s.replace(/,/g, '').replace(/\((.+)\)/, '-$1')) || 0
}

const MONTH_MAP: Record<string, string> = {
  Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
  Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
}

function parseIndianDate(s: string): string {
  const m = s.match(/(\d{2})-([A-Za-z]{3})-(\d{4})/)
  if (!m) return ''
  return `${m[3]}-${MONTH_MAP[m[2]] ?? '01'}-${m[1]}`
}

function detectFormat(text: string): CASFormat {
  if (/CAMS|Computer Age Management/i.test(text)) return 'CAMS'
  if (/KFintech|Karvy/i.test(text))               return 'KFintech'
  return 'Unknown'
}

// ─── Text extraction (password-aware) ─────────────────────────────────────────

async function extractText(file: File, password?: string): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({
    data:     new Uint8Array(arrayBuffer),
    password: password ?? '',
  })

  const pdf   = await loadingTask.promise
  const pages: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text    = content.items
      .map((item: any) => item.str)
      .join(' ')
    pages.push(text)
  }
  return pages
}

// ─── Net worth extraction ─────────────────────────────────────────────────────

function extractNetWorth(text: string): { invested: number; current: number } {
  const clean = text.replace(/,/g, '')

  // Pattern: "Total  XXXXXXX.XX  XXXXXXX.XX"
  const totalMatch = clean.match(/Total\s+([\d.]+)\s+([\d.]+)/)
  if (totalMatch) {
    return { invested: parseFloat(totalMatch[1]), current: parseFloat(totalMatch[2]) }
  }

  // Pattern: "Portfolio Value : Rs. X,XX,XXX.XX" (KFintech style)
  const valMatch = clean.match(/Portfolio\s+Value\s*[:\-]\s*(?:Rs\.?\s*)?([\d.]+)/i)
  if (valMatch) {
    return { invested: 0, current: parseFloat(valMatch[1]) }
  }

  return { invested: 0, current: 0 }
}

// ─── Fund holdings extraction ─────────────────────────────────────────────────

function extractFunds(fullText: string): ParsedFund[] {
  const funds: ParsedFund[] = []
  const clean = fullText.replace(/,/g, '')

  // Match lines with "Folio" or fund value patterns
  // Pattern: fund name line followed by units/NAV/value
  const fundBlocks = clean.split(/(?=Folio\s*No|ISIN\s*:|Registrar\s*:)/i)

  for (const block of fundBlocks) {
    // Fund name: first meaningful non-numeric line
    const nameMatch = block.match(/^([A-Z][A-Za-z\s\-()]+(?:Fund|Scheme|Plan|Growth|Direct|Option)[^\n]*)/m)
    if (!nameMatch) continue

    const name = nameMatch[1].trim().slice(0, 80)

    // Current value
    const valueMatch = block.match(/(?:Market\s+Value|Current\s+Value|Valuation)[^\d]*([\d.]+)/i)
      ?? block.match(/Units?\s*:?\s*([\d.]+)\s+NAV\s*:?\s*([\d.]+)\s+Value\s*:?\s*([\d.]+)/i)

    const investedMatch = block.match(/(?:Cost|Invested|Purchase\s+Value)[^\d]*([\d.]+)/i)

    const unitsMatch  = block.match(/Units?\s*:?\s*([\d.]+)/i)
    const navMatch    = block.match(/NAV\s*:?\s*([\d.]+)/i)

    const current  = valueMatch  ? parseFloat(valueMatch[valueMatch.length - 1])  : 0
    const invested = investedMatch ? parseFloat(investedMatch[1]) : 0
    const units    = unitsMatch  ? parseFloat(unitsMatch[1])  : 0
    const nav      = navMatch    ? parseFloat(navMatch[1])    : 0

    if (current > 0 && name.length > 5) {
      const gain    = current - invested
      const gainPct = invested > 0 ? (gain / invested) * 100 : 0
      funds.push({ name, currentValue: current, investedValue: invested, units, nav, gain, gainPct })
    }
  }

  return funds
}

// ─── Transaction extraction ───────────────────────────────────────────────────

function extractTransactions(fullText: string): ParsedTransaction[] {
  const txns: ParsedTransaction[] = []
  const lines = fullText.split(/\n|\r/)

  const DATE_RE   = /\d{2}-[A-Za-z]{3}-\d{4}/
  const AMOUNT_RE = /([-+]?[\d,]+\.\d{2}|\([\d,]+\.\d{2}\))/
  const KEYWORDS  = ['Purchase', 'SIP', 'Redemption', 'Redeem', 'Switch', 'Systematic', 'Dividend', 'Div Reinvest']
  const TYPE_MAP: Record<string, ParsedTransaction['type']> = {
    'SIP': 'SIP', 'Systematic': 'SIP',
    'Purchase': 'Purchase',
    'Redemption': 'Redemption', 'Redeem': 'Redemption',
    'Switch': 'Switch',
    'Dividend': 'Dividend', 'Div': 'Dividend',
  }

  let currentFund = ''

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // Track current fund context
    if (/Mutual Fund|Fund\s*\(|Growth|Direct Plan/i.test(line) && !DATE_RE.test(line)) {
      currentFund = line.slice(0, 60)
    }

    if (!DATE_RE.test(line)) continue
    if (!KEYWORDS.some(k => line.includes(k))) continue

    const dateStr    = line.match(DATE_RE)?.[0]
    const amountStr  = line.match(AMOUNT_RE)?.[0]
    if (!dateStr || !amountStr) continue

    const isNegative = amountStr.includes('(')
    const amount     = cleanNum(amountStr)
    if (Math.abs(amount) < 100) continue  // filter NAV values

    const typeKey   = KEYWORDS.find(k => line.includes(k)) ?? 'Purchase'
    const txnType   = TYPE_MAP[typeKey] ?? 'Other'
    const finalAmt  = (txnType === 'Redemption' || isNegative) ? -Math.abs(amount) : Math.abs(amount)

    txns.push({
      date:     parseIndianDate(dateStr),
      amount:   Math.round(finalAmt),
      type:     txnType,
      fundName: currentFund,
    })
  }

  // Deduplicate
  const seen = new Set<string>()
  return txns.filter(t => {
    const key = `${t.date}|${t.amount}|${t.fundName}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).sort((a, b) => a.date.localeCompare(b.date))
}

// ─── Monthly history aggregation ──────────────────────────────────────────────

function buildMonthlyHistory(transactions: ParsedTransaction[]): MonthlyFlow[] {
  const byMonth: Record<string, number> = {}

  for (const t of transactions) {
    if (!t.date) continue
    const month = t.date.slice(0, 7)  // YYYY-MM
    byMonth[month] = (byMonth[month] ?? 0) + t.amount
  }

  let cumulative = 0
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, invested]) => {
      cumulative += invested
      return { month, invested, cumulativeInvested: cumulative }
    })
}

// ─── PAN extraction ───────────────────────────────────────────────────────────

function extractPAN(text: string): string {
  const m = text.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/)
  return m ? m[1] : ''
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function parseCASPDF(
  file:     File,
  password?: string,
): Promise<CASParseResult> {
  let pages: string[]

  try {
    pages = await extractText(file, password)
  } catch (err: any) {
    if (err?.name === 'PasswordException' || err?.message?.includes('password')) {
      return { status: 'password_required', message: 'PDF is password protected. Enter your PAN (e.g. ABCDE1234F) or date of birth (DDMMYYYY).', format: 'Unknown', totalValue: 0, totalInvested: 0, funds: [], transactions: [], monthlyHistory: [], pan: '', statementDate: '' }
    }
    return { status: 'parse_error', message: String(err?.message ?? err), format: 'Unknown', totalValue: 0, totalInvested: 0, funds: [], transactions: [], monthlyHistory: [], pan: '', statementDate: '' }
  }

  const fullText  = pages.join('\n')
  const format    = detectFormat(fullText)
  const { invested, current } = extractNetWorth(fullText)
  const funds     = extractFunds(fullText)
  const txns      = extractTransactions(fullText)
  const history   = buildMonthlyHistory(txns)
  const pan       = extractPAN(fullText)

  const dateMatch    = fullText.match(/Statement\s+(?:as\s+on|for\s+period)[^\d]*(\d{2}[-/]\w+[-/]\d{4})/i)
  const statementDate = dateMatch ? parseIndianDate(dateMatch[1]) : new Date().toISOString().slice(0, 10)

  const totalValue    = current  || funds.reduce((a, f) => a + f.currentValue,  0)
  const totalInvested = invested || funds.reduce((a, f) => a + f.investedValue, 0)

  if (totalValue === 0 && txns.length === 0) {
    return { status: 'no_data', message: 'Could not extract financial data. Try a different password or check if this is a valid CAS PDF.', format, totalValue: 0, totalInvested: 0, funds: [], transactions: [], monthlyHistory: [], pan, statementDate }
  }

  return { status: 'success', message: `Parsed ${funds.length} fund${funds.length !== 1 ? 's' : ''} and ${txns.length} transaction${txns.length !== 1 ? 's' : ''}`, format, totalValue, totalInvested, funds, transactions: txns, monthlyHistory: history, pan, statementDate }
}

// ─── Convert parsed result → AppData fragments ───────────────────────────────

export function casResultToHoldings(result: CASParseResult): Omit<Holding, 'id'>[] {
  return result.funds.map(f => ({
    name:      f.name,
    ticker:    '',
    type:      'etf' as const,
    value:     f.currentValue,
    costBasis: f.investedValue || f.currentValue,
  }))
}

export function casResultToTransactions(result: CASParseResult): Omit<Transaction, 'id'>[] {
  return result.transactions
    .filter(t => t.date)
    .map(t => ({
      date:     t.date,
      amount:   Math.abs(t.amount),
      category: t.type === 'SIP' || t.type === 'Purchase' ? 'Mutual Fund SIP' : 'MF Redemption',
      type:     (t.amount >= 0 ? 'expense' : 'income') as 'expense' | 'income',
      note:     `${t.type}${t.fundName ? ' — ' + t.fundName.slice(0, 40) : ''}`,
    }))
}

export function casResultToSnapshot(result: CASParseResult): Omit<NetWorthSnapshot, 'id'> {
  return {
    date: result.statementDate.slice(0, 7) || new Date().toISOString().slice(0, 7),
    assets: {
      checking:   0,
      savings:    0,
      brokerage:  result.totalValue,
      retirement: 0,
      realEstate: 0,
      other:      0,
    },
    liabilities: {
      mortgage:    0,
      studentLoans:0,
      creditCards: 0,
      autoLoans:   0,
      other:       0,
    },
  }
}
