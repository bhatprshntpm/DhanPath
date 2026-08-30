/**
 * DhanPath Kite Auth Worker
 * Handles two things:
 *   GET  /callback  — Zerodha OAuth callback: exchanges request_token → access_token,
 *                     redirects back to DhanPath with the token in the URL fragment.
 *   POST /api/holdings — Proxies Kite API so DhanPath avoids browser CORS restrictions.
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Preflight
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })

    const url = new URL(request.url)

    // ── OAuth callback ──────────────────────────────────────────────────────
    if (url.pathname === '/callback') {
      const requestToken = url.searchParams.get('request_token')
      const status       = url.searchParams.get('status')

      if (status !== 'success' || !requestToken) {
        return Response.redirect(`${DHANPATH_URL}?kite_error=cancelled`, 302)
      }

      // checksum = SHA-256( api_key + request_token + api_secret )
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

      // URL fragment (#) is never sent to any server — safer than query param
      return Response.redirect(`${DHANPATH_URL}#kite_token=${token}`, 302)
    }

    // ── Holdings proxy ──────────────────────────────────────────────────────
    if (url.pathname === '/api/holdings' && request.method === 'POST') {
      let token: string | undefined
      try {
        const body: any = await request.json()
        token = body?.token
      } catch {
        return new Response('Invalid JSON', { status: 400, headers: CORS })
      }

      if (!token) return new Response('Missing token', { status: 400, headers: CORS })

      const kiteResp = await fetch(`${KITE_API}/portfolio/holdings`, {
        headers: {
          'X-Kite-Version': '3',
          'Authorization':  `token ${env.KITE_API_KEY}:${token}`,
        },
      })

      const body = await kiteResp.text()
      return new Response(body, {
        status:  kiteResp.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    return new Response('Not found', { status: 404 })
  },
}

async function sha256(message: string): Promise<string> {
  const data = new TextEncoder().encode(message)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('')
}
