import * as pdfjsLib from 'pdfjs-dist'
import type { Holding } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

export interface DematHolding {
  symbol:       string
  name:         string
  isin:         string
  quantity:     number
  faceValue:    number
  marketValue:  number
  type:         'stock' | 'etf' | 'bond' | 'mutual_fund'
}

export interface DematParseResult {
  status:       'success' | 'password_required' | 'parse_error' | 'no_data'
  message:      string
  depository:   'NSDL' | 'CDSL' | 'Unknown'
  pan:          string
  statementDate:string
  holdings:     DematHolding[]
  totalValue:   number
  dpId:         string
}

async function extractPages(file: File, password?: string): Promise<string[]> {
  const buf  = await file.arrayBuffer()
  const task = pdfjsLib.getDocument({ data: new Uint8Array(buf), password: password ?? '', standardFontDataUrl: '/standard_fonts/' })
  const pdf  = await task.promise
  const out: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    out.push(content.items.map((x: any) => x.str).join(' '))
  }
  return out
}



export async function parseNSDLCDSLPDF(file: File, password?: string): Promise<DematParseResult> {
  let pages: string[]
  try {
    pages = await extractPages(file, password)
  } catch (err: any) {
    if (err?.name === 'PasswordException' || /password/i.test(err?.message ?? '')) {
      return { status: 'password_required', message: 'Password required. Try your PAN or date of birth (DDMMYYYY).', depository: 'Unknown', pan: '', statementDate: '', holdings: [], totalValue: 0, dpId: '' }
    }
    return { status: 'parse_error', message: String(err?.message ?? err), depository: 'Unknown', pan: '', statementDate: '', holdings: [], totalValue: 0, dpId: '' }
  }

  const fullText  = pages.join('\n')
  const depository: 'NSDL' | 'CDSL' | 'Unknown' =
    /NSDL/i.test(fullText) ? 'NSDL' :
    /CDSL/i.test(fullText) ? 'CDSL' : 'Unknown'

  const panMatch  = fullText.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/)
  const pan       = panMatch?.[1] ?? ''
  const dateMatch = fullText.match(/(?:as\s+on|statement\s+date)[^\d]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i)
  const statementDate = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10)
  const dpMatch   = fullText.match(/DP\s*ID\s*[:\-]?\s*([A-Z0-9]{8,16})/i)
  const dpId      = dpMatch?.[1] ?? ''
  const holdings: DematHolding[] = []
  const lines     = fullText.split(/\n/)
  for (const line of lines) {
    const isinMatch = line.match(/\b(IN[A-Z0-9]{10})\b/)
    if (!isinMatch) continue

    const isin   = isinMatch[1]
    const clean  = line.replace(/,/g, '').replace(isin, '').trim()

    // Extract numbers — last two are usually quantity and market value (or face value, qty, mkt value)
    const nums  = [...clean.matchAll(/([\d]+(?:\.[\d]+)?)/g)]
      .map(m => parseFloat(m[1]))
      .filter(n => n > 0)

    if (nums.length < 2) continue

    // Heuristic: largest number is likely market value, number before it is quantity
    const marketValue = nums[nums.length - 1]
    const quantity    = nums[nums.length - 2]

    // Extract name: text between ISIN and first number
    const afterISIN   = line.slice(line.indexOf(isin) + isin.length)
    const nameMatch   = afterISIN.match(/^([A-Za-z\s\-().&,']+?)(?=\s[\d])/)
    const name        = nameMatch ? nameMatch[1].trim().slice(0, 80) : isin

    const ETF_RE      = /\bETF\b|BeES|INDEX|NIFTY|SENSEX/i
    const BOND_RE     = /BOND|DEBENTURE|NCD|GOI|T-BILL|TBILL/i
    const MF_RE       = /FUND|SCHEME|MF\b/i

    const type: DematHolding['type'] =
      BOND_RE.test(name) ? 'bond' :
      ETF_RE.test(name)  ? 'etf' :
      MF_RE.test(name)   ? 'mutual_fund' : 'stock'

    if (quantity > 0 && marketValue > 0) {
      holdings.push({ symbol: name.slice(0, 12).trim(), name, isin, quantity, faceValue: 0, marketValue, type })
    }
  }

  // Deduplicate by ISIN
  const seen  = new Set<string>()
  const deduped = holdings.filter(h => {
    if (seen.has(h.isin)) return false
    seen.add(h.isin)
    return true
  })

  const totalValue = deduped.reduce((a, h) => a + h.marketValue, 0)

  if (!deduped.length) {
    return { status: 'no_data', message: 'No holdings found. Ensure this is an NSDL/CDSL CAS PDF.', depository, pan, statementDate, holdings: [], totalValue: 0, dpId }
  }

  return { status: 'success', message: `Found ${deduped.length} holdings from ${depository}`, depository, pan, statementDate, holdings: deduped, totalValue, dpId }
}

export function dematToAppHoldings(result: DematParseResult): Omit<Holding, 'id'>[] {
  return result.holdings.map(h => ({
    name:      h.name,
    ticker:    h.symbol,
    type:      h.type === 'mutual_fund' ? 'etf' : h.type === 'bond' ? 'bond' : h.type,
    value:     h.marketValue,
    costBasis: h.marketValue,
  }))
}
