const POLICY_PROXY_ROUTE = 'api/policy-proxy'
const FETCH_TIMEOUT_MS = 20_000

function buildPolicyProxyUrl(target: string): string {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
  const proxyUrl = new URL(POLICY_PROXY_ROUTE, baseUrl)
  proxyUrl.searchParams.set('url', target)
  return proxyUrl.toString()
}

async function readProxyError(resp: Response): Promise<string> {
  try {
    const payload = (await resp.json()) as { error?: string }
    if (payload.error) return payload.error
  } catch {
    // Ignore JSON parse errors and fall back to generic status text.
  }

  return `Proxy request failed (${resp.status}).`
}

export async function fetchPolicyFromUrl(url: string): Promise<string> {
  // Normalize and validate URL
  let normalizedUrl = url.trim()
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl
  }

  try {
    new URL(normalizedUrl)
  } catch {
    throw new Error('Invalid URL. Please enter a valid web address.')
  }

  if (normalizedUrl.length > 2048) {
    throw new Error('URL is too long. Please use a shorter URL.')
  }

  let html = ''
  try {
    const proxyUrl = buildPolicyProxyUrl(normalizedUrl)
    const resp = await fetch(proxyUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (!resp.ok) {
      throw new Error(await readProxyError(resp))
    }

    html = await resp.text()
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error'
    throw new Error(
      `Could not fetch the URL via the local proxy: ${reason}. Try running the app with Vite dev/preview or paste policy text directly.`,
    )
  }

  if (html.trim().length < 100) {
    throw new Error(
      'Fetched content is too short to analyze. Try pasting the policy text directly.',
    )
  }

  return extractPolicyText(html)
}

function extractPolicyText(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Remove noise elements
  const removeSelectors = [
    'script', 'style', 'noscript', 'iframe', 'svg', 'img', 'video', 'audio',
    'nav', 'header', 'footer', 'aside',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '.cookie-banner', '.cookie-consent', '#cookie-banner',
    '.sidebar', '.nav', '.menu', '.footer', '.header',
    '.ad', '.ads', '.advertisement',
    '.social-share', '.share-buttons',
    'button', 'input', 'select', 'form',
  ]

  for (const sel of removeSelectors) {
    doc.querySelectorAll(sel).forEach((el) => el.remove())
  }

  // Try to find the main content area
  const contentSelectors = [
    'article', 'main', '[role="main"]',
    '.privacy-policy', '.policy-content', '.legal-content', '.legal',
    '.terms-content', '.tos-content',
    '.terms-of-service', '.terms-of-use', '.tos', '.terms',
    '#privacy-policy', '#privacy', '#policy', '#terms', '#tos',
    '.entry-content', '.post-content', '.page-content',
    '.content', '#content', '#main-content',
  ]

  let contentEl: Element | null = null
  for (const sel of contentSelectors) {
    contentEl = doc.querySelector(sel)
    if (contentEl && contentEl.textContent && contentEl.textContent.trim().length > 200) {
      break
    }
    contentEl = null
  }

  const root = contentEl ?? doc.body
  if (!root) {
    throw new Error('Could not extract text from the page.')
  }

  // Extract text preserving some structure
  const text = extractTextFromElement(root)
  const cleaned = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()

  if (cleaned.length < 200) {
    throw new Error(
      'Extracted text is too short. The page may require JavaScript to render. Try pasting the policy text directly.',
    )
  }

  return cleaned
}

function extractTextFromElement(el: Element): string {
  const blocks: string[] = []
  const blockTags = new Set([
    'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'LI', 'TR', 'BLOCKQUOTE', 'SECTION', 'ARTICLE',
  ])

  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim()
      if (t) blocks.push(t)
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element
      const tag = child.tagName

      if (tag === 'BR') {
        blocks.push('\n')
      } else if (blockTags.has(tag)) {
        const inner = extractTextFromElement(child)
        if (inner.trim()) {
          blocks.push('\n' + inner + '\n')
        }
      } else {
        const inner = extractTextFromElement(child)
        if (inner.trim()) blocks.push(inner)
      }
    }
  }

  return blocks.join(' ').replace(/ +/g, ' ')
}
