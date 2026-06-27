import * as pdfjsLib from 'pdfjs-dist'
import type { Holding, NetWorthSnapshot } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

// ─── Types ────────────────────────────────────────────────────────────────────

export type BankName =
  | 'HDFC' | 'SBI' | 'Kotak' | 'Axis' | 'ICICI'
  | 'Canara' | 'StandardChartered' | 'MahindraFinance' | 'Unknown'

export type AccountType = 'savings' | 'fd' | 'ppf'

export interface BankTransaction {
  date:        string   // YYYY-MM-DD
  description: string
  credit:      number
  debit:       number
  balance:     number
}

export interface BankParseResult {
  status:        'success' | 'password_required' | 'parse_error' | 'no_data'
  message:       string
  bank:          BankName
  bankLabel:     string
  accountType:   AccountType
  accountNumber: string
  holderName:    string
  balance:       number        // closing/current for savings+PPF; maturity value for FD
  principal?:    number        // FD only
  interestRate?: number        // FD only
  maturityDate?: string        // FD only: YYYY-MM-DD
  transactions:  BankTransaction[]
}

// ─── PDF extraction ───────────────────────────────────────────────────────────

async function extractText(file: File, password?: string): Promise<string> {
  const buf  = await file.arrayBuffer()
  const task = pdfjsLib.getDocument({ data: new Uint8Array(buf), password: password ?? '' })
  const pdf  = await task.promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((x: any) => x.str).join(' '))
  }
  return pages.join('\n')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseINR(s: string): number {
  return parseFloat(s.replace(/,/g, '')) || 0
}

const MONTH_MAP: Record<string, string> = {
  JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',
  JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12',
}

function parseDate(s: string): string {
  // DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return `${year}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
  }
  // DD MMM YYYY or DD-MMM-YYYY or DD/MMM/YYYY
  const dmonthY = s.match(/^(\d{1,2})[\/\-\s]([A-Za-z]{3})[\/\-\s](\d{2,4})$/)
  if (dmonthY) {
    const mo   = MONTH_MAP[dmonthY[2].toUpperCase()] ?? '01'
    const year = dmonthY[3].length === 2 ? `20${dmonthY[3]}` : dmonthY[3]
    return `${year}-${mo}-${dmonthY[1].padStart(2,'0')}`
  }
  return ''
}

// ─── Bank detection ───────────────────────────────────────────────────────────

function detectBank(text: string): { bank: BankName; bankLabel: string } {
  const t = text.toUpperCase()
  if (/HDFC BANK|HDFC LIMITED|HDFC LTD/.test(t))             return { bank: 'HDFC',             bankLabel: 'HDFC Bank' }
  if (/STATE BANK OF INDIA|\bSBI\b/.test(t))                  return { bank: 'SBI',              bankLabel: 'State Bank of India' }
  if (/KOTAK MAHINDRA|KOTAK BANK/.test(t))                    return { bank: 'Kotak',            bankLabel: 'Kotak Bank' }
  if (/\bAXIS BANK\b/.test(t))                                return { bank: 'Axis',             bankLabel: 'Axis Bank' }
  if (/ICICI BANK/.test(t))                                   return { bank: 'ICICI',            bankLabel: 'ICICI Bank' }
  if (/CANARA BANK/.test(t))                                  return { bank: 'Canara',           bankLabel: 'Canara Bank' }
  if (/STANDARD CHARTERED|STANCHART|SCB\b/.test(t))          return { bank: 'StandardChartered', bankLabel: 'Standard Chartered' }
  if (/MAHINDRA.*FINANC|MMFSL|M&M FINANCIAL/.test(t))        return { bank: 'MahindraFinance',  bankLabel: 'Mahindra Finance' }
  return { bank: 'Unknown', bankLabel: 'Bank' }
}

// ─── Account type detection ───────────────────────────────────────────────────

function detectAccountType(text: string): AccountType {
  const t = text.toUpperCase()
  if (/PUBLIC PROVIDENT FUND|PPF ACCOUNT|PPF PASSBOOK|PPF STATEMENT/.test(t)) return 'ppf'
  if (/FIXED DEPOSIT|TERM DEPOSIT|FD CERTIFICATE|DEPOSIT ADVICE|CUMULATIVE DEPOSIT|RECURRING DEPOSIT/.test(t)) return 'fd'
  return 'savings'
}

// ─── Balance extraction ───────────────────────────────────────────────────────

function extractClosingBalance(text: string): number {
  // All patterns, return the LAST meaningful match (most recent balance)
  const patterns: RegExp[] = [
    /[Cc]losing\s+[Bb]al(?:ance)?\s*[:\|]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/g,
    /[Aa]vailable\s+[Bb]al(?:ance)?\s*[:\|]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/g,
    /[Cc]urrent\s+[Bb]al(?:ance)?\s*[:\|]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/g,
    /[Bb]alance\s+(?:as\s+on|as\s+at)\s+[^\n]{0,30}\s*[:\|]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/g,
    /[Aa]ccount\s+[Bb]al(?:ance)?\s*[:\|]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/g,
  ]
  let last = 0
  for (const p of patterns) {
    let m
    while ((m = p.exec(text)) !== null) {
      const v = parseINR(m[1])
      if (v > 100) last = v
    }
  }
  // Fallback: last large number before end of text that looks like a balance
  if (last === 0) {
    const allNums = [...text.matchAll(/\b([\d,]{5,}(?:\.\d{2})?)\b/g)]
    for (let i = allNums.length - 1; i >= 0; i--) {
      const v = parseINR(allNums[i][1])
      if (v >= 1000 && v < 1_000_000_000) { last = v; break }
    }
  }
  return last
}

// ─── FD extraction ────────────────────────────────────────────────────────────

interface FDFields {
  principal:    number
  maturityAmt:  number
  rate:         number
  maturityDate: string
}

function extractFDFields(text: string): FDFields {
  const num = (pattern: RegExp): number => {
    const m = pattern.exec(text)
    return m ? parseINR(m[1]) : 0
  }
  const str = (pattern: RegExp): string => {
    const m = pattern.exec(text)
    return m ? m[1].trim() : ''
  }

  const principal = num(/(?:[Pp]rincipal|[Dd]eposit(?:ed)?)\s+[Aa]mount\s*[:\|]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/)
    || num(/[Aa]mount\s+[Dd]eposited\s*[:\|]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/)
    || num(/[Ff][Dd]\s+[Aa]mount\s*[:\|]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/)

  const maturityAmt = num(/[Mm]aturity\s+(?:[Aa]mount|[Vv]alue)\s*[:\|]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/)
    || num(/[Aa]mount\s+(?:at|on)\s+[Mm]aturity\s*[:\|]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/)
    || num(/[Mm]aturity\s+[Pp]roceeds\s*[:\|]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d{1,2})?)/)

  const rate = num(/[Rr]ate\s+(?:of\s+)?[Ii]nterest\s*[:\|%]?\s*([\d.]+)/)
    || num(/[Ii]nterest\s+[Rr]ate\s*[:\|%]?\s*([\d.]+)/)
    || num(/ROI\s*[:\|%]?\s*([\d.]+)/)

  const matDateRaw = str(/[Mm]aturity\s+[Dd]ate\s*[:\|]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}[\s\-\/][A-Za-z]{3}[\s\-\/]\d{2,4})/)
  const maturityDate = parseDate(matDateRaw)

  return { principal, maturityAmt, rate, maturityDate }
}

// ─── Account number extraction ────────────────────────────────────────────────

function extractAccountNumber(text: string): string {
  // Common patterns: "Account No.", "A/C No.", "Acct No." followed by number
  const patterns = [
    /[Aa]ccount\s*[Nn]o\.?\s*[:\|]?\s*([X*\d]{6,20})/,
    /A\/[Cc]\.?\s*[Nn]o\.?\s*[:\|]?\s*([X*\d]{6,20})/,
    /[Aa]cct\.?\s*[Nn]o\.?\s*[:\|]?\s*([X*\d]{6,20})/,
    /[Ff][Dd]\s*[Nn]o\.?\s*[:\|]?\s*([X*\d\-]{4,20})/,
    /[Dd]eposit\s*[Nn]o\.?\s*[:\|]?\s*([X*\d\-]{4,20})/,
    /[Ff]olio\s*[Nn]o\.?\s*[:\|]?\s*([X*\d\-]{4,20})/,
  ]
  for (const p of patterns) {
    const m = p.exec(text)
    if (m?.[1]) return m[1].trim()
  }
  return ''
}

// ─── Holder name extraction ───────────────────────────────────────────────────

function extractHolderName(text: string): string {
  const patterns = [
    /(?:[Aa]ccount\s+)?[Hh]older(?:'s)?\s+[Nn]ame\s*[:\|]?\s*([A-Z][A-Z\s]{2,40})/,
    /[Cc]ustomer\s+[Nn]ame\s*[:\|]?\s*([A-Z][A-Z\s]{2,40})/,
    /[Nn]ame\s*[:\|]\s*([A-Z][A-Z\s]{2,40})/,
    /(?:[Mm][Rr]|[Mm][Rs]|[Mm][Rs][Ss]|[Ss][Hh][Rr][Ii]|[Ss][Mm][Tt])\.?\s+([A-Z][A-Z\s]{2,40})/,
  ]
  for (const p of patterns) {
    const m = p.exec(text)
    if (m?.[1]) return m[1].trim().replace(/\s{2,}/g, ' ')
  }
  return ''
}

// ─── Transaction extraction ───────────────────────────────────────────────────

function extractTransactions(text: string): BankTransaction[] {
  const txns: BankTransaction[] = []
  const dateRe = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}[\/\-][A-Za-z]{3}[\/\-]\d{2,4})\b/

  const lines = text.split(/\n/)
  for (const line of lines) {
    const dateMatch = dateRe.exec(line)
    if (!dateMatch) continue
    const date = parseDate(dateMatch[1])
    if (!date) continue

    const nums = [...line.matchAll(/\b([\d,]+\.\d{2})\b/g)].map(m => parseINR(m[1]))
    if (nums.length < 2) continue

    // Heuristic: last number = balance, second-to-last = amount
    const balance = nums[nums.length - 1]
    const amount  = nums[nums.length - 2]

    // Try to detect Dr/Cr
    const isCr = /\bCr\b|\bCredit\b|\bDeposit\b/i.test(line)
    const isDr = /\bDr\b|\bDebit\b|\bWithdrawal\b/i.test(line)

    const description = line
      .replace(dateMatch[0], '')
      .replace(/[\d,]+\.\d{2}/g, '')
      .replace(/\b(Dr|Cr|INR|Rs)\b/gi, '')
      .replace(/\s{2,}/g, ' ').trim()

    txns.push({
      date,
      description,
      credit: isCr || (!isDr && txns.length > 0 && balance > (txns.at(-1)?.balance ?? 0)) ? amount : 0,
      debit:  isDr || (!isCr && txns.length > 0 && balance < (txns.at(-1)?.balance ?? 0)) ? amount : 0,
      balance,
    })
  }
  return txns.slice(0, 500)
}

// ─── Main parser ──────────────────────────────────────────────────────────────

export async function parseIndianBankPDF(
  file: File,
  password?: string,
): Promise<BankParseResult> {
  let text: string
  try {
    text = await extractText(file, password)
  } catch (err: any) {
    if (/password|encrypted/i.test(err?.message ?? '')) {
      return {
        status: 'password_required',
        message: 'This PDF is password-protected. Enter the password below.',
        bank: 'Unknown', bankLabel: 'Bank', accountType: 'savings',
        accountNumber: '', holderName: '', balance: 0, transactions: [],
      }
    }
    return {
      status: 'parse_error',
      message: String(err?.message ?? 'Could not read PDF'),
      bank: 'Unknown', bankLabel: 'Bank', accountType: 'savings',
      accountNumber: '', holderName: '', balance: 0, transactions: [],
    }
  }

  if (!text.trim()) {
    return {
      status: 'no_data',
      message: 'PDF appears to be blank or image-only (no selectable text).',
      bank: 'Unknown', bankLabel: 'Bank', accountType: 'savings',
      accountNumber: '', holderName: '', balance: 0, transactions: [],
    }
  }

  const { bank, bankLabel }   = detectBank(text)
  const accountType           = detectAccountType(text)
  const accountNumber         = extractAccountNumber(text)
  const holderName            = extractHolderName(text)
  const transactions          = accountType === 'savings' ? extractTransactions(text) : []

  // FD
  if (accountType === 'fd') {
    const fd = extractFDFields(text)
    const balance = fd.maturityAmt || fd.principal
    if (balance === 0) {
      return {
        status: 'no_data',
        message: `Detected ${bankLabel} FD statement but could not extract the maturity amount. Try entering manually.`,
        bank, bankLabel, accountType, accountNumber, holderName, balance: 0, transactions: [],
      }
    }
    return {
      status: 'success',
      message: `${bankLabel} Fixed Deposit parsed`,
      bank, bankLabel, accountType, accountNumber, holderName,
      balance:      fd.maturityAmt || fd.principal,
      principal:    fd.principal || undefined,
      interestRate: fd.rate || undefined,
      maturityDate: fd.maturityDate || undefined,
      transactions: [],
    }
  }

  // PPF / Savings
  const balance = extractClosingBalance(text)
  if (balance === 0) {
    return {
      status: 'no_data',
      message: `Detected ${bankLabel} ${accountType === 'ppf' ? 'PPF' : 'savings'} statement but could not extract the balance. Try entering manually.`,
      bank, bankLabel, accountType, accountNumber, holderName, balance: 0, transactions: [],
    }
  }

  return {
    status:  'success',
    message: `${bankLabel} ${accountType === 'ppf' ? 'PPF' : 'savings'} statement parsed`,
    bank, bankLabel, accountType, accountNumber, holderName, balance, transactions,
  }
}

// ─── Convert to app types ─────────────────────────────────────────────────────

export function bankToHolding(result: BankParseResult): Holding {
  const id = Math.random().toString(36).slice(2)

  if (result.accountType === 'fd') {
    const bankShort = result.bankLabel.replace('Bank','').trim()
    return {
      id,
      name:      `FD — ${bankShort}`,
      ticker:    `FD-${result.bank.toUpperCase()}`,
      type:      'bond',
      assetClass: 'Debt',
      subType:   'Fixed Deposit',
      qty:       1,
      lastPrice: result.balance,
      value:     result.balance,
      costBasis: result.principal ?? result.balance,
    }
  }

  if (result.accountType === 'ppf') {
    return {
      id,
      name:      `PPF — ${result.bankLabel}`,
      ticker:    `PPF-${result.bank.toUpperCase()}`,
      type:      'retirement',
      assetClass: 'EPF / NPS / PPF',
      subType:   'PPF',
      qty:       1,
      lastPrice: result.balance,
      value:     result.balance,
      costBasis: result.balance,
    }
  }

  // Savings
  return {
    id,
    name:      `Savings — ${result.bankLabel}`,
    ticker:    `SAV-${result.bank.toUpperCase()}${result.accountNumber ? `-${result.accountNumber.slice(-4)}` : ''}`,
    type:      'cash',
    assetClass: 'Cash & Savings',
    subType:   'Savings',
    qty:       1,
    lastPrice: result.balance,
    value:     result.balance,
    costBasis: result.balance,
  }
}

export function bankToSnapshot(result: BankParseResult): Omit<NetWorthSnapshot, 'id'> {
  const blank = { mortgage:0, studentLoans:0, creditCards:0, autoLoans:0, other:0 }

  if (result.accountType === 'fd') {
    return {
      date: new Date().toISOString().slice(0, 7),
      assets: { checking:0, savings: result.balance, brokerage:0, retirement:0, realEstate:0, other:0 },
      liabilities: blank,
      breakdown: { Debt: result.balance },
    }
  }
  if (result.accountType === 'ppf') {
    return {
      date: new Date().toISOString().slice(0, 7),
      assets: { checking:0, savings:0, brokerage:0, retirement: result.balance, realEstate:0, other:0 },
      liabilities: blank,
      breakdown: { 'EPF / NPS / PPF': result.balance },
    }
  }
  return {
    date: new Date().toISOString().slice(0, 7),
    assets: { checking:0, savings: result.balance, brokerage:0, retirement:0, realEstate:0, other:0 },
    liabilities: blank,
    breakdown: { 'Cash & Savings': result.balance },
  }
}
