import * as pdfjsLib from 'pdfjs-dist'
import type { NetWorthSnapshot, Transaction } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

export interface EPFMonthlyEntry {
  month:            string   // YYYY-MM
  employeeShare:    number
  employerShare:    number
  pensionShare:     number
  interest:         number
  closingBalance:   number
}

export interface EPFParseResult {
  status:          'success' | 'password_required' | 'parse_error' | 'no_data'
  message:         string
  uan:             string
  pan:             string
  memberName:      string
  establishmentName: string
  totalBalance:    number
  employeeBalance: number
  employerBalance: number
  pensionBalance:  number
  entries:         EPFMonthlyEntry[]
}

async function extractPages(file: File, password?: string): Promise<string[]> {
  const buf  = await file.arrayBuffer()
  const task = pdfjsLib.getDocument({ data: new Uint8Array(buf), password: password ?? '' })
  const pdf  = await task.promise
  const out: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    out.push(content.items.map((x: any) => x.str).join(' '))
  }
  return out
}

const MONTHS: Record<string, string> = {
  JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',
  JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12',
}

function parseEPFDate(s: string): string {
  const m = s.toUpperCase().match(/([A-Z]{3})[\/\-\s](\d{4})/)
  if (m) return `${m[2]}-${MONTHS[m[1]] ?? '01'}`
  const dmy = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}`
  return ''
}

export async function parseEPFPDF(file: File, password?: string): Promise<EPFParseResult> {
  let pages: string[]
  try {
    pages = await extractPages(file, password)
  } catch (err: any) {
    if (err?.name === 'PasswordException' || /password/i.test(err?.message ?? '')) {
      return { status: 'password_required', message: 'Password required. Try your UAN or date of birth.', uan: '', pan: '', memberName: '', establishmentName: '', totalBalance: 0, employeeBalance: 0, employerBalance: 0, pensionBalance: 0, entries: [] }
    }
    return { status: 'parse_error', message: String(err?.message ?? err), uan: '', pan: '', memberName: '', establishmentName: '', totalBalance: 0, employeeBalance: 0, employerBalance: 0, pensionBalance: 0, entries: [] }
  }

  const fullText = pages.join('\n')
  const clean    = fullText.replace(/,/g, '')

  // ── UAN (12-digit number after UAN label, or standalone) ──────────────────
  const uanMatch = clean.match(/\b(10\d{10})\b/)
  const uan      = uanMatch?.[1] ?? ''

  // ── Member & establishment from PYKRP pattern (EPFO member ID / Name) ─────
  const memberMatch = fullText.match(/[A-Z]{5}\d+\s*\/\s*([A-Z][A-Z\s]+)[\n\r]/)
  const memberName  = memberMatch?.[1]?.trim() ?? ''
  const estMatch    = fullText.match(/([A-Z]{5}\d+)\s*\/\s*([A-Z][A-Z\s&.,()-]+)[\n\r]/)
  const establishmentName = estMatch?.[2]?.trim() ?? ''
  const pan = fullText.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/)?.[1] ?? ''

  // ── Closing balances: last 3 numbers ≥1000 before "End Of Statement" ──────
  // EPFO passbook structure: after "Closing Balance as on DD/MM/YYYY" the last
  // three large numbers are always Employee / Employer / Pension balances.
  let employeeBalance = 0, employerBalance = 0, pensionBalance = 0

  const endOfStatementIdx = clean.indexOf('End Of Statement')
  const closingIdx        = clean.indexOf('Closing Balance as on')

  if (closingIdx !== -1) {
    const end     = endOfStatementIdx > closingIdx ? endOfStatementIdx : clean.length
    const section = clean.slice(closingIdx, end)
    const nums    = (section.match(/\b\d{4,}\b/g) ?? []).map(Number).filter(n => n >= 1000)
    if (nums.length >= 3) {
      // Last 3 large numbers = Employee / Employer / Pension
      employeeBalance = nums[nums.length - 3]
      employerBalance = nums[nums.length - 2]
      pensionBalance  = nums[nums.length - 1]
    } else if (nums.length > 0) {
      employeeBalance = nums[nums.length - 1]
    }
  }

  const totalBalance = employeeBalance + employerBalance + pensionBalance

  // ── Monthly entries: extract month-year patterns and associated contributions
  const entries: EPFMonthlyEntry[] = []
  const monthMatches = [...clean.matchAll(/([A-Z]{3}[-\/]\d{4})/gi)]
  const seenMonths = new Set<string>()

  for (const mm of monthMatches) {
    const month = parseEPFDate(mm[1])
    if (!month || seenMonths.has(month)) continue
    seenMonths.add(month)

    // Look for numbers in the 200 characters after this month mention
    const after = clean.slice(mm.index! + mm[0].length, mm.index! + mm[0].length + 300)
    const nums  = (after.match(/\b\d+\b/g) ?? []).map(Number).filter(n => n > 0 && n < 10_000_000)

    if (nums.length > 0) {
      entries.push({
        month,
        employeeShare:  nums[0] ?? 0,
        employerShare:  nums[1] ?? 0,
        pensionShare:   nums[2] ?? 0,
        interest:       0,
        closingBalance: nums[nums.length - 1] ?? 0,
      })
    }
  }

  const sorted = [...entries].sort((a, b) => a.month.localeCompare(b.month))

  if (totalBalance === 0 && !sorted.length) {
    return { status: 'no_data', message: 'Could not extract EPF balance. Try entering manually below.',
      uan, pan, memberName, establishmentName, totalBalance: 0,
      employeeBalance: 0, employerBalance: 0, pensionBalance: 0, entries: [] }
  }

  return {
    status:  'success',
    message: `EPF balance extracted · ${sorted.length} months of history`,
    uan, pan, memberName, establishmentName,
    totalBalance, employeeBalance, employerBalance, pensionBalance,
    entries: sorted,
  }
}

// ─── Convert to app types ─────────────────────────────────────────────────────

export function epfToSnapshot(result: EPFParseResult): Omit<NetWorthSnapshot, 'id'> {
  return {
    date: new Date().toISOString().slice(0, 7),
    assets: {
      checking:   0,
      savings:    0,
      brokerage:  0,
      retirement: result.totalBalance,
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

export function epfToTransactions(result: EPFParseResult): Omit<Transaction, 'id'>[] {
  return result.entries
    .filter(e => e.month)
    .map(e => ({
      date:     `${e.month}-01`,
      amount:   e.employeeShare + e.employerShare,
      category: 'Savings',
      type:     'expense' as const,
      note:     `EPF — Emp: ₹${e.employeeShare} + Er: ₹${e.employerShare}`,
    }))
}

export function epfToHolding(result: EPFParseResult): import('../types').Holding {
  return {
    id:        Math.random().toString(36).slice(2),
    name:      'EPF',
    ticker:    result.uan || 'EPF',
    type:      'retirement',
    subType:   'EPF',
    qty:       1,
    lastPrice: result.totalBalance,
    value:     result.totalBalance,
    costBasis: result.employeeBalance,
  }
}

// Returns one snapshot per contribution month — enables historical sparkline
export function epfToMonthlySnapshots(result: EPFParseResult): Omit<NetWorthSnapshot, 'id'>[] {
  if (!result.entries.length) return []

  // Derive opening balance by subtracting all contributions from closing
  const totalEEContrib = result.entries.reduce((a, e) => a + e.employeeShare, 0)
  const totalERContrib = result.entries.reduce((a, e) => a + e.employerShare, 0)
  const totalPSContrib = result.entries.reduce((a, e) => a + e.pensionShare, 0)

  let eeRunning = result.employeeBalance - totalEEContrib
  let erRunning = result.employerBalance - totalERContrib
  let psRunning = result.pensionBalance  - totalPSContrib

  const snapshots: Omit<NetWorthSnapshot, 'id'>[] = []

  for (const entry of result.entries) {
    eeRunning += entry.employeeShare
    erRunning += entry.employerShare
    psRunning += entry.pensionShare

    snapshots.push({
      date: entry.month,
      assets: {
        checking: 0, savings: 0, brokerage: 0,
        retirement: Math.round(eeRunning + erRunning + psRunning),
        realEstate: 0, other: 0,
      },
      liabilities: { mortgage: 0, studentLoans: 0, creditCards: 0, autoLoans: 0, other: 0 },
    })
  }

  return snapshots
}
