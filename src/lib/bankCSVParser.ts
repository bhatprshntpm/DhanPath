import type { Transaction } from '../types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BankName = 'HDFC' | 'ICICI' | 'SBI' | 'Axis' | 'Kotak' | 'Unknown'

export interface BankTransaction {
  date:        string   // YYYY-MM-DD
  description: string
  debit:       number
  credit:      number
  balance:     number
}

export interface BankParseResult {
  status:       'success' | 'error' | 'empty'
  message:      string
  bank:         BankName
  transactions: BankTransaction[]
  openingBalance:  number
  closingBalance:  number
  dateRange:    { from: string; to: string }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAmount(s: string | undefined): number {
  if (!s) return 0
  const clean = s.replace(/[,\s₹Rs.]/g, '').trim()
  return parseFloat(clean) || 0
}

function parseDate(s: string): string {
  if (!s) return ''
  s = s.trim()

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`

  // YYYY-MM-DD (already ISO)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD Mon YYYY  e.g. "01 Jan 2024"
  const MONTHS: Record<string,string> = {
    Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
    Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
  }
  const dMonY = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/)
  if (dMonY) return `${dMonY[3]}-${MONTHS[dMonY[2]] ?? '01'}-${dMonY[1].padStart(2,'0')}`

  // DD-Mon-YYYY  e.g. "01-Jan-2024"
  const dMonY2 = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (dMonY2) return `${dMonY2[3]}-${MONTHS[dMonY2[2]] ?? '01'}-${dMonY2[1].padStart(2,'0')}`

  // MM/DD/YYYY fallback (some exports)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy && parseInt(mdy[1]) <= 12 && parseInt(mdy[2]) > 12)
    return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`

  return ''
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
    rows.push(cols)
  }
  return rows
}

function colIdx(header: string[], ...keys: string[]): number {
  const lh = header.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
  for (const k of keys) {
    const i = lh.indexOf(k.toLowerCase().replace(/[^a-z0-9]/g, ''))
    if (i >= 0) return i
  }
  // fuzzy
  for (const k of keys) {
    const kl = k.toLowerCase().replace(/[^a-z0-9]/g, '')
    const i = lh.findIndex(h => h.includes(kl) || kl.includes(h))
    if (i >= 0) return i
  }
  return -1
}

// ─── Bank detection ───────────────────────────────────────────────────────────

interface BankProfile {
  bank:         BankName
  detect:       (header: string) => boolean
  dateCol:      string[]
  descCol:      string[]
  debitCol:     string[]
  creditCol:    string[]
  balanceCol:   string[]
  skipRows:     number
}

const BANK_PROFILES: BankProfile[] = [
  {
    bank: 'HDFC',
    detect: h => /narration|withdrawal amt/i.test(h),
    dateCol:    ['Date'],
    descCol:    ['Narration'],
    debitCol:   ['Withdrawal Amt.', 'Debit Amount'],
    creditCol:  ['Deposit Amt.', 'Credit Amount'],
    balanceCol: ['Closing Balance', 'Balance'],
    skipRows:   0,
  },
  {
    bank: 'ICICI',
    detect: h => /transaction remarks|withdrawal amount.*inr/i.test(h),
    dateCol:    ['Value Date', 'Transaction Date'],
    descCol:    ['Transaction Remarks'],
    debitCol:   ['Withdrawal Amount (INR )', 'Debit'],
    creditCol:  ['Deposit Amount (INR )', 'Credit'],
    balanceCol: ['Balance (INR )', 'Balance'],
    skipRows:   0,
  },
  {
    bank: 'SBI',
    detect: h => /txn date|value date|ref no.*cheque/i.test(h),
    dateCol:    ['Txn Date', 'Value Date'],
    descCol:    ['Description'],
    debitCol:   ['Debit', 'Dr'],
    creditCol:  ['Credit', 'Cr'],
    balanceCol: ['Balance'],
    skipRows:   0,
  },
  {
    bank: 'Axis',
    detect: h => /tran date|particulars/i.test(h),
    dateCol:    ['Tran Date', 'Transaction Date'],
    descCol:    ['PARTICULARS', 'Particulars'],
    debitCol:   ['DR', 'Debit'],
    creditCol:  ['CR', 'Credit'],
    balanceCol: ['BAL', 'Balance'],
    skipRows:   0,
  },
  {
    bank: 'Kotak',
    detect: h => /debit amount|credit amount/i.test(h) && !/inr/i.test(h),
    dateCol:    ['Date'],
    descCol:    ['Description', 'Particulars'],
    debitCol:   ['Debit Amount'],
    creditCol:  ['Credit Amount'],
    balanceCol: ['Balance'],
    skipRows:   0,
  },
]

// ─── Core parser ──────────────────────────────────────────────────────────────

export function parseBankCSV(csvText: string): BankParseResult {
  const rows  = csvRows(csvText)
  if (rows.length < 2) return { status: 'empty', message: 'File is empty or unreadable', bank: 'Unknown', transactions: [], openingBalance: 0, closingBalance: 0, dateRange: { from: '', to: '' } }

  // Find header row (first row with recognisable column names)
  let headerIdx = 0
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i].some(c => /date|narration|description|particulars|debit|credit|withdrawal|deposit/i.test(c))) {
      headerIdx = i
      break
    }
  }

  const header  = rows[headerIdx]
  const flatH   = header.join(',')
  const profile = BANK_PROFILES.find(p => p.detect(flatH)) ?? null

  const bank: BankName = profile?.bank ?? 'Unknown'

  // Column indices
  const iDate    = profile ? colIdx(header, ...profile.dateCol)    : colIdx(header, 'Date', 'Txn Date', 'Transaction Date', 'Value Date')
  const iDesc    = profile ? colIdx(header, ...profile.descCol)    : colIdx(header, 'Description', 'Narration', 'Particulars', 'Remarks', 'Details')
  const iDebit   = profile ? colIdx(header, ...profile.debitCol)   : colIdx(header, 'Debit', 'Withdrawal', 'Dr', 'DR')
  const iCredit  = profile ? colIdx(header, ...profile.creditCol)  : colIdx(header, 'Credit', 'Deposit', 'Cr', 'CR')
  const iBalance = profile ? colIdx(header, ...profile.balanceCol) : colIdx(header, 'Balance', 'Closing Balance', 'BAL')

  if (iDate === -1 || (iDebit === -1 && iCredit === -1)) {
    return { status: 'error', message: `Could not identify columns. Detected: ${header.slice(0, 5).join(', ')}. Try mapping manually.`, bank, transactions: [], openingBalance: 0, closingBalance: 0, dateRange: { from: '', to: '' } }
  }

  const transactions: BankTransaction[] = []

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (row.length < 2) continue

    const rawDate  = row[iDate]  ?? ''
    const date     = parseDate(rawDate)
    if (!date) continue

    const debit   = iDebit  >= 0 ? parseAmount(row[iDebit])  : 0
    const credit  = iCredit >= 0 ? parseAmount(row[iCredit]) : 0
    const balance = iBalance >= 0 ? parseAmount(row[iBalance]) : 0
    const desc    = iDesc >= 0 ? row[iDesc] ?? '' : row.join(' ')

    if (debit === 0 && credit === 0) continue

    transactions.push({ date, description: desc.slice(0, 120), debit, credit, balance })
  }

  if (!transactions.length) {
    return { status: 'empty', message: 'No transactions found. Check the file format.', bank, transactions: [], openingBalance: 0, closingBalance: 0, dateRange: { from: '', to: '' } }
  }

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))
  const dateRange = { from: sorted[0].date, to: sorted[sorted.length - 1].date }
  const openingBalance = sorted[0].balance
  const closingBalance = sorted[sorted.length - 1].balance

  return { status: 'success', message: `Found ${transactions.length} transactions from ${bank}`, bank, transactions, openingBalance, closingBalance, dateRange }
}

// ─── Smart category mapping ───────────────────────────────────────────────────

const CATEGORY_RULES: { pattern: RegExp; category: string; type: 'income' | 'expense' }[] = [
  { pattern: /salary|payroll|ctc|compensation/i,           category: 'Salary',        type: 'income'  },
  { pattern: /interest earned|int cr|int paid to/i,        category: 'Interest',      type: 'income'  },
  { pattern: /dividend/i,                                  category: 'Dividends',     type: 'income'  },
  { pattern: /refund|reversal|cashback/i,                  category: 'Refund',        type: 'income'  },
  { pattern: /rent|house rent|hra/i,                       category: 'Housing',       type: 'expense' },
  { pattern: /swiggy|zomato|dunzo|blinkit|bigbasket/i,     category: 'Food',          type: 'expense' },
  { pattern: /amazon|flipkart|myntra|ajio/i,               category: 'Shopping',      type: 'expense' },
  { pattern: /netflix|spotify|prime|hotstar|zee5/i,        category: 'Subscriptions', type: 'expense' },
  { pattern: /uber|ola|rapido|irctc|train|flight|make my trip/i, category: 'Transport', type: 'expense' },
  { pattern: /hospital|pharmacy|apollo|medplus|1mg/i,      category: 'Healthcare',    type: 'expense' },
  { pattern: /sip|mutual fund|mf|groww|zerodha|kuvera/i,   category: 'Investments',   type: 'expense' },
  { pattern: /lic|insurance|policy/i,                      category: 'Insurance',     type: 'expense' },
  { pattern: /emi|loan|home loan|car loan/i,               category: 'Loan EMI',      type: 'expense' },
  { pattern: /atm|cash withdrawal/i,                       category: 'Cash',          type: 'expense' },
  { pattern: /electricity|bescom|besst|tata power|adani elec/i, category: 'Utilities', type: 'expense' },
  { pattern: /jio|airtel|vodafone|bsnl/i,                  category: 'Utilities',     type: 'expense' },
]

function categorize(desc: string, isCredit: boolean): { category: string; type: 'income' | 'expense' } {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(desc)) return { category: rule.category, type: rule.type }
  }
  return { category: 'Other', type: isCredit ? 'income' : 'expense' }
}

export function bankTxnsToAppTransactions(txns: BankTransaction[]): Omit<Transaction, 'id'>[] {
  return txns.flatMap(t => {
    const results: Omit<Transaction, 'id'>[] = []
    if (t.credit > 0) {
      const { category } = categorize(t.description, true)
      results.push({ date: t.date, amount: t.credit, category, type: 'income', note: t.description.slice(0, 80) })
    }
    if (t.debit > 0) {
      const { category } = categorize(t.description, false)
      results.push({ date: t.date, amount: t.debit, category, type: 'expense', note: t.description.slice(0, 80) })
    }
    return results
  })
}
