import * as pdfjsLib from 'pdfjs-dist'
import type { Holding, Transaction, NetWorthSnapshot } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

export type CASFormat = 'CAMS' | 'KFintech' | 'Unknown'

export interface ParsedFund {
  name:          string
  currentValue:  number
  investedValue: number
  units:         number
  nav:           number
  gain:          number
  gainPct:       number
}

export interface ParsedTransaction {
  date:     string
  amount:   number
  type:     'SIP' | 'Purchase' | 'Redemption' | 'Switch' | 'Dividend' | 'Other'
  fundName: string
}

export interface MonthlyFlow {
  month:              string
  invested:           number
  cumulativeInvested: number
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
  rawTextSample:  string   // ← first 800 chars for debug/transparency
  debugLog:       string[] // ← what each step found
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MON: Record<string, string> = {
  Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
  Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
}

function parseDate(s: string): string {
  const m = s.match(/(\d{2})-([A-Za-z]{3})-(\d{4})/)
  if (m) return `${m[3]}-${MON[m[2]] ?? '01'}-${m[1]}`
  return ''
}

// ─── Proper line-based text extraction ──────────────────────────────────────
// pdfjs gives us text items with x,y coordinates. We group by Y to get lines.

async function extractLines(file: File, password?: string): Promise<string[]> {
  const buf  = await file.arrayBuffer()
  const task = pdfjsLib.getDocument({ data: new Uint8Array(buf), password: password ?? '' })
  const pdf  = await task.promise
  const allLines: string[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p)
    const content = await page.getTextContent()
    const items   = content.items as any[]

    if (!items.length) continue

    // Group items by rounded Y coordinate (each unique Y = one line)
    const byY: Record<number, { x: number; str: string }[]> = {}
    for (const item of items) {
      if (!item.str?.trim()) continue
      const y = Math.round(item.transform[5])  // Y position
      const x = Math.round(item.transform[4])  // X position
      ;(byY[y] = byY[y] ?? []).push({ x, str: item.str })
    }

    // Sort Y descending (top of page first), then sort items left-to-right
    const sortedYs = Object.keys(byY).map(Number).sort((a, b) => b - a)
    for (const y of sortedYs) {
      const line = byY[y]
        .sort((a, b) => a.x - b.x)
        .map(i => i.str)
        .join(' ')
        .trim()
      if (line) allLines.push(line)
    }
  }

  return allLines
}

// ─── Format detection ────────────────────────────────────────────────────────

function detectFormat(lines: string[]): CASFormat {
  const joined = lines.slice(0, 20).join(' ')
  if (/CAMS|Computer Age/i.test(joined))  return 'CAMS'
  if (/KFintech|Karvy/i.test(joined))     return 'KFintech'
  return 'Unknown'
}

// ─── Net worth extraction ─────────────────────────────────────────────────

function extractNetWorth(lines: string[], debug: string[]): { invested: number; current: number } {
  const fullText = lines.join(' ').replace(/,/g, '')

  // CAMS Summary line: "Total  37,98,955.51  53,67,455.35"
  const totalLine = fullText.match(/Total\s+([\d]+\.?\d*)\s+([\d]+\.?\d*)/)
  if (totalLine) {
    const invested = parseFloat(totalLine[1])
    const current  = parseFloat(totalLine[2])
    debug.push(`Net worth via Total pattern: invested=${invested}, current=${current}`)
    return { invested, current }
  }

  // KFintech: "Current Value (Rs.) : 53,67,455.35"
  const kfMatch = fullText.match(/Current\s+Value[^0-9]*([\d]+\.?\d*)/i)
  if (kfMatch) {
    debug.push(`Net worth via Current Value pattern: ${kfMatch[1]}`)
    return { invested: 0, current: parseFloat(kfMatch[1]) }
  }

  // Fallback: look for "Portfolio Value"
  const pvMatch = fullText.match(/Portfolio\s+Value[^0-9]*([\d]+\.?\d*)/i)
  if (pvMatch) {
    debug.push(`Net worth via Portfolio Value pattern: ${pvMatch[1]}`)
    return { invested: 0, current: parseFloat(pvMatch[1]) }
  }

  // Last resort: find any "Market Value" or large number near Total
  const mvMatch = fullText.match(/Market\s+Value[^0-9]*([\d]+\.?\d*)/i)
  if (mvMatch) {
    debug.push(`Net worth via Market Value pattern: ${mvMatch[1]}`)
    return { invested: 0, current: parseFloat(mvMatch[1]) }
  }

  debug.push('Net worth: no pattern matched')
  return { invested: 0, current: 0 }
}

// ─── Fund extraction — line-by-line approach ──────────────────────────────

function extractFunds(lines: string[], debug: string[]): ParsedFund[] {
  const funds: ParsedFund[] = []
  let currentFundName = ''
  let currentValue = 0
  let investedValue = 0
  let units = 0
  let nav = 0

  function pushFund() {
    if (currentFundName && currentValue > 0) {
      const gain    = currentValue - investedValue
      const gainPct = investedValue > 0 ? (gain / investedValue) * 100 : 0
      funds.push({ name: currentFundName.slice(0, 80), currentValue, investedValue, units, nav, gain, gainPct })
    }
    currentFundName = ''; currentValue = 0; investedValue = 0; units = 0; nav = 0
  }

  for (const line of lines) {
    const clean = line.replace(/,/g, '').trim()

    // Fund name indicators
    if (/\b(Fund|Scheme|Flexi|Cap|Tax|Growth|Direct|Regular)\b/.test(line) &&
        line.length > 15 && !/^\d/.test(line) && !/Folio|ISIN|Units|NAV/i.test(line)) {
      pushFund()
      currentFundName = line.trim()
      continue
    }

    // Units + NAV + Value on same line: "Units: 123.456  NAV: 45.67  Value: 5,640.12"
    const uvLine = clean.match(/([\d]+\.?\d*)\s+(?:@|NAV\s*:?\s*)([\d]+\.?\d*)\s+([\d]+\.?\d*)/)
    if (uvLine && currentFundName) {
      units = parseFloat(uvLine[1])
      nav   = parseFloat(uvLine[2])
      currentValue = parseFloat(uvLine[3])
      continue
    }

    // Value / Market Value line
    if (/Market\s*Value|Current\s*Value|Mkt\s*Value/i.test(line)) {
      const vm = clean.match(/([\d]+\.?\d*)/)
      if (vm && currentFundName) currentValue = parseFloat(vm[1])
      continue
    }

    // Cost / Invested value
    if (/Cost\s*Value|Purchase\s*Value|Invested/i.test(line)) {
      const vm = clean.match(/([\d]+\.?\d*)/)
      if (vm && currentFundName) investedValue = parseFloat(vm[1])
      continue
    }

    // Look for pattern: two large numbers on same line (cost, market value)
    if (currentFundName) {
      const twoNums = clean.match(/([\d]{4,}\.?\d*)\s+([\d]{4,}\.?\d*)$/)
      if (twoNums) {
        investedValue = parseFloat(twoNums[1])
        currentValue  = parseFloat(twoNums[2])
      }
    }
  }
  pushFund()

  debug.push(`Funds extracted: ${funds.length}`)
  return funds
}

// ─── Transaction extraction ───────────────────────────────────────────────

function extractTransactions(lines: string[], debug: string[]): ParsedTransaction[] {
  const txns: ParsedTransaction[] = []
  const DATE_RE   = /\d{2}-[A-Za-z]{3}-\d{4}/
  const AMOUNT_RE = /([-+]?[\d,]+\.\d{2}|\([\d,]+\.\d{2}\))/
  const KEYWORDS  = ['Purchase','SIP','Redemption','Redeem','Switch','Systematic','Dividend']
  const TYPE_MAP: Record<string, ParsedTransaction['type']> = {
    'SIP':'SIP','Systematic':'SIP','Purchase':'Purchase',
    'Redemption':'Redemption','Redeem':'Redemption',
    'Switch':'Switch','Dividend':'Dividend',
  }

  let currentFund = ''

  for (const line of lines) {
    // Track fund context
    if (/\b(Fund|Scheme|Flexi|Cap)\b/i.test(line) && !DATE_RE.test(line) && line.length > 10) {
      currentFund = line.slice(0, 60)
    }

    if (!DATE_RE.test(line)) continue
    if (!KEYWORDS.some(k => line.includes(k))) continue

    const dateStr   = line.match(DATE_RE)?.[0]
    const amtStr    = line.match(AMOUNT_RE)?.[0]
    if (!dateStr || !amtStr) continue

    const isNeg  = amtStr.includes('(')
    const amount = parseFloat(amtStr.replace(/[(),]/g, ''))
    if (amount < 100) continue

    const typeKey  = KEYWORDS.find(k => line.includes(k)) ?? 'Purchase'
    const txnType  = TYPE_MAP[typeKey] ?? 'Other'
    const finalAmt = (txnType === 'Redemption' || isNeg) ? -amount : amount

    txns.push({ date: parseDate(dateStr), amount: Math.round(finalAmt), type: txnType, fundName: currentFund })
  }

  // Deduplicate
  const seen = new Set<string>()
  const deduped = txns.filter(t => {
    const k = `${t.date}|${t.amount}|${t.type}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  }).sort((a, b) => a.date.localeCompare(b.date))

  debug.push(`Transactions extracted: ${deduped.length}`)
  return deduped
}

// ─── Monthly history ──────────────────────────────────────────────────────

function buildMonthlyHistory(txns: ParsedTransaction[]): MonthlyFlow[] {
  const byMonth: Record<string, number> = {}
  for (const t of txns) {
    if (!t.date) continue
    const m = t.date.slice(0, 7)
    byMonth[m] = (byMonth[m] ?? 0) + t.amount
  }
  let cum = 0
  return Object.entries(byMonth).sort(([a],[b]) => a.localeCompare(b)).map(([month, invested]) => {
    cum += invested
    return { month, invested, cumulativeInvested: cum }
  })
}

// ─── Main export ──────────────────────────────────────────────────────────

export async function parseCASPDF(file: File, password?: string): Promise<CASParseResult> {
  const debug: string[] = []
  let lines: string[]

  try {
    lines = await extractLines(file, password)
    debug.push(`Extracted ${lines.length} lines from PDF`)
  } catch (err: any) {
    if (err?.name === 'PasswordException' || /password/i.test(err?.message ?? '')) {
      return { status: 'password_required', message: 'PDF is password protected. Enter your PAN (e.g. ABCDE1234F) or date of birth (DDMMYYYY).', format: 'Unknown', totalValue: 0, totalInvested: 0, funds: [], transactions: [], monthlyHistory: [], pan: '', statementDate: '', rawTextSample: '', debugLog: [] }
    }
    return { status: 'parse_error', message: String(err?.message ?? err), format: 'Unknown', totalValue: 0, totalInvested: 0, funds: [], transactions: [], monthlyHistory: [], pan: '', statementDate: '', rawTextSample: '', debugLog: [String(err)] }
  }

  const rawTextSample = lines.slice(0, 30).join('\n')
  const format        = detectFormat(lines)
  debug.push(`Format detected: ${format}`)

  const { invested, current } = extractNetWorth(lines, debug)
  const funds     = extractFunds(lines, debug)
  const txns      = extractTransactions(lines, debug)
  const history   = buildMonthlyHistory(txns)

  const fullText  = lines.join(' ')
  const panMatch  = fullText.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/)
  const pan       = panMatch?.[1] ?? ''
  const dateMatch = fullText.match(/(?:as\s+on|Statement\s+Date)[^\d]*(\d{2}[-/][A-Za-z\d]+[-/]\d{4})/i)
  const statementDate = dateMatch ? parseDate(dateMatch[1].replace(/\//g, '-')) || new Date().toISOString().slice(0,10) : new Date().toISOString().slice(0,10)

  const totalValue    = current  || funds.reduce((a, f) => a + f.currentValue,  0)
  const totalInvested = invested || funds.reduce((a, f) => a + f.investedValue, 0)

  debug.push(`Final: totalValue=${totalValue}, totalInvested=${totalInvested}, funds=${funds.length}, txns=${txns.length}`)

  if (totalValue === 0 && txns.length === 0) {
    return { status: 'no_data', message: 'Could not extract data automatically. See the debug panel below to enter values manually.', format, totalValue: 0, totalInvested: 0, funds: [], transactions: [], monthlyHistory: [], pan, statementDate, rawTextSample, debugLog: debug }
  }

  return {
    status: 'success',
    message: `Found ${funds.length > 0 ? funds.length + ' funds' : 'portfolio total'} and ${txns.length} transactions`,
    format, totalValue, totalInvested, funds, transactions: txns, monthlyHistory: history,
    pan, statementDate, rawTextSample, debugLog: debug,
  }
}

// ─── Convert to AppData ───────────────────────────────────────────────────

export function casResultToHoldings(result: CASParseResult): Omit<Holding, 'id'>[] {
  return result.funds.map(f => ({
    name: f.name, ticker: '', type: 'etf' as const,
    value: f.currentValue, costBasis: f.investedValue || f.currentValue,
  }))
}

export function casResultToTransactions(result: CASParseResult): Omit<Transaction, 'id'>[] {
  return result.transactions.filter(t => t.date).map(t => ({
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
    assets: { checking: 0, savings: 0, brokerage: result.totalValue, retirement: 0, realEstate: 0, other: 0 },
    liabilities: { mortgage: 0, studentLoans: 0, creditCards: 0, autoLoans: 0, other: 0 },
  }
}
