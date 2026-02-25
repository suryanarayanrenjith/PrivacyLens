import { useState, useEffect } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { checkWebGPUSupport } from '../utils/webgpu-detect'

interface Props {
  children: ComponentChildren
  onUnsupported?: () => void
}

export function WebGPUCheck({ children, onUnsupported }: Props) {
  const [state, setState] = useState<'checking' | 'supported' | 'unsupported'>(
    'checking',
  )
  const [reason, setReason] = useState('')

  useEffect(() => {
    checkWebGPUSupport()
      .then((result) => {
        if (result.supported) {
          setState('supported')
        } else {
          setReason(result.reason ?? 'WebGPU is not supported.')
          setState('unsupported')
          onUnsupported?.()
        }
      })
      .catch(() => {
        setReason('Failed to check WebGPU support.')
        setState('unsupported')
        onUnsupported?.()
      })
  }, [onUnsupported])

  if (state === 'checking') {
    return (
      <div class="flex items-center justify-center min-h-[60vh] animate-fade-in">
        <div class="text-center section-enter">
          <div class="w-6 h-6 mx-auto mb-3 border border-neon border-t-transparent animate-spin-slow" />
          <p class="text-[10px] text-neutral-600 font-mono tracking-wider uppercase">
            checking_compatibility...
          </p>
        </div>
      </div>
    )
  }

  if (state === 'unsupported') {
    return (
      <div class="flex items-center justify-center min-h-[60vh] animate-fade-in">
        <div class="cyber-card lift-on-hover max-w-md text-center p-8 relative">
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="text-grade-f text-4xl mb-4 font-mono">[X]</div>
          <h2 class="text-sm font-bold text-white mb-3 tracking-widest uppercase">
            incompatible_browser
          </h2>
          <p class="text-xs text-neutral-500 mb-4 font-mono">{reason}</p>
          <p class="text-[10px] text-neutral-700 font-mono tracking-wider">
            required: <span class="text-neon">Chrome 113+</span> or{' '}
            <span class="text-neon">Edge 113+</span>
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
