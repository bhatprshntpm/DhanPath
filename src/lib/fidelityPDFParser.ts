import * as pdfjsLib from 'pdfjs-dist'
import type { Holding } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

export interface FidelityHolding {
  name:         string
  ticker:       string
  qty:          number
  priceUSD:     number
  valueUSD:     number
  costBasisUSD: number
  gainUSD:      number
}

export interface FidelityParseResult {
  status:      'success' | 'error'
  message:     string
  reportDate:  string
  holdings:    FidelityHolding[]
  totalUSD:    number
}

// ─── PDF text extraction (same Y-grouping approach as casParser) ──────────────
async function extractLines(file: File): Promise<string[]> {
  const buf  = await file.arrayBuffer()
  const task = pdfjsLib.getDocument({ data: new Uint8Array(buf) })
  const pdf  = await task.promise
  const allLines: string[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p)
    const content = await page.getTextContent()
    const items   = content.items as any[]
    if (!items.length) continue

    const byY: Record<number, { x: number; str: string }[]> = {}
    for (const item of items) {
      if (!item.str?.trim()) continue
      const y = Math.round(item.transform[5])
      const x = Math.round(item.transform[4])
      ;(byY[y] = byY[y] ?? []).push({ x, str: item.str })
    }

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

function _parseUSD(s: string): number {
  return parseFloat(s.replace(/[$,]/g, '')) || 0
}

// ─── Main parser ──────────────────────────────────────────────────────────────
export async function parseFidelityPDF(file: File): Promise<FidelityParseResult> {
  try {
    const lines = await extractLines(file)
    const full  = lines.join('\n')

    // Sanity check
    if (!full.includes('STOCK PLAN') && !full.includes('Fidelity')) {
      return { status: 'error', message: 'Does not look like a Fidelity statement', reportDate: '', holdings: [], totalUSD: 0 }
    }

    // Extract report date  e.g. "January 1, 2026 - March 31, 2026"
    const dateMatch = full.match(/January|February|March|April|May|June|July|August|September|October|November|December/)
    const reportDate = dateMatch ? new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)

    const holdings: FidelityHolding[] = []

    void _parseUSD
  // Pattern: "COMPANY NAME (TICKER)" on one line, followed by numbers
    // Regex captures: company name + ticker symbol in parens
    const stockPattern = /^(.+?)\s+\(([A-Z]{1,5})\)\s*$/

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      // Match stock line: "AMAZON.COM INC (AMZN)"
      const stockMatch = line.match(stockPattern)
      if (!stockMatch) continue

      const name   = stockMatch[1].trim()
      const ticker = stockMatch[2].trim()

      // Skip money market / cash funds
      if (name.includes('MMKT') || name.includes('TREASURY') || ticker === 'FYIXX') continue

      // Collect the next ~8 lines and extract numbers
      const numbers: number[] = []
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        const nextLine = lines[j].trim()
        // Stop if we hit another stock name or section header
        if (nextLine.match(stockPattern) || nextLine.match(/^(Total|Common Stock|Stocks|Holdings|Core Account)/i)) break

        // Extract all dollar amounts and numbers from the line
        const tokens = nextLine.split(/\s+/)
        for (const token of tokens) {
          const cleaned = token.replace(/[$,()]/g, '').replace(/--/g, '')
          const num = parseFloat(cleaned)
          if (!isNaN(num) && cleaned.length > 0 && cleaned !== '-') {
            numbers.push(num)
          }
        }
      }

      // Fidelity Holdings columns: Beginning Value | Quantity | Price/Unit | Ending Value | Cost Basis | Gain/Loss
      // We need: qty, priceUSD, valueUSD, costBasisUSD, gainUSD
      // Find quantity (typically a decimal like 69.307), price, value, cost
      if (numbers.length >= 3) {
        // Find the quantity — it's typically a decimal with 3 decimal places
        let qty = 0, priceUSD = 0, valueUSD = 0, costBasisUSD = 0, gainUSD = 0

        // Strategy: look for a small-ish number (qty < 10000) followed by a price,
        // then a larger value
        for (let k = 0; k < numbers.length - 2; k++) {
          const possibleQty   = numbers[k]
          const possiblePrice = numbers[k + 1]
          const possibleValue = numbers[k + 2]

          // qty × price ≈ value (within 5%)
          if (possibleQty > 0 && possiblePrice > 0 &&
              Math.abs(possibleQty * possiblePrice - possibleValue) / possibleValue < 0.05) {
            qty          = possibleQty
            priceUSD     = possiblePrice
            valueUSD     = possibleValue
            costBasisUSD = numbers[k + 3] ?? 0
            gainUSD      = numbers[k + 4] ?? (valueUSD - costBasisUSD)
            break
          }
        }

        // Fallback: just take ending value and cost basis from the largest numbers
        if (qty === 0 && numbers.length >= 2) {
          valueUSD     = Math.max(...numbers.filter(n => n > 100))
          costBasisUSD = numbers.find(n => n > 100 && n < valueUSD) ?? 0
        }

        if (valueUSD > 0) {
          holdings.push({ name, ticker, qty, priceUSD, valueUSD, costBasisUSD, gainUSD })
        }
      }
    }

    if (!holdings.length) {
      return { status: 'error', message: 'No stock holdings found. Try the Holdings page of your statement.', reportDate, holdings: [], totalUSD: 0 }
    }

    const totalUSD = holdings.reduce((a, h) => a + h.valueUSD, 0)
    return {
      status:  'success',
      message: `Found ${holdings.length} holding${holdings.length > 1 ? 's' : ''} · $${totalUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} total`,
      reportDate,
      holdings,
      totalUSD,
    }
  } catch (err: any) {
    return { status: 'error', message: String(err?.message ?? 'Failed to parse PDF'), reportDate: '', holdings: [], totalUSD: 0 }
  }
}

// ─── Convert to app holdings (INR) ───────────────────────────────────────────
export function fidelityToHoldings(
  parsed: FidelityParseResult,
  inrPerUsd: number,
): Omit<Holding, 'id'>[] {
  return parsed.holdings.map(h => ({
    name:       h.name.split(' ').map(w => w[0] + w.slice(1).toLowerCase()).join(' '),
    ticker:     h.ticker,
    type:       'stock' as const,
    assetClass: 'International',
    subType:    'US RSU / Stock',
    qty:        h.qty,
    avgPrice:   h.costBasisUSD > 0 && h.qty > 0 ? h.costBasisUSD / h.qty : undefined,
    lastPrice:  h.priceUSD,
    value:      Math.round(h.valueUSD * inrPerUsd),
    costBasis:  Math.round(h.costBasisUSD * inrPerUsd),
  }))
}
