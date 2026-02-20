import { useState, useCallback } from 'preact/hooks'
import type { AnalysisReport } from '../types/analysis'

interface Props {
  report: AnalysisReport
  copyShareUrl: (report: AnalysisReport) => Promise<boolean>
}

export function ShareButton({ report, copyShareUrl }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    const ok = await copyShareUrl(report)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [report, copyShareUrl])

  return (
    <button
      type="button"
      class={`cyber-btn ${copied ? 'cyber-btn-success' : ''}`}
      onClick={handleCopy}
    >
      {copied ? (
        <span class="flex items-center gap-2 text-neon">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          copied!
        </span>
      ) : (
        <span class="flex items-center gap-2">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          share
        </span>
      )}
    </button>
  )
}
