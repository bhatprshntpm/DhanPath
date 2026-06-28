import * as pdfjsLib from 'pdfjs-dist'
import type { Holding } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

export type CanaraAccountType = 'savings' | 'fd' | 'ppf'

export interface CanaraAccount {
  accountNumber: string
  accountType:   CanaraAccountType
  bank?:         string
  bankCode?:     string
  scheme?:       string
  balance:       number
  maturityDate?: string
  maturityAmount?: number
  interestRate?: number
  depositDate?:  string
  isActive:      boolean
  sourceFile:    string
}

export interface CanaraParseResult {
  status:   'success' | 'error' | 'skipped'
  message:  string
  accounts: CanaraAccount[]
}

// ── helpers ────────────────────────────────────────────────────────────────

// Extract first Indian-format number from a string (e.g. "Rs.27,903.51" → 27903.51)
function extractNumber(s: string): number {
  const m = s.match(/([\d,]+\.\d{1,2})/)
  if (!m) return 0
  return parseFloat(m[1].replace(/,/g, '')) || 0
}

// Strip Excel ="..." wrapper used in Canara CSV exports
function stripExcel(s: string): string {
  return s.trim().replace(/^="?/, '').replace(/"$/, '').trim()
}


function parseAmount(s: string): number {
  return extractNumber(s)
}

async function extractPDFText(file: File): Promise<string> {
  const buf  = await file.arrayBuffer()
  const task = pdfjsLib.getDocument({ data: new Uint8Array(buf), password: '' })
  const pdf  = await task.promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((x: any) => x.str).join(' '))
  }
  return pages.join('\n')
}

function parseDateDMY(s: string): string {
  // "21 Apr 2023" or "03-Dec-2026" or "21-Apr-2028"
  const months: Record<string, string> = {
    Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
    Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
  }
  const m = s.match(/(\d{1,2})[\s\-]+([A-Za-z]{3})[\s\-]+(\d{4})/)
  if (!m) return ''
  const mon = months[m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase()]
  return mon ? `${m[3]}-${mon}-${m[1].padStart(2, '0')}` : ''
}

// ── CSV parsers ─────────────────────────────────────────────────────────────

function parseSavingsCSV(text: string, filename: string): CanaraParseResult {
  const lines = text.split(/\r?\n/)

  // Use regex on raw lines — avoids comma-in-quoted-field splitting issues
  const accLine  = lines.find(l => /Account\s*Number/i.test(l.split(',')[0]))
  const balLine  = lines.find(l => /Closing\s*Balance/i.test(l.split(',')[0]))

  const accountNumber  = accLine  ? stripExcel(accLine.split(',').slice(1).join(',')).replace(/\s+/g,'') : ''
  const closingBalance = balLine  ? extractNumber(balLine) : 0

  if (!accountNumber || closingBalance === 0) {
    return { status: 'error', message: 'Could not extract account/balance from savings CSV', accounts: [] }
  }

  return {
    status: 'success',
    message: 'Savings account parsed',
    accounts: [{
      accountNumber,
      accountType: 'savings',
      balance: closingBalance,
      isActive: true,
      sourceFile: filename,
    }],
  }
}

function parseFDCSV(text: string, filename: string): CanaraParseResult {
  const lines = text.split(/\r?\n/)

  const accLine   = lines.find(l => /Account\s*Number/i.test(l.split(',')[0]))
  const prinLine  = lines.find(l => /Principal\s*Amount/i.test(l.split(',')[0]))
  const balLine   = lines.find(l => /Closing\s*Balance/i.test(l.split(',')[0]))

  const accountNumber   = accLine  ? stripExcel(accLine.split(',').slice(1).join(',')).replace(/\s+/g,'') : ''
  const principalAmount = prinLine ? extractNumber(prinLine) : 0
  const closingBalance  = balLine  ? extractNumber(balLine)  : 0

  // Skip matured/zero-value FDs
  if (principalAmount === 0 && closingBalance === 0) {
    return { status: 'skipped', message: `FD ${accountNumber} is matured/zero — skipped`, accounts: [] }
  }
  if (!accountNumber) {
    return { status: 'error', message: 'Could not extract account number from FD CSV', accounts: [] }
  }

  return {
    status: 'success',
    message: 'FD statement parsed',
    accounts: [{
      accountNumber,
      accountType: 'fd',
      balance: principalAmount > 0 ? principalAmount : closingBalance,
      isActive: true,
      sourceFile: filename,
    }],
  }
}

// ── PDF parsers ──────────────────────────────────────────────────────────────

function parsePPFPDF(text: string, filename: string): CanaraParseResult {
  const accMatch = text.match(/PPF\s*Account\s*Number\s*[-–]\s*(PPF[\d]+)/i)
  const accountNumber = accMatch?.[1] ?? ''

  const matMatch = text.match(/Maturity\s*Date\s+(\d{2}-[A-Z]{3}-\d{4})/i)
  const maturityDate = matMatch ? parseDateDMY(matMatch[1]) : ''

  // Balance is the last column of the transaction row: "C  25,000.00  0.00  3,21,797.00"
  // Find all numbers that look like Indian balances (e.g. 3,21,797.00)
  // The PPF balance is the LAST number on the transaction data line
  const txnLine = text.match(/PPF\s+SUBSCRIPTION\s+C[\s\d,\.]+/)
  let balance = 0
  if (txnLine) {
    const nums = [...txnLine[0].matchAll(/([\d,]+\.\d{2})/g)].map(m => parseFloat(m[1].replace(/,/g,'')))
    // Last number in the row = balance
    balance = nums.at(-1) ?? 0
  }
  // Fallback: last 6-digit+ number in the whole text
  if (balance === 0) {
    const allNums = [...text.matchAll(/([\d,]+\.\d{2})/g)]
      .map(m => parseFloat(m[1].replace(/,/g,'')))
      .filter(v => v > 10000)
    balance = allNums.at(-1) ?? 0
  }

  if (!accountNumber || balance === 0) {
    return { status: 'error', message: 'Could not parse PPF statement', accounts: [] }
  }

  return {
    status: 'success',
    message: 'PPF account parsed',
    accounts: [{
      accountNumber,
      accountType: 'ppf',
      balance,
      maturityDate,
      isActive: true,
      sourceFile: filename,
    }],
  }
}

function parseSavingsPDF(text: string, filename: string): CanaraParseResult {
  const accMatch  = text.match(/Account\s*Number\s+([\d]+)/i)
  const balMatch  = text.match(/Closing\s*Balance\s+Rs\.\s*([\d,]+\.\d{2})/i)

  const accountNumber = accMatch?.[1]?.trim() ?? ''
  const balance       = balMatch ? parseAmount(balMatch[1]) : 0

  if (!accountNumber || balance === 0) {
    return { status: 'error', message: 'Could not parse savings PDF', accounts: [] }
  }

  return {
    status: 'success',
    message: 'Savings account parsed from PDF',
    accounts: [{
      accountNumber,
      accountType: 'savings',
      balance,
      isActive: true,
      sourceFile: filename,
    }],
  }
}

function parseFDReceiptPDF(text: string, filename: string): CanaraParseResult {
  // e-TDR Account No. (first occurrence = the specific account)
  const accMatch = text.match(/e-TDR\s+Account\s+No\.\s+([\d]+\s*-\s*\d+)/i)
  const accountNumber = accMatch?.[1]?.replace(/\s+/g, '') ?? ''

  // Scheme
  const schemeMatch = text.match(/Scheme\s+([A-Z0-9\s\-()]+?)(?:\s+Maturity|\s+Annual|\s+CKYC)/i)
  const scheme = schemeMatch?.[1]?.trim() ?? ''

  // The data table row at end of PDF — all values on one line:
  // "0202410000570 - 3  21 Apr 2023  20,000.00  60 Month(s) 0 Day(s)  6.70  7,882.00  21 Apr 2028  27,882.00"
  // Strategy: find the last occurrence of the account number and extract the data row
  const acNo = accountNumber.replace(/\s*-\s*/, '\\s*-\\s*')
  const rowRe = new RegExp(
    acNo +
    '\\s+(\\d{1,2}\\s+[A-Za-z]{3}\\s+\\d{4})' +   // deposit date
    '\\s+([\\d,]+\\.\\d{2})' +                       // deposit amount
    '.*?' +                                           // period
    '([\\d.]+)' +                                     // interest rate
    '\\s+[\\d,]+\\.\\d{2}' +                          // total interest
    '\\s+(\\d{1,2}\\s+[A-Za-z]{3}\\s+\\d{4})' +      // maturity date
    '\\s+([\\d,]+\\.\\d{2})',                          // maturity amount
    'i'
  )
  const rowMatch = text.match(rowRe)

  let depositAmount  = 0
  let interestRate   = 0
  let maturityDate   = ''
  let maturityAmount = 0
  let depositDate    = ''

  if (rowMatch) {
    depositDate    = parseDateDMY(rowMatch[1])
    depositAmount  = parseAmount(rowMatch[2])
    interestRate   = parseFloat(rowMatch[3]) || 0
    maturityDate   = parseDateDMY(rowMatch[4])
    maturityAmount = parseAmount(rowMatch[5])
  } else {
    // Fallback: extract individual fields
    const depAmtMatch  = text.match(/Deposit\s+Amount\s+([\d,]+\.\d{2})/i)
    const rateMatch    = text.match(/Rate\s+of\s+Interest\s+([\d.]+)/i)
    const matAmtMatch  = [...text.matchAll(/Maturity\s+Amount\s+([\d,]+\.\d{2})/gi)].at(-1)
    const matDtMatch   = [...text.matchAll(/Maturity\s+Date\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/gi)].at(-1)
    const depDtMatch   = text.match(/Date\s+of\s+Deposit\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i)

    depositAmount  = depAmtMatch  ? parseAmount(depAmtMatch[1])  : 0
    interestRate   = rateMatch    ? parseFloat(rateMatch[1])     : 0
    maturityAmount = matAmtMatch  ? parseAmount(matAmtMatch[1])  : 0
    maturityDate   = matDtMatch   ? parseDateDMY(matDtMatch[1])  : ''
    depositDate    = depDtMatch   ? parseDateDMY(depDtMatch[1])  : ''
  }

  // Skip zero/matured FDs
  if (depositAmount === 0 && maturityAmount === 0) {
    return { status: 'skipped', message: `FD ${accountNumber} is matured/zero — skipped`, accounts: [] }
  }

  if (!accountNumber) {
    return { status: 'error', message: 'Could not extract account number from FD receipt', accounts: [] }
  }

  return {
    status: 'success',
    message: 'FD receipt parsed',
    accounts: [{
      accountNumber,
      accountType:   'fd',
      scheme,
      balance:       depositAmount,
      maturityDate,
      maturityAmount,
      interestRate,
      depositDate,
      isActive:      true,
      sourceFile:    filename,
    }],
  }
}

// ── Kotak Balance Certificate parser ────────────────────────────────────────

function parseKotakBalancePDF(text: string, filename: string): CanaraParseResult {
  const accounts: CanaraAccount[] = []

  // Each row: BRANCHNAME  ACCTNO  INR  (SAVING|TERM DEPOSIT)  CR  BALANCE
  const rowRe = /[A-Z]+\s+(\d{8,12})\s+INR\s+(SAVING|TERM\s+DEPOSIT)\s+CR\s+([\d,]+\.?\d*)/gi
  let m: RegExpExecArray | null
  while ((m = rowRe.exec(text)) !== null) {
    const accountNumber = m[1]
    const accountType   = /saving/i.test(m[2]) ? 'savings' : 'fd'
    const balance       = parseFloat(m[3])
    if (balance > 0) {
      accounts.push({
        accountNumber,
        accountType: accountType as CanaraAccountType,
        bank:        'Kotak Bank',
        bankCode:    'KOTAK',
        balance,
        isActive:    true,
        sourceFile:  filename,
      })
    }
  }

  if (accounts.length === 0) {
    return { status: 'error', message: 'No accounts found in Kotak balance certificate', accounts: [] }
  }
  return { status: 'success', message: `${accounts.length} Kotak accounts parsed`, accounts }
}



export async function parseCanaraFile(file: File): Promise<CanaraParseResult> {
  const name = file.name.toLowerCase()

  try {
    if (name.endsWith('.csv')) {
      const text = await file.text()
      if (/Current\s*&\s*Saving\s*Account\s*Statement/i.test(text)) {
        return parseSavingsCSV(text, file.name)
      }
      if (/Term\s*Deposit\s*Account\s*Statement/i.test(text)) {
        return parseFDCSV(text, file.name)
      }
      return { status: 'error', message: `Unrecognised CSV format in ${file.name}`, accounts: [] }
    }

    if (name.endsWith('.pdf')) {
      const text = await extractPDFText(file)
      if (/balance\s*certificate/i.test(text) && /CRN\s*:/i.test(text) && /(SAVING|TERM\s+DEPOSIT)\s+CR/i.test(text)) {
        return parseKotakBalancePDF(text, file.name)
      }
      if (/PPF\s*Statement/i.test(text)) {
        return parsePPFPDF(text, file.name)
      }
      if (/E-?Term\s*Deposit\s*Receipt/i.test(text)) {
        return parseFDReceiptPDF(text, file.name)
      }
      if (/Current\s*&?\s*Saving\s*Account\s*Statement/i.test(text)) {
        return parseSavingsPDF(text, file.name)
      }
      return { status: 'error', message: `Unrecognised PDF format in ${file.name}`, accounts: [] }
    }

    return { status: 'error', message: `Unsupported file type: ${file.name}`, accounts: [] }
  } catch (e: any) {
    return { status: 'error', message: `Parse error in ${file.name}: ${e?.message ?? e}`, accounts: [] }
  }
}

// ── convert to Holdings ──────────────────────────────────────────────────────

export function canaraAccountToHolding(acc: CanaraAccount): Omit<Holding, 'id'> {
  const bankCode = acc.bankCode ?? 'CANARA'
  const bankName = acc.bank ?? 'Canara Bank'
  const today = new Date().toISOString().slice(0, 10)

  if (acc.accountType === 'savings') {
    return {
      name:            `${bankName} Savings (${acc.accountNumber.slice(-4)})`,
      ticker:          `${bankCode}_SB_${acc.accountNumber.replace(/\s/g, '')}`,
      type:            'cash',
      assetClass:      'Cash & Savings',
      subType:         'Savings',
      value:           acc.balance,
      costBasis:       acc.balance,
      qty:             1,
      avgPrice:        acc.balance,
      lastPrice:       acc.balance,
      priceUpdatedAt:  today,
    }
  }

  if (acc.accountType === 'ppf') {
    return {
      name:            `${bankName} PPF (${acc.accountNumber})`,
      ticker:          `${bankCode}_PPF_${acc.accountNumber}`,
      type:            'retirement',
      assetClass:      'EPF / NPS / PPF',
      subType:         'PPF',
      value:           acc.balance,
      costBasis:       acc.balance,
      qty:             1,
      avgPrice:        acc.balance,
      lastPrice:       acc.balance,
      priceUpdatedAt:  today,
    }
  }

  // FD
  const schemeShort = acc.scheme
    ? ` · ${acc.scheme.replace(/CANARA\s*/i, '').replace(/KDR|FDR/i, '').trim().slice(0, 20)}`
    : ''
  return {
    name:            `${bankName} FD ${acc.accountNumber.slice(-6)}${schemeShort}`,
    ticker:          `${bankCode}_FD_${acc.accountNumber.replace(/[\s-]/g, '')}`,
    type:            'bond',
    assetClass:      'Debt',
    subType:         'Fixed Deposit',
    value:           acc.balance,
    costBasis:       acc.balance,
    qty:             1,
    avgPrice:        acc.balance,
    lastPrice:       acc.balance,
    priceUpdatedAt:  today,
  }
}
