// ── Browser detection helpers ──────────────────────────────────────────────

interface BrowserInfo {
  name: string
  version: number
  isMobile: boolean
  os: string
}

function detectBrowser(): BrowserInfo {
  const ua = navigator.userAgent
  let name = 'Unknown'
  let version = 0
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua)

  // Order matters — check more specific strings first
  if (/Edg\//i.test(ua)) {
    name = 'Edge'
    version = parseFloat(ua.match(/Edg\/(\d+)/)?.[1] ?? '0')
  } else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) {
    name = 'Opera'
    version = parseFloat(ua.match(/(?:OPR|Opera)\/(\d+)/)?.[1] ?? '0')
  } else if (/Chrome\/(\d+)/i.test(ua) && !/Edg/i.test(ua)) {
    name = 'Chrome'
    version = parseFloat(ua.match(/Chrome\/(\d+)/)?.[1] ?? '0')
  } else if (/Firefox\/(\d+)/i.test(ua)) {
    name = 'Firefox'
    version = parseFloat(ua.match(/Firefox\/(\d+)/)?.[1] ?? '0')
  } else if (/Version\/(\d+).*Safari/i.test(ua)) {
    name = 'Safari'
    version = parseFloat(ua.match(/Version\/(\d+)/)?.[1] ?? '0')
  } else if (/MSIE|Trident/i.test(ua)) {
    name = 'Internet Explorer'
    version = 0
  }

  let os = 'Unknown'
  if (/Windows/i.test(ua)) os = 'Windows'
  else if (/Mac/i.test(ua)) os = 'macOS'
  else if (/Linux/i.test(ua)) os = 'Linux'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS'
  else if (/CrOS/i.test(ua)) os = 'ChromeOS'

  return { name, version, isMobile, os }
}

// ── WebGPU minimum version requirements ───────────────────────────────────

const MIN_VERSIONS: Record<string, number> = {
  Chrome: 113,
  Edge: 113,
  Opera: 99,
  Firefox: 141,
  Safari: 18,
}

// ── Diagnostic check results ──────────────────────────────────────────────

export interface DiagnosticCheck {
  label: string
  passed: boolean
  detail: string
}

export interface WebGPUDiagnostics {
  supported: boolean
  browser: BrowserInfo
  checks: DiagnosticCheck[]
  recommendation: string
  reason?: string
}

// ── Navigator type for WebGPU access ──────────────────────────────────────

interface NavigatorWithGPU {
  gpu?: {
    requestAdapter(options?: Record<string, unknown>): Promise<unknown>
  }
}

// ── Main comprehensive check ──────────────────────────────────────────────

export async function checkWebGPUSupport(): Promise<WebGPUDiagnostics> {
  const browser = detectBrowser()
  const checks: DiagnosticCheck[] = []
  let supported = true

  // 1. Secure context check (WebGPU requires HTTPS or localhost)
  const isSecure = window.isSecureContext
  checks.push({
    label: 'Secure Context (HTTPS)',
    passed: isSecure,
    detail: isSecure
      ? 'Page is served over HTTPS or localhost'
      : 'WebGPU requires HTTPS. Serve the page over HTTPS or use localhost.',
  })
  if (!isSecure) supported = false

  // 2. Browser identification
  const minVersion = MIN_VERSIONS[browser.name] ?? 0
  const browserSupported = minVersion > 0 && browser.version >= minVersion
  checks.push({
    label: 'Browser Compatibility',
    passed: browserSupported,
    detail: browserSupported
      ? `${browser.name} ${browser.version} meets the minimum requirement (${minVersion}+)`
      : minVersion > 0
        ? `${browser.name} ${browser.version} is below the required version ${minVersion}+`
        : `${browser.name} has limited or no WebGPU support`,
  })
  if (!browserSupported) supported = false

  // 3. Mobile device check (warning, not blocking)
  checks.push({
    label: 'Desktop Environment',
    passed: !browser.isMobile,
    detail: browser.isMobile
      ? 'Mobile devices have limited WebGPU and VRAM — LLM models may not load'
      : `Desktop ${browser.os} detected`,
  })

  // 4. navigator.gpu API presence
  const hasGpuApi = 'gpu' in navigator
  checks.push({
    label: 'WebGPU API Available',
    passed: hasGpuApi,
    detail: hasGpuApi
      ? 'navigator.gpu is present in this browser'
      : 'navigator.gpu not found — browser does not expose the WebGPU API',
  })
  if (!hasGpuApi) {
    supported = false
    return {
      supported,
      browser,
      checks,
      recommendation: buildRecommendation(browser),
      reason: 'WebGPU API is not available in this browser.',
    }
  }

  // 5. GPU adapter request
  let adapter: unknown = null
  try {
    const gpu = (navigator as NavigatorWithGPU).gpu
    if (!gpu) {
      checks.push({
        label: 'GPU Object Access',
        passed: false,
        detail: 'navigator.gpu exists but returned a falsy value',
      })
      supported = false
      return {
        supported,
        browser,
        checks,
        recommendation: buildRecommendation(browser),
        reason: 'WebGPU API is present but not accessible.',
      }
    }

    adapter = await gpu.requestAdapter({})

    checks.push({
      label: 'GPU Adapter',
      passed: !!adapter,
      detail: adapter
        ? 'Successfully obtained a GPU adapter from the system'
        : 'No GPU adapter returned — hardware acceleration may be disabled',
    })
    if (!adapter) supported = false
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    checks.push({
      label: 'GPU Adapter',
      passed: false,
      detail: `Adapter request threw an error: ${msg}`,
    })
    supported = false
  }

  if (!adapter) {
    return {
      supported,
      browser,
      checks,
      recommendation: buildRecommendation(browser),
      reason: 'No GPU adapter found. Hardware acceleration may be disabled.',
    }
  }

  // 6. Device request (validates the adapter can actually create a device)
  try {
    const adapterObj = adapter as { requestDevice?: () => Promise<unknown> }
    if (typeof adapterObj.requestDevice === 'function') {
      const device = await adapterObj.requestDevice()
      const hasDevice = !!device
      checks.push({
        label: 'GPU Device',
        passed: hasDevice,
        detail: hasDevice
          ? 'Successfully created a GPU device — WebGPU is fully operational'
          : 'GPU device creation returned null',
      })
      if (!hasDevice) supported = false

      // Clean up device if possible
      const deviceObj = device as { destroy?: () => void } | null
      if (deviceObj && typeof deviceObj.destroy === 'function') {
        deviceObj.destroy()
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    checks.push({
      label: 'GPU Device',
      passed: false,
      detail: `Device creation failed: ${msg}`,
    })
    supported = false
  }

  // 7. SharedArrayBuffer check (needed by some WASM/WebGPU workloads)
  const hasSAB = typeof SharedArrayBuffer !== 'undefined'
  checks.push({
    label: 'SharedArrayBuffer',
    passed: hasSAB,
    detail: hasSAB
      ? 'SharedArrayBuffer is available (needed for threaded workloads)'
      : 'SharedArrayBuffer is unavailable — some features may be limited',
  })

  // 8. Web Worker support
  const hasWorkers = typeof Worker !== 'undefined'
  checks.push({
    label: 'Web Workers',
    passed: hasWorkers,
    detail: hasWorkers
      ? 'Web Workers available for off-thread LLM inference'
      : 'Web Workers unavailable — LLM inference cannot run in background',
  })
  if (!hasWorkers) supported = false

  return {
    supported,
    browser,
    checks,
    recommendation: supported ? '' : buildRecommendation(browser),
    reason: supported ? undefined : 'One or more required browser capabilities are missing.',
  }
}

// ── Browser-specific recommendations ──────────────────────────────────────

function buildRecommendation(browser: BrowserInfo): string {
  const minVersion = MIN_VERSIONS[browser.name]

  switch (browser.name) {
    case 'Chrome':
      if (browser.version < 113) {
        return 'Update Chrome to version 113 or later. Go to chrome://settings/help to check for updates.'
      }
      return 'Enable hardware acceleration: chrome://settings → System → "Use graphics acceleration when available". Then restart Chrome.'

    case 'Edge':
      if (browser.version < 113) {
        return 'Update Edge to version 113 or later. Go to edge://settings/help to check for updates.'
      }
      return 'Enable hardware acceleration: edge://settings → System → "Use hardware acceleration when available". Then restart Edge.'

    case 'Firefox':
      if (browser.version < 141) {
        return 'WebGPU in Firefox requires version 141+. Update Firefox or switch to Chrome 113+ or Edge 113+ for full WebGPU support.'
      }
      return 'Enable WebGPU in Firefox: navigate to about:config and set dom.webgpu.enabled to true. Restart Firefox.'

    case 'Safari':
      if (browser.version < 18) {
        return 'WebGPU requires Safari 18+. Update macOS/iOS or switch to Chrome 113+ for full support.'
      }
      return 'If WebGPU is not working in Safari, go to Develop → Experimental Features and enable WebGPU.'

    case 'Opera':
      if (minVersion && browser.version < minVersion) {
        return `Update Opera to version ${minVersion}+, or switch to Chrome 113+ or Edge 113+.`
      }
      return 'Enable hardware acceleration in Opera settings, or switch to Chrome 113+ for best WebGPU support.'

    case 'Internet Explorer':
      return 'Internet Explorer does not support WebGPU. Please switch to Chrome 113+, Edge 113+, or Firefox 141+.'

    default:
      if (browser.isMobile) {
        return 'Mobile WebGPU support is limited. For the best experience, use a desktop browser: Chrome 113+, Edge 113+, or Firefox 141+.'
      }
      return 'For WebGPU support, use Chrome 113+, Edge 113+, or Firefox 141+.'
  }
}
