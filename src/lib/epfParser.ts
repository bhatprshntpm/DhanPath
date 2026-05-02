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

function cleanNum(s: string): number {
  if (!s) return 0
  return parseFloat(s.replace(/[,\s]/g, '')) || 0
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
  const uanMatch = fullText.match(/UAN\s*[:\-]?\s*(\d{12})/i)
  const uan      = uanMatch?.[1] ?? ''

  // Extract PAN
  const panMatch = fullText.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/)
  const pan      = panMatch?.[1] ?? ''

  // Extract member name
  const nameMatch  = fullText.match(/(?:Member\s+Name|Name)\s*[:\-]\s*([A-Z][A-Z\s]{2,50})/i)
  const memberName = nameMatch?.[1]?.trim() ?? ''

  // Extract establishment name
  const estMatch          = fullText.match(/(?:Establishment|Company|Employer)\s*[:\-]\s*([A-Z][A-Z\s&.,()-]{2,80})/i)
  const establishmentName = estMatch?.[1]?.trim() ?? ''

  // Extract total balance — look for "Total Balance" or "Closing Balance"
  const balMatch       = fullText.replace(/,/g, '').match(/(?:Total\s+(?:Closing\s+)?Balance|Balance\s+as\s+on)[^\d]*([\d]+(?:\.[\d]+)?)/i)
  const totalBalance   = balMatch ? parseFloat(balMatch[1]) : 0

  // Parse monthly entries — EPFO passbook typically has:
  // Month | Emp Share | Employer Share | Pension | Interest | Closing Balance
  const entries: EPFMonthlyEntry[] = []

  const clean = fullText.replace(/,/g, '')

  // Pattern: Month-Year followed by amounts
  // e.g. "Apr-2023  5000.00  2165.00  1285.00  0.00  150000.00"
  const rowPattern = /([A-Z]{3}[\/\-\s]\d{4})\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/gi
  let m: RegExpExecArray | null

  while ((m = rowPattern.exec(clean)) !== null) {
    const month = parseEPFDate(m[1])
    if (!month) continue
    entries.push({
      month,
      employeeShare:  parseFloat(m[2]),
      employerShare:  parseFloat(m[3]),
      pensionShare:   parseFloat(m[4]),
      interest:       parseFloat(m[5]),
      closingBalance: parseFloat(m[6]),
    })
  }

  // Also try simpler pattern if above finds nothing
  if (!entries.length) {
    const simplePattern = /([A-Z]{3}[\/\-]\d{4})[^\d]*([\d,]+\.?\d*)/gi
    while ((m = simplePattern.exec(clean)) !== null) {
      const month = parseEPFDate(m[1])
      const amt   = cleanNum(m[2])
      if (month && amt > 0) {
        entries.push({ month, employeeShare: amt, employerShare: 0, pensionShare: 0, interest: 0, closingBalance: amt })
      }
    }
  }

  const sorted = [...entries].sort((a, b) => a.month.localeCompare(b.month))

  // Derive balances from last entry if total not found
  const lastEntry        = sorted[sorted.length - 1]
  const derivedTotal     = lastEntry?.closingBalance ?? totalBalance
  const employeeBalance  = sorted.reduce((a, e) => a + e.employeeShare, 0)
  const employerBalance  = sorted.reduce((a, e) => a + e.employerShare, 0)
  const pensionBalance   = sorted.reduce((a, e) => a + e.pensionShare, 0)

  if (!sorted.length && derivedTotal === 0) {
    return { status: 'no_data', message: 'Could not extract EPF data. Ensure this is an EPFO passbook PDF.', uan, pan, memberName, establishmentName, totalBalance: 0, employeeBalance: 0, employerBalance: 0, pensionBalance: 0, entries: [] }
  }

  return {
    status: 'success',
    message: `Found ${sorted.length} months of EPF history`,
    uan, pan, memberName, establishmentName,
    totalBalance: derivedTotal,
    employeeBalance,
    employerBalance,
    pensionBalance,
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
