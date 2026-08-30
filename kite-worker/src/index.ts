/**
 * DhanPath Kite Auth Worker — multi-user support
 *
 * Single Worker handles multiple Zerodha accounts via KITE_SECRETS env var.
 *
 * Setup for each additional user:
 *   1. Create a new Kite Connect app at developers.kite.trade with the user's
 *      Zerodha Client ID and redirect URL:
 *        https://<this-worker-url>/callback?key=<THEIR_API_KEY>
 *   2. Add their key:secret to KITE_SECRETS:
 *        wrangler secret put KITE_SECRETS
 *        → enter: EXISTING_KEY:EXISTING_SECRET,NEW_KEY:NEW_SECRET
 *
 * Backward-compatible: existing KITE_API_KEY + KITE_API_SECRET work for the
 * primary user whose callback URL has no ?key= param.
 */

interface Env {
  KITE_API_KEY:    string
  KITE_API_SECRET: string
  KITE_SECRETS?:   string   // CSV: "KEY1:SECRET1,KEY2:SECRET2"
}

const DHANPATH_ORIGIN = 'https://bhatprshntpm.github.io'
const DHANPATH_URL    = 'https://bhatprshntpm.github.io/DhanPath/'
const KITE_API        = 'https://api.kite.trade'

const CORS = {
  'Access-Control-Allow-Origin':  DHANPATH_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function parseSecrets(csv: string): Record<string, string> {
  if (!csv?.trim()) return {}
  return Object.fromEntries(
    csv.split(',')
       .map(p => p.trim().split(':'))
       .filter(p => p.length === 2)
       .map(([k, s]) => [k.trim(), s.trim()])
  )
}

/** Resolve api_key + api_secret from the ?key= query param or fall back to primary. */
function resolveCredentials(keyParam: string | null, env: Env): { apiKey: string; apiSecret: string } | null {
  if (keyParam) {
    // Multi-user: look up in KITE_SECRETS map
    const map = parseSecrets(env.KITE_SECRETS ?? '')
    if (map[keyParam]) return { apiKey: keyParam, apiSecret: map[keyParam] }
    // Also allow primary key via ?key= for consistency
    if (keyParam === env.KITE_API_KEY) return { apiKey: env.KITE_API_KEY, apiSecret: env.KITE_API_SECRET }
    return null // unknown key
  }
  // No ?key= → use primary credentials (legacy / main user)
  return { apiKey: env.KITE_API_KEY, apiSecret: env.KITE_API_SECRET }
}

function kiteAuthHeader(apiKey: string, token: string) {
  return { 'X-Kite-Version': '3', 'Authorization': `token ${apiKey}:${token}` }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

    const url = new URL(request.url)

    // ── OAuth callback ──────────────────────────────────────────────────────
    if (url.pathname === '/callback') {
      const requestToken = url.searchParams.get('request_token')
      const status       = url.searchParams.get('status')
      const keyParam     = url.searchParams.get('key')   // from registered redirect URL

      if (status !== 'success' || !requestToken)
        return Response.redirect(`${DHANPATH_URL}?kite_error=cancelled`, 302)

      const creds = resolveCredentials(keyParam, env)
      if (!creds)
        return Response.redirect(`${DHANPATH_URL}?kite_error=unknown_key`, 302)

      const checksum = await sha256(creds.apiKey + requestToken + creds.apiSecret)

      const resp = await fetch(`${KITE_API}/session/token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Kite-Version': '3' },
        body:    new URLSearchParams({ api_key: creds.apiKey, request_token: requestToken, checksum }),
      })

      if (!resp.ok) {
        console.error('token exchange failed', resp.status, await resp.text())
        return Response.redirect(`${DHANPATH_URL}?kite_error=auth_failed`, 302)
      }

      const data: any = await resp.json()
      const token = data?.data?.access_token as string | undefined
      if (!token) return Response.redirect(`${DHANPATH_URL}?kite_error=no_token`, 302)

      // Pass back both token AND api_key so DhanPath knows which key to use for sync
      return Response.redirect(
        `${DHANPATH_URL}#kite_token=${token}&kite_api_key=${encodeURIComponent(creds.apiKey)}`,
        302
      )
    }

    // ── Combined sync ───────────────────────────────────────────────────────
    if (url.pathname === '/api/sync' && request.method === 'POST') {
      let token: string | undefined
      let apiKeyFromBody: string | undefined
      try {
        const body: any = await request.json()
        token = body?.token
        apiKeyFromBody = body?.apiKey
      } catch {
        return new Response('Invalid JSON', { status: 400, headers: CORS })
      }
      if (!token) return new Response('Missing token', { status: 400, headers: CORS })

      const creds = resolveCredentials(apiKeyFromBody ?? null, env)
      if (!creds) return new Response(JSON.stringify({ error: 'unknown_key' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })

      const hdrs = kiteAuthHeader(creds.apiKey, token)
      const [equityResp, mfResp, sipResp] = await Promise.all([
        fetch(`${KITE_API}/portfolio/holdings`, { headers: hdrs }),
        fetch(`${KITE_API}/mf/holdings`,        { headers: hdrs }),
        fetch(`${KITE_API}/mf/sips`,            { headers: hdrs }),
      ])

      if (equityResp.status === 403 || mfResp.status === 403)
        return new Response(JSON.stringify({ error: 'token_expired' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })

      const [equityData, mfData, sipData] = await Promise.all([
        equityResp.json() as Promise<any>,
        mfResp.json()     as Promise<any>,
        sipResp.json()    as Promise<any>,
      ])

      return new Response(
        JSON.stringify({ equity: equityData?.data ?? [], mf: mfData?.data ?? [], sips: sipData?.data ?? [] }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      )
    }

    // Legacy /api/holdings
    if (url.pathname === '/api/holdings' && request.method === 'POST') {
      let token: string | undefined, apiKeyFromBody: string | undefined
      try { const b: any = await request.json(); token = b?.token; apiKeyFromBody = b?.apiKey } catch {
        return new Response('Invalid JSON', { status: 400, headers: CORS })
      }
      if (!token) return new Response('Missing token', { status: 400, headers: CORS })
      const creds = resolveCredentials(apiKeyFromBody ?? null, env)
      if (!creds) return new Response('Unknown key', { status: 403, headers: CORS })
      const r = await fetch(`${KITE_API}/portfolio/holdings`, { headers: kiteAuthHeader(creds.apiKey, token) })
      return new Response(await r.text(), { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    return new Response('Not found', { status: 404 })
  },
}

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}
