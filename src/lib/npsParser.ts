import * as pdfjsLib from 'pdfjs-dist'
import type { Holding } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

export interface NPSScheme {
  key:      'E' | 'C' | 'G' | 'A'
  label:    string
  units:    number
  nav:      number
  value:    number
}

export interface NPSParseResult {
  status:         'success' | 'parse_error' | 'no_data'
  message:        string
  pran:           string
  subscriberName: string
  statementDate:  string
  fundManager:    string
  schemes:        NPSScheme[]
  tier1Total:     number
}

function parseIndianNumber(s: string): number {
  return parseFloat(s.replace(/,/g, '')) || 0
}

async function extractText(file: File): Promise<string> {
  const buf  = await file.arrayBuffer()
  const task = pdfjsLib.getDocument({ data: new Uint8Array(buf) })
  const pdf  = await task.promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((x: any) => x.str).join(' '))
  }
  return pages.join('\n')
}

function extractScheme(text: string, key: 'E' | 'C' | 'G' | 'A'): NPSScheme | null {
  const LABELS: Record<string, string> = {
    E: 'Scheme E — Equity',
    C: 'Scheme C — Corporate Bond',
    G: 'Scheme G — Govt Securities',
    A: 'Scheme A — Alternative Assets',
  }

  // Find "SCHEME E - TIER I" (or SCHEME C / G / A)
  const schemeRe = new RegExp(`SCHEME\\s+${key}\\s*-\\s*TIER\\s+I`, 'i')
  const match = schemeRe.exec(text)
  if (!match) return null

  // Grab up to 400 chars after the match to find the number block
  const after = text.slice(match.index + match[0].length, match.index + match[0].length + 400)

  // Extract all decimal numbers (handles Indian comma format like 1,79,038.24)
  const nums = [...after.matchAll(/([\d,]+\.[\d]+)/g)]
    .map(m => parseIndianNumber(m[1]))
    .filter(n => n > 0)

  // PDF table row order: totalUnits, blockedUnits, freeUnits, NAV, amount, inTransition, totalValue
  if (nums.length < 4) return null

  const units = nums[0]
  const nav   = nums[3] ?? nums[2]
  const value = nums[6] ?? nums[4] ?? nums[nums.length - 1]

  return { key, label: LABELS[key], units, nav, value }
}

export async function parseNPSPDF(file: File): Promise<NPSParseResult> {
  let text: string
  try {
    text = await extractText(file)
  } catch (err: any) {
    return { status: 'parse_error', message: String(err?.message ?? err), pran: '', subscriberName: '', statementDate: '', fundManager: '', schemes: [], tier1Total: 0 }
  }

  // Validate it's an NPS statement
  if (!/national\s+pension\s+system|NPS|PRAN/i.test(text)) {
    return { status: 'no_data', message: 'This does not appear to be an NPS statement PDF.', pran: '', subscriberName: '', statementDate: '', fundManager: '', schemes: [], tier1Total: 0 }
  }

  // PRAN
  const pranMatch = text.match(/PRAN\s+(\d{12})/)
  const pran      = pranMatch?.[1] ?? ''

  // Subscriber name — text between "Subscriber Name" and next known label
  const nameMatch    = text.match(/Subscriber\s+Name\s+((?:Shri|Smt|Dr|Mr|Ms)?\s*[A-Z][A-Z\s]+?)(?=Address|PAN|Phone|\d{2}-\w{3}-\d{4})/i)
  const subscriberName = nameMatch ? nameMatch[1].replace(/\s+/g, ' ').trim() : ''

  // Statement date
  const dateMatch    = text.match(/Statement\s+Generation\s+Date\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{2}[\/\-]\d{2}[\/\-]\d{4})/i)
  const statementDate = dateMatch ? dateMatch[1].trim() : new Date().toLocaleDateString('en-IN')

  // Fund manager — e.g. "HDFC PENSION FUND MANAGEMENT LIMITED"
  const fmMatch   = text.match(/A\/C\s+([\w\s]+PENSION\s+FUND[^S][^C][^\n]{0,40}?)\s+SCHEME/i)
  const fundManager = fmMatch ? fmMatch[1].trim() : ''

  // Extract each scheme
  const schemes: NPSScheme[] = []
  for (const key of ['E', 'C', 'G', 'A'] as const) {
    const s = extractScheme(text, key)
    if (s) schemes.push(s)
  }

  if (!schemes.length) {
    return { status: 'no_data', message: 'No Tier I scheme data found. Ensure this is a Protean/NSDL CRA holding statement.', pran, subscriberName, statementDate, fundManager, schemes: [], tier1Total: 0 }
  }

  // Total — try to read from "Total ... 2,90,570.52 2,90,570.52" line; fall back to sum
  const totalMatch = text.match(/Total\s+[\d,]+\.[\d]+\s+([\d,]+\.[\d]+)\s+([\d,]+\.[\d]+)/)
  const tier1Total = totalMatch
    ? parseIndianNumber(totalMatch[2])
    : schemes.reduce((a, s) => a + s.value, 0)

  return {
    status: 'success',
    message: `Parsed ${schemes.length} schemes · Tier I corpus ₹${tier1Total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
    pran, subscriberName, statementDate, fundManager, schemes, tier1Total,
  }
}

export function npsToHoldings(result: NPSParseResult): Omit<Holding, 'id'>[] {
  if (!result.schemes.length) return []

  // One holding per scheme so asset allocation reflects E/C/G split
  return result.schemes.map(s => ({
    name:       `NPS ${s.label}`,
    ticker:     `NPS-${s.key}`,
    type:       'retirement' as const,
    assetClass: s.key === 'E' ? 'Equity' : 'Debt',
    subType:    'NPS',
    qty:        s.units,
    lastPrice:  s.nav,
    value:      Math.round(s.value),
    costBasis:  Math.round(s.value),
  }))
}
