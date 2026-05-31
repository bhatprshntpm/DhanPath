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
  unvested?:    boolean
}

export interface FidelityParseResult {
  status:      'success' | 'error'
  message:     string
  reportDate:  string
  holdings:    FidelityHolding[]
  totalUSD:    number
}

// ─── PDF text extraction ──────────────────────────────────────────────────────
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
      const line = byY[y].sort((a, b) => a.x - b.x).map(i => i.str).join(' ').trim()
      if (line) allLines.push(line)
    }
  }
  return allLines
}

function extractNumbers(line: string): number[] {
  const nums: number[] = []
  const tokens = line.split(/\s+/)
  for (const token of tokens) {
    const cleaned = token.replace(/[$,()]/g, '').replace(/--|-$/g, '')
    const num = parseFloat(cleaned)
    if (!isNaN(num) && cleaned.length > 0) nums.push(num)
  }
  return nums
}

function isSkippable(name: string, ticker: string): boolean {
  const n = name.toUpperCase()
  // Skip financial statement metadata lines and glossary terms
  if (n.includes('MMKT') || n.includes('TREASURY') || n.includes('MONEY MARKET')) return true
  if (n.includes('ACCRUED') || n.includes('DIVIDEND') || n.includes('ESTIMATED')) return true
  if (n.includes('INDICATED') || n.includes('INTEREST') || n.includes('YIELD')) return true
  if (n.startsWith('TOTAL') || n.startsWith('ENDING') || n.startsWith('BEGINNING')) return true
  if (n.startsWith('CHANGE IN') || n.startsWith('COPYRIGHT') || n.startsWith('ALL POSITIONS')) return true
  // Skip known non-stock tickers
  const skipTickers = new Set(['FYIXX', 'AI', 'IAD', 'EAI', 'EY', 'NFS', 'SIPC', 'SWR'])
  return skipTickers.has(ticker)
}

// ─── Parse numbers after a stock entry into qty/price/value/cost ──────────────
function parseHoldingNumbers(numbers: number[]): { qty: number; priceUSD: number; valueUSD: number; costBasisUSD: number; gainUSD: number } | null {
  for (let k = 0; k < numbers.length - 2; k++) {
    const possibleQty   = numbers[k]
    const possiblePrice = numbers[k + 1]
    const possibleValue = numbers[k + 2]
    if (possibleQty > 0 && possiblePrice > 0 && possibleValue > 0 &&
        Math.abs(possibleQty * possiblePrice - possibleValue) / possibleValue < 0.06) {
      return {
        qty:          possibleQty,
        priceUSD:     possiblePrice,
        valueUSD:     possibleValue,
        costBasisUSD: numbers[k + 3] ?? 0,
        gainUSD:      numbers[k + 4] ?? (possibleValue - (numbers[k + 3] ?? 0)),
      }
    }
  }
  // Fallback when qty verification fails — cap at $5M to avoid picking up footnote numbers
  const largeNums = numbers.filter(n => n > 10 && n < 5_000_000)
  if (largeNums.length >= 2) {
    const valueUSD = Math.max(...largeNums)
    const costBasisUSD = largeNums.find(n => n < valueUSD) ?? 0
    return { qty: 0, priceUSD: 0, valueUSD, costBasisUSD, gainUSD: valueUSD - costBasisUSD }
  }
  return null
}

// ─── Main parser ──────────────────────────────────────────────────────────────
export async function parseFidelityPDF(file: File): Promise<FidelityParseResult> {
  try {
    const lines = await extractLines(file)
    const full  = lines.join('\n')

    if (!full.includes('STOCK PLAN') && !full.includes('Fidelity')) {
      return { status: 'error', message: 'Does not look like a Fidelity statement', reportDate: '', holdings: [], totalUSD: 0 }
    }

    const reportDate = new Date().toISOString().slice(0, 10)
    const holdings: FidelityHolding[] = []

    // Pattern 1: ticker on SAME line — "AMAZON.COM INC (AMZN) $15,997..."
    const sameLinePattern  = /^(.+?)\s*\(([A-Z]{1,5})\)(.*)?$/
    // Pattern 2: ticker on NEXT line — "(SNOW)" or "(SNOW) -"
    const tickerOnlyPattern = /^\(([A-Z]{1,5})\)/

    // ── Pass 1: Parse Holdings section (vested/settled shares) ─────────────────
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      let name = '', ticker = '', dataStartIdx = i + 1
      let inlineNumbers: number[] = []

      // Check same-line pattern — also capture anything after the ticker (inline numbers)
      const sameMatch = line.match(sameLinePattern)
      if (sameMatch && sameMatch[2]) {
        name   = sameMatch[1].trim()
        ticker = sameMatch[2].trim()
        if (sameMatch[3]) inlineNumbers = extractNumbers(sameMatch[3])
      } else {
        // Check if NEXT line starts with a standalone ticker e.g. "(SNOW)" or "(SNOW) -"
        const nextLine = lines[i + 1]?.trim() ?? ''
        const nextTickerMatch = nextLine.match(tickerOnlyPattern)
        if (nextTickerMatch) {
          // Numbers are embedded in the current line — extract name as text-before-$
          const dollarIdx = line.search(/[\d$]/)
          name = (dollarIdx > 0 ? line.slice(0, dollarIdx) : line).trim()
          inlineNumbers = extractNumbers(line)   // numbers from the data line itself
          ticker = nextTickerMatch[1]
          dataStartIdx = i + 2
          i++
        }
      }

      if (!name || !ticker) continue
      if (isSkippable(name, ticker)) continue

      // Collect numbers from inline portion + following lines
      const numbers: number[] = [...inlineNumbers]
      for (let j = dataStartIdx; j < Math.min(dataStartIdx + 20, lines.length); j++) {
        const nextLine = lines[j].trim()
        // Stop at a NEW stock entry
        if (nextLine.match(sameLinePattern) || nextLine.match(tickerOnlyPattern)) break
        // Stop at top-level section headers (not per-stock sub-totals like "Total Common Stock")
        if (nextLine.match(/^Total\s+(Stocks|Holdings|Trades|Core)/i)) break
        if (nextLine.match(/^(Core Account|Activity|Stock Plans|Restricted Stock)/i)) break
        numbers.push(...extractNumbers(nextLine))
      }

      const parsed = parseHoldingNumbers(numbers)
      if (parsed && parsed.valueUSD > 0) {
        if (!holdings.find(h => h.ticker === ticker)) {
          holdings.push({ name, ticker, ...parsed, unvested: false })
        }
      }
    }

    if (!holdings.length) {
      return { status: 'error', message: 'No holdings found. Make sure you upload the full quarterly statement PDF.', reportDate, holdings: [], totalUSD: 0 }
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
    qty:        h.qty || undefined,
    avgPrice:   h.costBasisUSD > 0 && h.qty > 0 ? h.costBasisUSD / h.qty : undefined,
    lastPrice:  h.priceUSD || undefined,
    value:      Math.round(h.valueUSD * inrPerUsd),
    costBasis:  Math.round(h.costBasisUSD * inrPerUsd),
  }))
}
