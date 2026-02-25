import { useState, useEffect } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { checkWebGPUSupport, type WebGPUDiagnostics } from '../utils/webgpu-detect'

interface Props {
  children: ComponentChildren
  onUnsupported?: () => void
}

export function WebGPUCheck({ children, onUnsupported }: Props) {
  const [state, setState] = useState<'checking' | 'supported' | 'unsupported'>(
    'checking',
  )
  const [diagnostics, setDiagnostics] = useState<WebGPUDiagnostics | null>(null)

  useEffect(() => {
    checkWebGPUSupport()
      .then((result) => {
        setDiagnostics(result)
        if (result.supported) {
          setState('supported')
        } else {
          setState('unsupported')
          onUnsupported?.()
        }
      })
      .catch(() => {
        setDiagnostics(null)
        setState('unsupported')
        onUnsupported?.()
      })
  }, [onUnsupported])

  if (state === 'checking') {
    return (
      <div class="flex items-center justify-center min-h-[60vh] animate-fade-in">
        <div class="text-center section-enter">
          <div class="w-8 h-8 mx-auto mb-4 border-2 border-neon border-t-transparent animate-spin-slow" />
          <p class="text-[10px] text-neon-muted font-mono tracking-wider uppercase cursor-blink">
            running_diagnostics
          </p>
          <p class="text-[9px] text-neutral-700 font-mono tracking-wider mt-2 uppercase">
            checking webgpu // gpu adapter // device // workers
          </p>
        </div>
      </div>
    )
  }

  if (state === 'unsupported') {
    return <UnsupportedUI diagnostics={diagnostics} />
  }

  return <>{children}</>
}

// ── Unsupported Browser UI ────────────────────────────────────────────────

function UnsupportedUI({ diagnostics }: { diagnostics: WebGPUDiagnostics | null }) {
  const [expanded, setExpanded] = useState(false)

  // Fallback if diagnostics failed entirely
  if (!diagnostics) {
    return (
      <div class="flex items-center justify-center min-h-[60vh] animate-fade-in">
        <div class="cyber-card lift-on-hover max-w-md text-center p-8 relative">
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="text-grade-f text-4xl mb-4 font-mono">[X]</div>
          <h2 class="text-sm font-bold text-white mb-3 tracking-widest uppercase">
            compatibility_check_failed
          </h2>
          <p class="text-xs text-neutral-500 mb-4 font-mono">
            Unable to determine browser capabilities. Please use Chrome 113+, Edge 113+, or Firefox 141+.
          </p>
        </div>
      </div>
    )
  }

  const { browser, checks, recommendation } = diagnostics
  const passedCount = checks.filter((c) => c.passed).length
  const totalCount = checks.length
  const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0

  return (
    <div class="max-w-2xl mx-auto px-4 sm:px-6 py-16 animate-fade-in">
      {/* Header */}
      <div class="text-center mb-8 section-enter">
        <div class="inline-flex items-center justify-center w-20 h-20 mb-5 relative">
          <svg class="w-20 h-20 text-grade-f" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <line x1="9" y1="9" x2="15" y2="15" stroke-width="1.5" />
            <line x1="15" y1="9" x2="9" y2="15" stroke-width="1.5" />
          </svg>
          <div class="absolute inset-0 animate-pulse-soft" style="background: radial-gradient(circle, rgba(255,34,68,0.15) 0%, transparent 70%)" />
        </div>
        <h2 class="text-lg font-bold text-white mb-2 tracking-widest uppercase section-enter delay-100">
          browser_not_supported
        </h2>
        <p class="text-xs text-neutral-500 font-mono tracking-wider section-enter delay-150">
          PrivacyLens requires WebGPU for on-device AI inference
        </p>
      </div>

      {/* Browser info card */}
      <div class="cyber-card lift-on-hover p-5 mb-4 section-enter delay-200">
        <div class="cyber-corners absolute inset-0 pointer-events-none" />
        <div class="flex items-center gap-3 mb-4">
          <span class="text-neon-muted text-xs">{'>'}</span>
          <span class="text-xs text-neutral-600 tracking-wider uppercase">detected_browser</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="text-center p-3 border border-neon-border">
            <p class="text-[9px] text-neutral-600 tracking-wider uppercase mb-1">browser</p>
            <p class="text-sm text-white font-bold">{browser.name}</p>
          </div>
          <div class="text-center p-3 border border-neon-border">
            <p class="text-[9px] text-neutral-600 tracking-wider uppercase mb-1">version</p>
            <p class="text-sm text-white font-bold">{browser.version || '?'}</p>
          </div>
          <div class="text-center p-3 border border-neon-border">
            <p class="text-[9px] text-neutral-600 tracking-wider uppercase mb-1">platform</p>
            <p class="text-sm text-white font-bold">{browser.os}</p>
          </div>
          <div class="text-center p-3 border border-neon-border">
            <p class="text-[9px] text-neutral-600 tracking-wider uppercase mb-1">device</p>
            <p class={`text-sm font-bold ${browser.isMobile ? 'text-grade-d' : 'text-white'}`}>
              {browser.isMobile ? 'Mobile' : 'Desktop'}
            </p>
          </div>
        </div>
      </div>

      {/* Diagnostics card with pass/fail */}
      <div class="cyber-card lift-on-hover p-5 mb-4 section-enter delay-250">
        <div class="cyber-corners absolute inset-0 pointer-events-none" />

        {/* Header + toggle */}
        <button
          type="button"
          class="w-full flex items-center justify-between gap-3 mb-4"
          onClick={() => setExpanded(!expanded)}
        >
          <div class="flex items-center gap-3">
            <span class="text-neon-muted text-xs">{'>'}</span>
            <span class="text-xs text-neutral-600 tracking-wider uppercase">
              diagnostics_report
            </span>
          </div>
          <div class="flex items-center gap-3">
            <span class={`text-xs font-bold font-mono ${passRate >= 80 ? 'text-grade-b' : passRate >= 50 ? 'text-grade-d' : 'text-grade-f'}`}>
              {passedCount}/{totalCount} passed
            </span>
            <svg
              class={`w-4 h-4 text-neutral-600 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </button>

        {/* Progress bar */}
        <div class="w-full h-1.5 bg-neon-border mb-4 overflow-hidden">
          <div
            class="h-full bar-fill"
            style={{
              width: `${passRate}%`,
              background: passRate >= 80
                ? 'var(--color-grade-b)'
                : passRate >= 50
                  ? 'var(--color-grade-d)'
                  : 'var(--color-grade-f)',
            }}
          />
        </div>

        {/* Compact summary — always visible */}
        <div class="space-y-1.5">
          {checks.map((check, i) => (
            <div key={i} class="flex items-center gap-2">
              <span class={`w-4 text-center text-xs font-mono ${check.passed ? 'text-grade-a' : 'text-grade-f'}`}>
                {check.passed ? '+' : 'x'}
              </span>
              <span class="text-[11px] text-neutral-400 font-mono flex-1 truncate">
                {check.label}
              </span>
              <span class={`text-[9px] font-mono tracking-wider uppercase ${check.passed ? 'text-neon-muted' : 'text-grade-f'}`}>
                {check.passed ? 'pass' : 'fail'}
              </span>
            </div>
          ))}
        </div>

        {/* Expanded detail view */}
        {expanded && (
          <div class="mt-4 pt-4 border-t border-neon-border space-y-3 animate-fade-in">
            {checks.map((check, i) => (
              <div key={i} class="p-3 border border-neon-border">
                <div class="flex items-center gap-2 mb-1.5">
                  <span class={`text-xs font-mono font-bold ${check.passed ? 'text-grade-a' : 'text-grade-f'}`}>
                    [{check.passed ? 'PASS' : 'FAIL'}]
                  </span>
                  <span class="text-[11px] text-white font-mono tracking-wider uppercase">
                    {check.label}
                  </span>
                </div>
                <p class="text-[10px] text-neutral-500 font-mono leading-relaxed">
                  {check.detail}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommendation card */}
      {recommendation && (
        <div class="cyber-card lift-on-hover p-5 mb-4 section-enter delay-300" style={{ borderColor: 'rgba(0, 255, 136, 0.25)' }}>
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="flex items-center gap-3 mb-3">
            <span class="text-neon text-xs">{'>'}</span>
            <span class="text-xs text-neon tracking-wider uppercase">recommended_action</span>
          </div>
          <p class="text-xs text-neutral-400 font-mono leading-relaxed">
            {recommendation}
          </p>
        </div>
      )}

      {/* Supported browsers reference */}
      <div class="cyber-card lift-on-hover p-5 section-enter delay-400">
        <div class="cyber-corners absolute inset-0 pointer-events-none" />
        <div class="flex items-center gap-3 mb-4">
          <span class="text-neon-muted text-xs">{'>'}</span>
          <span class="text-xs text-neutral-600 tracking-wider uppercase">supported_browsers</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { name: 'Chrome', version: '113+', icon: 'C' },
            { name: 'Edge', version: '113+', icon: 'E' },
            { name: 'Firefox', version: '141+', icon: 'F' },
            { name: 'Safari', version: '18+', icon: 'S' },
          ].map((b) => (
            <div
              key={b.name}
              class={`text-center p-3 border transition-colors duration-200 ${
                browser.name === b.name
                  ? 'border-grade-f bg-grade-f/5'
                  : 'border-neon-border hover:border-neon-dim'
              }`}
            >
              <div class={`text-lg font-bold mb-1 font-mono ${browser.name === b.name ? 'text-grade-f' : 'text-neon'}`}>
                {b.icon}
              </div>
              <p class="text-[10px] text-neutral-400 font-mono">{b.name}</p>
              <p class="text-[9px] text-neutral-600 font-mono">{b.version}</p>
            </div>
          ))}
        </div>
        <p class="text-[9px] text-neutral-700 font-mono tracking-wider mt-3 text-center uppercase">
          desktop browsers recommended // hardware acceleration required
        </p>
      </div>

      {/* Footer */}
      <div class="text-center mt-8 section-enter delay-500">
        <div class="divider-neon mb-4" />
        <p class="text-[9px] text-neutral-700 tracking-[0.2em] uppercase font-mono">
          privacylens // browser compatibility check failed
        </p>
      </div>
    </div>
  )
}
