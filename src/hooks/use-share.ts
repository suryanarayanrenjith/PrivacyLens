import { useState, useEffect, useCallback } from 'preact/hooks'
import type { AnalysisReport } from '../types/analysis'

function encodeReport(report: AnalysisReport): string {
  const json = JSON.stringify(report)
  return btoa(unescape(encodeURIComponent(json)))
}

function normalizeReport(report: AnalysisReport): AnalysisReport {
  return {
    ...report,
    analysisTarget: report.analysisTarget ?? 'auto',
    documentKind: report.documentKind ?? 'unknown',
    documentConfidence:
      typeof report.documentConfidence === 'number' ? report.documentConfidence : 0,
    isLikelyPolicyOrTos: report.isLikelyPolicyOrTos ?? false,
    documentSignals: report.documentSignals ?? [],
    categories: report.categories.map((category) => ({
      ...category,
      insights: category.insights ?? [],
    })),
  }
}

function decodeReport(encoded: string): AnalysisReport | null {
  try {
    const json = decodeURIComponent(escape(atob(encoded)))
    return normalizeReport(JSON.parse(json) as AnalysisReport)
  } catch {
    return null
  }
}

export function useShare() {
  const [sharedReport, setSharedReport] = useState<AnalysisReport | null>(null)

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (hash.startsWith('report=')) {
      const encoded = hash.slice('report='.length)
      const report = decodeReport(encoded)
      if (report) setSharedReport(report)
    }
  }, [])

  const generateShareUrl = useCallback((report: AnalysisReport): string => {
    const encoded = encodeReport(report)
    return `${window.location.origin}${window.location.pathname}#report=${encoded}`
  }, [])

  const copyShareUrl = useCallback(
    async (report: AnalysisReport): Promise<boolean> => {
      const url = generateShareUrl(report)
      try {
        await navigator.clipboard.writeText(url)
        return true
      } catch {
        return false
      }
    },
    [generateShareUrl],
  )

  return { sharedReport, generateShareUrl, copyShareUrl }
}
