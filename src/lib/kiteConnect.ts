/**
 * Zerodha Kite Connect integration for DhanPath.
 *
 * Environment variables (Vite build-time):
 *   VITE_KITE_API_KEY    — Kite Connect app API key (public, safe in frontend)
 *   VITE_KITE_WORKER_URL — Cloudflare Worker URL
 */

const API_KEY    = import.meta.env.VITE_KITE_API_KEY    as string | undefined
const WORKER_URL = import.meta.env.VITE_KITE_WORKER_URL as string | undefined

export function isKiteConfigured(): boolean {
  return !!(API_KEY && WORKER_URL)
}

export function kiteOAuthUrl(): string {
  return `https://kite.zerodha.com/connect/login?api_key=${API_KEY}&v=3`
}

/**
 * Kite tokens expire every day at 06:30 IST (01:00 UTC).
 * Returns true if the token is still valid.
 */
export function isKiteTokenValid(connectedAt: string | undefined): boolean {
  if (!connectedAt) return false
  const connected = new Date(connectedAt)
  const now       = new Date()
  const expiry    = new Date(connected)
  expiry.setUTCHours(1, 0, 0, 0)
  if (expiry <= connected) expiry.setUTCDate(expiry.getUTCDate() + 1)
  return now < expiry
}

// ── Kite API response types ───────────────────────────────────────────────────

/** From GET /portfolio/holdings — equity stocks + exchange-traded ETFs */
export interface KiteEquityHolding {
  tradingsymbol:         string
  exchange:              string
  isin:                  string
  product:               string
  quantity:              number
  t1_quantity:           number
  average_price:         number
  last_price:            number
  close_price:           number
  pnl:                   number
  day_change:            number
  day_change_percentage: number
}

/** From GET /mf/holdings — Coin mutual funds (delivered to DEMAT) */
export interface KiteMFHolding {
  folio:           string | null
  fund:            string   // full fund name, e.g. "Mirae Asset Large Cap Fund - Direct Plan"
  tradingsymbol:   string   // ISIN — INF prefix
  quantity:        number
  average_price:   number
  last_price:      number
  last_price_date: string
  pledged_quantity:number
  pnl:             number
}

/** From GET /mf/sips — active and paused SIPs */
export interface KiteSIP {
  sip_id:               string
  fund:                 string   // full fund name
  tradingsymbol:        string   // ISIN
  status:               'ACTIVE' | 'PAUSED' | 'CANCELLED'
  frequency:            string   // monthly | weekly | quarterly
  instalment_amount:    number
  next_instalment:      string   // YYYY-MM-DD
  last_instalment:      string
  completed_instalments:number
  pending_instalments:  number
  instalment_day:       number
  step_up:              Record<string, number>
  dividend_type:        string
  transaction_type:     string
}

export interface KiteSyncResult {
  equity: KiteEquityHolding[]
  mf:     KiteMFHolding[]
  sips:   KiteSIP[]
}

/**
 * Single call to the Worker's /api/sync endpoint.
 * Returns equity holdings, MF holdings, and active SIPs in one round-trip.
 * Throws on network/API error or expired token.
 */
export async function fetchKiteSync(token: string): Promise<KiteSyncResult> {
  if (!WORKER_URL) throw new Error('Kite Worker URL not configured')

  const resp = await fetch(`${WORKER_URL}/api/sync`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ token }),
  })

  if (resp.status === 403) throw new Error('Kite session expired — please reconnect')

  if (!resp.ok) throw new Error(`Sync failed: ${resp.status}`)

  const data = await resp.json() as KiteSyncResult & { error?: string }
  if (data.error === 'token_expired') throw new Error('Kite session expired — please reconnect')

  return { equity: data.equity ?? [], mf: data.mf ?? [], sips: data.sips ?? [] }
}
