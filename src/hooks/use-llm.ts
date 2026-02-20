import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import type { InitProgressReport } from '@mlc-ai/web-llm'
import {
  initEngine,
  generateAnalysis,
  generateQuickOverview,
  isEngineReady,
  type ModelId,
  type LLMAnalysisResult,
  MODELS,
} from '../engine/llm-engine'
import {
  analyzeAllCategories,
  assessDocumentType,
} from '../engine/heuristic-analyzer'
import type { HeuristicResult } from '../engine/heuristic-analyzer'
import { scoreHeuristicResults } from '../engine/scorer'
import { wordCount } from '../utils/text-utils'
import { fetchPolicyFromUrl } from '../utils/scraper'
import type {
  AnalysisReport,
  AnalysisTarget,
  AppStatus,
  CategoryKey,
  DocumentAssessment,
} from '../types/analysis'

const LLM_ANALYSIS_TIMEOUT_MS = 120_000
const LLM_QUICK_TIMEOUT_MS = 45_000
const SUMMARY_CACHE_LIMIT = 120
const SUMMARY_STORAGE_KEY = 'privacylens_summary_cache_v2'
const SUMMARY_STORAGE_LIMIT = 60
const summaryCache = new Map<string, LLMAnalysisResult>()

function paraphraseHeuristic(report: AnalysisReport): string {
  const sorted = [...report.categories].sort((a, b) => a.score - b.score)
  const worst = sorted[0]
  const secondWorst = sorted[1]
  const best = [...report.categories].sort((a, b) => b.score - a.score)[0]

  const docLabel =
    report.documentKind === 'privacy_policy'
      ? 'This looks like a privacy policy'
      : report.documentKind === 'tos'
        ? 'This reads like terms of service'
        : 'This document mixes privacy and terms language'

  const risks = [worst, secondWorst]
    .filter(Boolean)
    .map((c) => c.label.toLowerCase())
    .join(' and ')

  const line1 = `${docLabel} with a mixed risk posture. Biggest weaknesses: ${risks || 'unclear risk areas'}.`
  const line2 = `Stronger coverage in ${best?.label ?? 'some sections'}, but the weakest areas need attention first.`
  const line3 = report.redFlags.length > 0
    ? `Notable red flag: ${report.redFlags[0]}.`
    : 'No major red flags surfaced in the quick scan.'

  return `${line1} ${line2} ${line3}`.trim()
}

// Lightweight stop word list to keep keyword cues concise
const STOP_WORDS = new Set([
  'the', 'and', 'that', 'have', 'with', 'this', 'from', 'your', 'their', 'they',
  'will', 'such', 'about', 'which', 'shall', 'herein', 'hereby', 'thereof',
  'also', 'other', 'been', 'into', 'over', 'under', 'does', 'doesn', 'http',
  'https', 'www', 'com', 'for', 'you', 'our', 'are', 'may', 'can',
])

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutHandle = window.setTimeout(() => {
      reject(new Error(timeoutMessage))
    }, timeoutMs)

    promise
      .then((value) => {
        window.clearTimeout(timeoutHandle)
        resolve(value)
      })
      .catch((error) => {
        window.clearTimeout(timeoutHandle)
        reject(error)
      })
  })
}

function hashString(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function hydrateSummaryCacheFromStorage(): void {
  try {
    const raw = localStorage.getItem(SUMMARY_STORAGE_KEY)
    if (!raw) return
    const entries = JSON.parse(raw) as Array<[string, LLMAnalysisResult]>
    for (const entry of entries) {
      if (Array.isArray(entry) && typeof entry[0] === 'string' && entry[1] && typeof entry[1] === 'object') {
        summaryCache.set(entry[0], entry[1] as LLMAnalysisResult)
      }
    }
  } catch {
    // Ignore storage hydration issues silently.
  }
}

function persistSummaryCacheToStorage(): void {
  try {
    const entries = [...summaryCache.entries()].slice(-SUMMARY_STORAGE_LIMIT)
    localStorage.setItem(SUMMARY_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Ignore localStorage write failures silently.
  }
}

function extractTopKeywords(text: string, limit = 18): string[] {
  const freq = new Map<string, number>()
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
  let processed = 0
  for (const token of tokens) {
    if (!token || token.length < 4 || STOP_WORDS.has(token)) continue
    freq.set(token, (freq.get(token) ?? 0) + 1)
    processed += 1
    if (processed >= 9000) break // keep work bounded for very large policies
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term)
}

function buildPromptContext(
  policyText: string,
  heuristicResults: Record<CategoryKey, HeuristicResult>,
  docAssessment: DocumentAssessment,
): string {
  const excerpt = policyText
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200)

  const findings = Object.values(heuristicResults)
    .flatMap((result) => result.findings.slice(0, 2))
    .filter(Boolean)

  const weakInsights = Object.values(heuristicResults)
    .flatMap((result) => result.insights?.slice(0, 1) ?? [])
    .filter(Boolean)

  const signals = docAssessment?.signals?.slice(0, 6) ?? []
  const topWords = extractTopKeywords(policyText, 14)

  const combined = [...findings, ...weakInsights, ...signals, ...topWords]
  const unique: string[] = []
  for (const item of combined) {
    const trimmed = item.trim()
    if (!trimmed) continue
    const lower = trimmed.toLowerCase()
    if (!unique.some((existing) => existing.toLowerCase() === lower)) {
      unique.push(trimmed)
    }
    if (unique.length >= 28) break
  }

  const keywordLine = unique.join(', ')

  const combinedContext = `${excerpt}\nKey terms & signals: ${keywordLine}`
  return combinedContext.slice(0, 1600)
}

function buildSummaryCacheKey(
  modelId: ModelId,
  promptContext: string,
  analysisTarget: AnalysisTarget,
  documentKind: string,
  categorySummaries: Record<CategoryKey, string>,
): string {
  const catBlock = Object.entries(categorySummaries)
    .map(([key, value]) => `${key}:${value}`)
    .join('|')
  const normalizedContext = promptContext
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900)
  return `v2:${modelId}:${analysisTarget}:${documentKind}:${hashString(
    `${catBlock}:${normalizedContext}`,
  )}`
}

function writeSummaryCache(key: string, value: LLMAnalysisResult): void {
  if (summaryCache.size >= SUMMARY_CACHE_LIMIT) {
    const firstKey = summaryCache.keys().next().value
    if (firstKey) summaryCache.delete(firstKey)
  }
  summaryCache.set(key, value)
  persistSummaryCacheToStorage()
}

function buildInstantSummary(report: AnalysisReport): string {
  const sorted = [...report.categories].sort((a, b) => a.score - b.score)
  const worst = sorted[0]
  const secondWorst = sorted[1]
  const best = [...report.categories].sort((a, b) => b.score - a.score)[0]

  const riskParts = [worst, secondWorst]
    .filter(Boolean)
    .map((cat) => `${cat.label} (${cat.score})`)
    .join(' and ')

  const kindLabel =
    report.documentKind === 'privacy_policy'
      ? 'Privacy Policy'
      : report.documentKind === 'tos'
        ? 'Terms of Service'
        : report.documentKind === 'mixed'
          ? 'Mixed Policy/TOS'
          : 'Unclear Document Type'

  return (
    `${kindLabel} detected at ${report.documentConfidence}% confidence. ` +
    `Overall score is ${report.overallScore} (${report.overallGrade}); highest risks are ${riskParts}. ` +
    `Strongest area is ${best.label} (${best.score}); prioritize weakest clauses first.`
  )
}

/**
 * Identify categories where heuristic confidence is low and LLM analysis
 * would add the most value.
 */
function findWeakCategories(report: AnalysisReport): CategoryKey[] {
  const weak: CategoryKey[] = []
  for (const cat of report.categories) {
    const insights = cat.insights ?? []
    const hasGap = insights.some(i => i.includes('Coverage gap') || i.includes('No specific regulatory'))
    const lowConfidence = insights.some(i => {
      const match = i.match(/Detection confidence:\s*(\d+)%/)
      return match && parseInt(match[1]) < 55
    })
    const fewFindings = cat.findings.length <= 1 ||
      (cat.findings.length === 1 && cat.findings[0] === 'No strong indicators found in this section')

    if (hasGap || lowConfidence || fewFindings) {
      weak.push(cat.key)
    }
  }
  return weak
}

let cacheHydrated = false

export function useLLM() {
  const [status, setStatus] = useState<AppStatus>('idle')
  const [progress, setProgress] = useState<InitProgressReport | null>(null)
  const [report, setReport] = useState<AnalysisReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [readyModelId, setReadyModelId] = useState<ModelId | null>(null)
  const [warmingModelId, setWarmingModelId] = useState<ModelId | null>(null)
  const activeRunIdRef = useRef(0)

  if (!cacheHydrated) {
    hydrateSummaryCacheFromStorage()
    cacheHydrated = true
  }

  const isRunActive = useCallback((runId: number) => {
    return activeRunIdRef.current === runId
  }, [])

  const preloadModel = useCallback(
    async (modelId: ModelId = MODELS[0].id): Promise<boolean> => {
      if (isEngineReady(modelId)) {
        setReadyModelId(modelId)
        return true
      }

      setWarmingModelId(modelId)
      try {
        await initEngine(() => {}, modelId)
        setReadyModelId(modelId)
        return true
      } catch {
        return false
      } finally {
        setWarmingModelId((current) => (current === modelId ? null : current))
      }
    },
    [],
  )

  // Only preload the default model — preloading multiple models causes a
  // dispose race where the second model overwrites the first, forcing a
  // full re-download when analysis starts with the default model.
  useEffect(() => {
    void preloadModel(MODELS[0].id)
  }, [preloadModel])

  const runAnalysis = useCallback(
    async (
      policyText: string,
      modelId: ModelId,
      runId: number,
      analysisTarget: AnalysisTarget,
      sourceUrl?: string,
    ) => {
      try {
        if (!isRunActive(runId)) return
        setStatus('analyzing')

        const docAssessment = assessDocumentType(policyText, sourceUrl, analysisTarget)
        const heuristicResults = analyzeAllCategories(policyText, {
          analysisTarget,
          documentKind: docAssessment.kind,
        })
        const wc = wordCount(policyText)
        const initialReport = scoreHeuristicResults(heuristicResults, modelId, wc, {
          analysisTarget,
          documentAssessment: docAssessment,
        })
        if (sourceUrl) initialReport.sourceUrl = sourceUrl

        // Set heuristic instant summary — separate from llmSummary
        initialReport.instantSummary = buildInstantSummary(initialReport)

        if (!isRunActive(runId)) return
        setReport(initialReport)
        setStatus('done')

        // Skip LLM refinement for clearly invalid documents
        if (!docAssessment.isLikelyPolicyOrTos) {
          return
        }

        // ── LLM Refinement Phase ──────────────────────────────────────
        // Load the on-device model and generate contextual AI analysis
        // focusing especially on weak heuristic categories.

        try {
          if (!isRunActive(runId)) return

          const promptContext = buildPromptContext(
            policyText,
            heuristicResults,
            docAssessment,
          )

          const buildReportWithLlm = (llmData: LLMAnalysisResult): AnalysisReport => {
            const updatedReport = scoreHeuristicResults(heuristicResults, modelId, wc, {
              llmSummary: llmData.overallSummary,
              analysisTarget,
              documentAssessment: docAssessment,
            })
            if (sourceUrl) updatedReport.sourceUrl = sourceUrl
            updatedReport.instantSummary = initialReport.instantSummary
            updatedReport.llmCategorySummaries = llmData.categorySummaries
            updatedReport.llmThreatAssessment = llmData.threatAssessment
            updatedReport.llmComplianceNotes = llmData.complianceNotes
            updatedReport.llmRecommendations = llmData.recommendations
            return updatedReport
          }

          const applyLlmResult = (
            result: LLMAnalysisResult | null,
            cacheKey?: string,
            persist = false,
          ) => {
            if (!result?.overallSummary?.trim() || !isRunActive(runId)) return
            const merged = buildReportWithLlm(result)
            setReport(merged)
            if (persist && cacheKey) writeSummaryCache(cacheKey, result)
          }

          // Load model — skip if already ready (avoids redundant init)
          if (!isEngineReady(modelId)) {
            setStatus('loading-model')
            await initEngine(
              (p) => {
                if (isRunActive(runId)) setProgress(p)
              },
              modelId,
            )
            setReadyModelId(modelId)
          }

          if (!isRunActive(runId)) return
          setStatus('analyzing')

          // Build category data for the LLM prompt (compact to speed inference)
          const catData = {} as Record<CategoryKey, string>
          for (const cat of initialReport.categories) {
            const parts = [
              `severity=${cat.severity}`,
              `score=${cat.score}`,
              `top_finding=${cat.findings[0] ?? 'n/a'}`,
            ]
            if (cat.insights && cat.insights.length > 0) {
              parts.push(`insight=${cat.insights[0]}`)
            }
            catData[cat.key] = parts.join(', ')
          }

          // Find categories where heuristic is weak → LLM focuses here
          const weakCategories = findWeakCategories(initialReport).slice(0, 3)

          const cacheKey = buildSummaryCacheKey(
            modelId,
            promptContext,
            analysisTarget,
            docAssessment.kind,
            catData,
          )
          let llmResult = summaryCache.get(cacheKey) ?? null

          // Serve cached result immediately
          if (llmResult) {
            applyLlmResult(llmResult)
          }

          // Fast keyword-first overview to show summary quickly
          if (!llmResult) {
            try {
              const quickResult = await withTimeout(
                generateQuickOverview(
                  promptContext,
                  catData,
                  initialReport.overallScore,
                  initialReport.overallGrade,
                ),
                LLM_QUICK_TIMEOUT_MS,
                'AI quick analysis timed out',
              )
              if (quickResult?.overallSummary?.trim()) {
                llmResult = quickResult
                applyLlmResult(quickResult, cacheKey, true)
              }
            } catch {
              // ignore and attempt full structured analysis
            }
          }

          // Structured analysis still runs to enrich per-category notes; it can
          // replace the quick summary when successful. Skip if cached result
          // already contains category detail.
          const needsStructured =
            !llmResult ||
            Object.keys(llmResult.categorySummaries ?? {}).length === 0

          if (needsStructured && isRunActive(runId)) {
            let structuredResult: LLMAnalysisResult | null = null
            try {
              structuredResult = await withTimeout(
                generateAnalysis(
                  promptContext,
                  catData,
                  weakCategories,
                  initialReport.overallScore,
                  initialReport.overallGrade,
                ),
                LLM_ANALYSIS_TIMEOUT_MS,
                'AI analysis timed out',
              )
            } catch {
              structuredResult = null
            }

            if (structuredResult?.overallSummary?.trim()) {
              llmResult = structuredResult
              applyLlmResult(structuredResult, cacheKey, true)
            }
          }

          if (!llmResult?.overallSummary?.trim() || !isRunActive(runId)) {
            if (isRunActive(runId)) {
              setReport((prev) => {
                if (!prev) return prev
                const fallbackSummary = prev.llmSummary
                  ?? paraphraseHeuristic(prev)
                return {
                  ...prev,
                  llmSummary: fallbackSummary,
                  llmError: 'AI model did not return a summary (timed out or unavailable).',
                }
              })
              setStatus('done')
            }
            return
          }

          setStatus('done')
        } catch (llmErr: unknown) {
          // ── LLM failed: show error to user instead of silently swallowing ──
          if (!isRunActive(runId)) return

          const llmErrorMsg =
            llmErr instanceof Error ? llmErr.message : 'AI model refinement failed'

          // Update the existing report to include the error and fall back to heuristic summary
          setReport((prev) => {
            if (!prev) return prev
            const fallbackSummary = prev.llmSummary
              ?? paraphraseHeuristic(prev)
            return { ...prev, llmError: llmErrorMsg, llmSummary: fallbackSummary }
          })
          setStatus('done')
        }
      } catch (err: unknown) {
        if (!isRunActive(runId)) return
        const message =
          err instanceof Error ? err.message : 'Analysis failed'
        setError(message)
        setStatus('error')
      }
    },
    [isRunActive],
  )

  const analyzeUrl = useCallback(
    async (
      url: string,
      modelId: ModelId = MODELS[0].id,
      analysisTarget: AnalysisTarget = 'auto',
    ) => {
      const runId = activeRunIdRef.current + 1
      activeRunIdRef.current = runId

      try {
        setError(null)
        setProgress(null)
        setReport(null)

        void preloadModel(modelId)
        setStatus('fetching')
        const policyText = await fetchPolicyFromUrl(url)
        if (!isRunActive(runId)) return

        await runAnalysis(policyText, modelId, runId, analysisTarget, url)
      } catch (err: unknown) {
        if (!isRunActive(runId)) return
        const message =
          err instanceof Error ? err.message : 'Failed to fetch URL'
        setError(message)
        setStatus('error')
      }
    },
    [isRunActive, preloadModel, runAnalysis],
  )

  const analyzeText = useCallback(
    async (
      policyText: string,
      modelId: ModelId = MODELS[0].id,
      analysisTarget: AnalysisTarget = 'auto',
    ) => {
      const runId = activeRunIdRef.current + 1
      activeRunIdRef.current = runId

      try {
        setError(null)
        setProgress(null)
        setReport(null)
        void preloadModel(modelId)
        await runAnalysis(policyText, modelId, runId, analysisTarget)
      } catch (err: unknown) {
        if (!isRunActive(runId)) return
        const message =
          err instanceof Error ? err.message : 'Analysis failed'
        setError(message)
        setStatus('error')
      }
    },
    [isRunActive, preloadModel, runAnalysis],
  )

  const reset = useCallback(() => {
    activeRunIdRef.current += 1
    setStatus('idle')
    setProgress(null)
    setReport(null)
    setError(null)
  }, [])

  const isModelReady = useCallback(
    (modelId: ModelId) => {
      return readyModelId === modelId || isEngineReady(modelId)
    },
    [readyModelId],
  )

  return {
    status,
    progress,
    report,
    error,
    analyzeUrl,
    analyzeText,
    reset,
    preloadModel,
    isModelReady,
    warmingModelId,
  }
}
