/**
 * Zerodha Kite Connect integration for DhanPath.
 *
 * Environment variables (set at build time via Vite):
 *   VITE_KITE_API_KEY    — your Kite Connect app's API key (public, safe in frontend)
 *   VITE_KITE_WORKER_URL — your Cloudflare Worker URL  (e.g. https://dhanpath-kite-auth.YOUR.workers.dev)
 */

const API_KEY    = import.meta.env.VITE_KITE_API_KEY    as string | undefined
const WORKER_URL = import.meta.env.VITE_KITE_WORKER_URL as string | undefined

/** True only when both env vars are present (feature is configured). */
export function isKiteConfigured(): boolean {
  return !!(API_KEY && WORKER_URL)
}

/** Zerodha OAuth login URL — redirect the browser here to start the flow. */
export function kiteOAuthUrl(): string {
  return `https://kite.zerodha.com/connect/login?api_key=${API_KEY}&v=3`
}

/**
 * Kite access tokens expire every day at 06:30 IST (01:00 UTC).
 * Returns true if the token obtained at `connectedAt` is still valid right now.
 */
export function isKiteTokenValid(connectedAt: string | undefined): boolean {
  if (!connectedAt) return false
  const connected = new Date(connectedAt)
  const now       = new Date()

  // Find the next 01:00 UTC expiry after the connection time.
  const expiry = new Date(connected)
  expiry.setUTCHours(1, 0, 0, 0)
  if (expiry <= connected) expiry.setUTCDate(expiry.getUTCDate() + 1)

  return now < expiry
}

// ── Kite API types ────────────────────────────────────────────────────────────

export interface KiteHolding {
  tradingsymbol:   string
  exchange:        string
  isin:            string
  product:         string
  quantity:        number
  t1_quantity:     number
  average_price:   number
  last_price:      number
  close_price:     number
  pnl:             number
  day_change:      number
  day_change_percentage: number
}

/**
 * Fetch live holdings from Zerodha via the Cloudflare Worker proxy.
 * Throws on network/API error.
 */
export async function fetchKiteHoldings(token: string): Promise<KiteHolding[]> {
  if (!WORKER_URL) throw new Error('Kite Worker URL not configured')

  const resp = await fetch(`${WORKER_URL}/api/holdings`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ token }),
  })

  const data = await resp.json() as { status: string; data?: KiteHolding[]; message?: string }
  if (!resp.ok || data.status !== 'success') {
    throw new Error(data.message || `Kite API error ${resp.status}`)
  }
  return data.data ?? []
}
