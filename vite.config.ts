import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import { isIP } from 'node:net'
import type { IncomingMessage, ServerResponse } from 'node:http'

const POLICY_PROXY_ROUTE = 'api/policy-proxy'
const PROXY_TIMEOUT_MS = 20_000
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

type ProxyRequest = IncomingMessage & { url?: string }
type Next = (err?: unknown) => void
type MiddlewareContainer = {
  use: (
    path: string,
    handler: (req: ProxyRequest, res: ServerResponse, next: Next) => void,
  ) => void
}

function normalizeBase(base: string): string {
  if (!base.startsWith('/')) return `/${base}`
  return base
}

function buildProxyRoutes(base: string): string[] {
  const normalizedBase = normalizeBase(base).replace(/\/+$/, '')
  const basedRoute = `${normalizedBase}/${POLICY_PROXY_ROUTE}`.replace(
    /\/{2,}/g,
    '/',
  )
  const defaultRoute = `/${POLICY_PROXY_ROUTE}`
  if (basedRoute === defaultRoute) return [defaultRoute]
  return [basedRoute, defaultRoute]
}

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

  const ipVersion = isIP(lower)
  if (ipVersion === 4) return isPrivateIPv4(lower)
  if (ipVersion === 6) return isPrivateIPv6(lower)
  return false
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, string>,
): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function readHeaderValue(
  header: string | string[] | undefined,
): string | undefined {
  if (typeof header === 'string' && header.trim()) return header
  if (Array.isArray(header)) {
    const first = header.find((x) => x.trim())
    if (first) return first
  }
  return undefined
}

function buildBrowserLikeHeaders(
  req: ProxyRequest,
  targetUrl: URL,
  forceDefaultUA = false,
): Record<string, string> {
  const requestedUA = readHeaderValue(req.headers['user-agent'])
  const requestedLanguage = readHeaderValue(req.headers['accept-language'])

  return {
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,' +
      'image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': requestedLanguage ?? 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Referer: `${targetUrl.protocol}//${targetUrl.host}/`,
    'Upgrade-Insecure-Requests': '1',
    'User-Agent': forceDefaultUA ? BROWSER_UA : requestedUA ?? BROWSER_UA,
  }
}

function buildTargetVariants(targetUrl: URL): URL[] {
  const variants: URL[] = [new URL(targetUrl.toString())]

  // Some providers block one host variant but allow the other.
  if (!targetUrl.hostname.startsWith('www.')) {
    const withWww = new URL(targetUrl.toString())
    withWww.hostname = `www.${targetUrl.hostname}`
    variants.push(withWww)
  }

  if (targetUrl.pathname.endsWith('/')) {
    const withoutTrailingSlash = new URL(targetUrl.toString())
    withoutTrailingSlash.pathname = withoutTrailingSlash.pathname.replace(
      /\/+$/,
      '',
    )
    if (withoutTrailingSlash.pathname.length === 0) {
      withoutTrailingSlash.pathname = '/'
    }
    variants.push(withoutTrailingSlash)
  } else {
    const withTrailingSlash = new URL(targetUrl.toString())
    withTrailingSlash.pathname = `${withTrailingSlash.pathname}/`
    variants.push(withTrailingSlash)
  }

  // Deduplicate by URL string to avoid repeated attempts.
  const deduped = new Map<string, URL>()
  for (const variant of variants) {
    deduped.set(variant.toString(), variant)
  }
  return [...deduped.values()]
}

async function tryFetchHtml(
  req: ProxyRequest,
  targetUrl: URL,
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
          headers: buildBrowserLikeHeaders(req, candidate, forceDefaultUA),
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
      `${lastMessage} The site may be blocking automated traffic from the local proxy.`,
    )
  }

  throw new Error(lastMessage)
}

async function handlePolicyProxy(
  req: ProxyRequest,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Only GET is supported.' })
    return
  }

  const incomingUrl = new URL(req.url ?? '/', 'http://localhost')
  const targetParam = incomingUrl.searchParams.get('url')
  if (!targetParam) {
    sendJson(res, 400, { error: 'Missing "url" query parameter.' })
    return
  }

  if (targetParam.length > 2048) {
    sendJson(res, 400, { error: 'URL exceeds maximum length (2048 characters).' })
    return
  }

  let targetUrl: URL
  try {
    targetUrl = new URL(targetParam)
  } catch {
    sendJson(res, 400, { error: 'Invalid URL.' })
    return
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    sendJson(res, 400, { error: 'Only HTTP(S) targets are allowed.' })
    return
  }

  if (isBlockedHost(targetUrl.hostname)) {
    sendJson(res, 403, { error: 'Target host is not allowed.' })
    return
  }

  // Set security headers on all proxy responses
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')

  try {
    const { html, fetchedFrom } = await tryFetchHtml(req, targetUrl)
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Policy-Source', fetchedFrom)
    res.end(html)
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch target URL.'
    sendJson(res, 502, { error: message })
  }
}

function registerPolicyProxyRoutes(
  middlewares: MiddlewareContainer,
  base: string,
): void {
  for (const route of buildProxyRoutes(base)) {
    middlewares.use(route, (req, res, next) => {
      void handlePolicyProxy(req, res).catch(next)
    })
  }
}

function policyProxyPlugin() {
  return {
    name: 'policy-proxy-plugin',
    configureServer(server: { middlewares: MiddlewareContainer; config: { base: string } }) {
      registerPolicyProxyRoutes(server.middlewares, server.config.base)
    },
    configurePreviewServer(server: { middlewares: MiddlewareContainer; config: { base: string } }) {
      registerPolicyProxyRoutes(server.middlewares, server.config.base)
    },
  }
}

export default defineConfig({
  plugins: [preact(), tailwindcss(), policyProxyPlugin()],
  base: '/',
  build: {
    target: 'esnext',
    sourcemap: false,
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        manualChunks: {
          'web-llm': ['@mlc-ai/web-llm'],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
})
