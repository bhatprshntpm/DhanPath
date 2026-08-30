/**
 * DhanPath Kite Auth Worker
 *
 * GET  /callback          — OAuth: exchanges request_token → access_token,
 *                           redirects to DhanPath with token in URL fragment.
 * POST /api/sync          — Parallel-fetches equity holdings + MF holdings + SIPs
 *                           in one round-trip; returns combined JSON.
 *                           (Browser can't call api.kite.trade directly — CORS blocked.)
 */

interface Env {
  KITE_API_KEY: string
  KITE_API_SECRET: string
}

const DHANPATH_ORIGIN = 'https://bhatprshntpm.github.io'
const DHANPATH_URL    = 'https://bhatprshntpm.github.io/DhanPath/'
const KITE_API        = 'https://api.kite.trade'

const CORS = {
  'Access-Control-Allow-Origin':  DHANPATH_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function kiteHeaders(apiKey: string, token: string) {
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

      if (status !== 'success' || !requestToken)
        return Response.redirect(`${DHANPATH_URL}?kite_error=cancelled`, 302)

      const checksum = await sha256(env.KITE_API_KEY + requestToken + env.KITE_API_SECRET)

      const resp = await fetch(`${KITE_API}/session/token`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Kite-Version': '3' },
        body:    new URLSearchParams({ api_key: env.KITE_API_KEY, request_token: requestToken, checksum }),
      })

      if (!resp.ok) {
        console.error('Kite token exchange failed', resp.status, await resp.text())
        return Response.redirect(`${DHANPATH_URL}?kite_error=auth_failed`, 302)
      }

      const data: any = await resp.json()
      const token = data?.data?.access_token as string | undefined
      if (!token) return Response.redirect(`${DHANPATH_URL}?kite_error=no_token`, 302)

      return Response.redirect(`${DHANPATH_URL}#kite_token=${token}`, 302)
    }

    // ── Combined sync proxy (equity + MF holdings + SIPs in one call) ──────
    if (url.pathname === '/api/sync' && request.method === 'POST') {
      let token: string | undefined
      try { token = ((await request.json()) as any)?.token } catch {
        return new Response('Invalid JSON', { status: 400, headers: CORS })
      }
      if (!token) return new Response('Missing token', { status: 400, headers: CORS })

      const hdrs = kiteHeaders(env.KITE_API_KEY, token)

      // All three calls in parallel — fail fast if any 4xx (expired token etc.)
      const [equityResp, mfResp, sipResp] = await Promise.all([
        fetch(`${KITE_API}/portfolio/holdings`, { headers: hdrs }),
        fetch(`${KITE_API}/mf/holdings`,        { headers: hdrs }),
        fetch(`${KITE_API}/mf/sips`,            { headers: hdrs }),
      ])

      // Surface auth errors immediately
      if (equityResp.status === 403 || mfResp.status === 403)
        return new Response(JSON.stringify({ error: 'token_expired' }), { status: 403, headers: { ...CORS, 'Content-Type': 'application/json' } })

      const [equityData, mfData, sipData] = await Promise.all([
        equityResp.json() as Promise<any>,
        mfResp.json()     as Promise<any>,
        sipResp.json()    as Promise<any>,
      ])

      const payload = {
        equity: equityData?.data  ?? [],   // equity + exchange-traded ETFs
        mf:     mfData?.data      ?? [],   // Coin mutual funds
        sips:   sipData?.data     ?? [],   // active/paused SIPs
      }

      return new Response(JSON.stringify(payload), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Legacy endpoint kept for backwards compat — redirects to /api/sync
    if (url.pathname === '/api/holdings' && request.method === 'POST') {
      let token: string | undefined
      try { token = ((await request.json()) as any)?.token } catch {
        return new Response('Invalid JSON', { status: 400, headers: CORS })
      }
      if (!token) return new Response('Missing token', { status: 400, headers: CORS })
      const r = await fetch(`${KITE_API}/portfolio/holdings`, { headers: kiteHeaders(env.KITE_API_KEY, token) })
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
