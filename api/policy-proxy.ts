import type { VercelRequest, VercelResponse } from '@vercel/node'

const PROXY_TIMEOUT_MS = 20_000
const MAX_URL_LENGTH = 2048
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

// ── Private IP blocking ───────────────────────────────────────────────────

function isPrivateIPv4(hostname: string): boolean {
  const octets = hostname.split('.').map((x) => Number(x))
  if (octets.length !== 4 || octets.some((x) => Number.isNaN(x))) return false
  const [a, b] = octets
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

function isPrivateIPv6(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return (
    lower === '::1' ||
    lower === '::' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80')
  )
}

function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true
  // Simple IP check
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) return isPrivateIPv4(lower)
  if (lower.includes(':')) return isPrivateIPv6(lower)
  return false
}

// ── Fetch helpers ─────────────────────────────────────────────────────────

function buildBrowserLikeHeaders(
  targetUrl: URL,
  forceDefaultUA: boolean,
  incomingUA?: string,
  incomingLang?: string,
): Record<string, string> {
  return {
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,' +
      'image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': incomingLang ?? 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Referer: `${targetUrl.protocol}//${targetUrl.host}/`,
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': forceDefaultUA ? BROWSER_UA : incomingUA ?? BROWSER_UA,
  }
}

function buildTargetVariants(targetUrl: URL): URL[] {
  const variants: URL[] = [new URL(targetUrl.toString())]

  if (!targetUrl.hostname.startsWith('www.')) {
    const withWww = new URL(targetUrl.toString())
    withWww.hostname = `www.${targetUrl.hostname}`
    variants.push(withWww)
  }

  if (targetUrl.pathname.endsWith('/')) {
    const withoutSlash = new URL(targetUrl.toString())
    withoutSlash.pathname = withoutSlash.pathname.replace(/\/+$/, '') || '/'
    variants.push(withoutSlash)
  } else {
    const withSlash = new URL(targetUrl.toString())
    withSlash.pathname = `${withSlash.pathname}/`
    variants.push(withSlash)
  }

  const deduped = new Map<string, URL>()
  for (const v of variants) deduped.set(v.toString(), v)
  return [...deduped.values()]
}

async function tryFetchHtml(
  targetUrl: URL,
  incomingUA?: string,
  incomingLang?: string,
): Promise<{ html: string; fetchedFrom: string }> {
  const variants = buildTargetVariants(targetUrl)
  const retryStatuses = new Set([401, 403, 429, 503])

  let lastStatus: number | null = null
  let lastMessage = 'Failed to fetch target URL.'

  for (const candidate of variants) {
    for (const forceDefaultUA of [false, true]) {
      try {
        const upstream = await fetch(candidate.toString(), {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
          headers: buildBrowserLikeHeaders(
            candidate,
            forceDefaultUA,
            incomingUA,
            incomingLang,
          ),
        })

        if (upstream.ok) {
          const html = await upstream.text()
          return { html, fetchedFrom: candidate.toString() }
        }

        lastStatus = upstream.status
        lastMessage = `Upstream request failed with status ${upstream.status}.`

        if (!retryStatuses.has(upstream.status)) {
          throw new Error(lastMessage)
        }
      } catch (error: unknown) {
        lastMessage =
          error instanceof Error ? error.message : 'Failed to fetch target URL.'
      }
    }
  }

  if (lastStatus) {
    throw new Error(
      `${lastMessage} The site may be blocking automated traffic.`,
    )
  }

  throw new Error(lastMessage)
}

// ── Vercel serverless handler ─────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // CORS headers for the frontend
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Only GET is supported.' })
    return
  }

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')

  const targetParam =
    typeof req.query.url === 'string' ? req.query.url : req.query.url?.[0]

  if (!targetParam) {
    res.status(400).json({ error: 'Missing "url" query parameter.' })
    return
  }

  if (targetParam.length > MAX_URL_LENGTH) {
    res
      .status(400)
      .json({ error: 'URL exceeds maximum length (2048 characters).' })
    return
  }

  let targetUrl: URL
  try {
    targetUrl = new URL(targetParam)
  } catch {
    res.status(400).json({ error: 'Invalid URL.' })
    return
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    res.status(400).json({ error: 'Only HTTP(S) targets are allowed.' })
    return
  }

  if (isBlockedHost(targetUrl.hostname)) {
    res.status(403).json({ error: 'Target host is not allowed.' })
    return
  }

  try {
    const incomingUA = Array.isArray(req.headers['user-agent'])
      ? req.headers['user-agent'][0]
      : req.headers['user-agent']
    const incomingLang = Array.isArray(req.headers['accept-language'])
      ? req.headers['accept-language'][0]
      : req.headers['accept-language']

    const { html, fetchedFrom } = await tryFetchHtml(
      targetUrl,
      incomingUA,
      incomingLang,
    )

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
    res.setHeader('X-Policy-Source', fetchedFrom)
    res.status(200).send(html)
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch target URL.'
    res.status(502).json({ error: message })
  }
}
