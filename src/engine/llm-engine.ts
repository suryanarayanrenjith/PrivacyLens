import {
  CreateWebWorkerMLCEngine,
  type WebWorkerMLCEngine,
  type InitProgressReport,
} from '@mlc-ai/web-llm'
import type { CategoryKey } from '../types/analysis'

export const MODELS = [
  {
    id: 'SmolLM2-360M-Instruct-q4f32_1-MLC',
    label: 'SmolLM2 360M (Fast)',
    size: '~580 MB',
    description: 'Fastest analysis, smallest download',
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    label: 'Qwen 2.5 0.5B',
    size: '~945 MB',
    description: 'Higher quality summaries',
  },
] as const

export type ModelId = (typeof MODELS)[number]['id']

let engine: WebWorkerMLCEngine | null = null
let worker: Worker | null = null
let currentModelId: string | null = null
let initializingModelId: ModelId | null = null
let engineInitPromise: Promise<void> | null = null
const progressListeners = new Set<(report: InitProgressReport) => void>()

function emitProgress(report: InitProgressReport): void {
  for (const listener of progressListeners) {
    listener(report)
  }
}

function addProgressListener(
  listener: (report: InitProgressReport) => void,
): () => void {
  progressListeners.add(listener)
  return () => {
    progressListeners.delete(listener)
  }
}

export function isEngineReady(modelId?: ModelId): boolean {
  if (!engine || !currentModelId) return false
  return modelId ? currentModelId === modelId : true
}

export async function initEngine(
  onProgress: (report: InitProgressReport) => void,
  modelId: ModelId = MODELS[0].id,
): Promise<void> {
  const removeProgressListener = addProgressListener(onProgress)

  try {
    if (engine && currentModelId === modelId) return

    if (engineInitPromise) {
      if (initializingModelId === modelId) {
        await engineInitPromise
        return
      }

      await engineInitPromise
      if (engine && currentModelId === modelId) return
    }

    initializingModelId = modelId
    engineInitPromise = (async () => {
      disposeEngine()

      worker = new Worker(new URL('../worker/llm-worker.ts', import.meta.url), {
        type: 'module',
      })

      engine = await CreateWebWorkerMLCEngine(worker, modelId, {
        initProgressCallback: emitProgress,
      })

      currentModelId = modelId
    })()

    await engineInitPromise
  } finally {
    removeProgressListener()
    if (initializingModelId === modelId) {
      engineInitPromise = null
      initializingModelId = null
    }
  }
}

// ─── LLM Analysis Results ─────────────────────────────────────────────────

export interface LLMAnalysisResult {
  /** Overall 2-3 sentence AI summary */
  overallSummary: string
  /** Per-category AI-generated contextual summaries */
  categorySummaries: Partial<Record<CategoryKey, string>>
  /** AI-assessed threat vectors and risk analysis */
  threatAssessment?: string
  /** AI-generated compliance observations */
  complianceNotes?: string
  /** AI-generated actionable recommendations */
  recommendations?: string[]
}

// ─── Structured Prompt for Small Models ───────────────────────────────────
//
// Research-backed prompt design for SmolLM2 360M / Qwen 2.5 0.5B:
//   - Use explicit structured output format (small models follow formats well)
//   - Keep instructions concrete and step-by-step
//   - Provide the heuristic findings as context (not raw policy text)
//   - Ask for analysis of weak areas specifically
//   - Use few-shot style with clear delimiters
//
// Reference: "Using LLMs for Automated Privacy Policy Analysis" (arXiv 2503.16516)

const SYSTEM_PROMPT = `You are a privacy policy analyst. You analyze heuristic scan results and provide clear, factual assessments.

Rules:
- Be factual and specific. No filler words.
- Reference actual findings from the scan data.
- Rephrase — do NOT copy the input wording verbatim.
- Do NOT output numeric scores; use qualitative strength instead.
- Each category summary must be 1 sentence.
- Overall summary must be 2-3 sentences.
- Include one concrete risk or safeguard not obvious from the scores.
- If a category has low confidence, note what information is missing.`

function buildAnalysisPrompt(
  keywordContext: string,
  categoryData: Record<CategoryKey, string>,
  weakCategories: CategoryKey[],
  overallScore: number,
  overallGrade: string,
): string {
  const catBlock = Object.entries(categoryData)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n')

  const weakBlock = weakCategories.length > 0
    ? `\nWeak areas needing deeper analysis: ${weakCategories.join(', ')}`
    : ''

  const context = keywordContext
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900)

  return `Scan results (score ${overallScore}, grade ${overallGrade}):
${catBlock}
${weakBlock}

Context snapshot: "${context}"

Respond in this exact format:
OVERALL: <2-3 sentence summary of the policy's privacy posture; no numeric scores; add one fresh risk or safeguard insight>
${Object.keys(categoryData).map(k => `${k}: <1 sentence about this category>`).join('\n')}
THREATS: <1-2 sentences about the biggest privacy threats this policy poses (no scores)>
COMPLIANCE: <1 sentence about regulatory compliance posture (GDPR, CCPA, COPPA)>
REC: <actionable recommendation 1>
REC: <actionable recommendation 2>
REC: <actionable recommendation 3>`
}

function buildQuickPrompt(
  keywordContext: string,
  categoryData: Record<CategoryKey, string>,
  overallScore: number,
  overallGrade: string,
): string {
  const catBlock = Object.entries(categoryData)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n')

  const context = keywordContext
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900)

  return `Score ${overallScore} (${overallGrade}):
${catBlock}

Context snapshot: "${context}"

OVERALL: <2 sentence privacy assessment; no numeric scores; include one concrete takeaway for users>`
}

function parseAnalysisResponse(
  response: string,
  categories: CategoryKey[],
): LLMAnalysisResult {
  const lines = response.split('\n').map(l => l.trim()).filter(Boolean)
  let overallSummary = ''
  let threatAssessment: string | undefined
  let complianceNotes: string | undefined
  const recommendations: string[] = []
  const categorySummaries: Partial<Record<CategoryKey, string>> = {}

  for (const line of lines) {
    const overallMatch = line.match(/^OVERALL:\s*(.+)/i)
    if (overallMatch) {
      overallSummary = overallMatch[1].trim()
      continue
    }

    const threatMatch = line.match(/^THREATS?:\s*(.+)/i)
    if (threatMatch) {
      threatAssessment = threatMatch[1].trim()
      continue
    }

    const complianceMatch = line.match(/^COMPLIANCE:\s*(.+)/i)
    if (complianceMatch) {
      complianceNotes = complianceMatch[1].trim()
      continue
    }

    const recMatch = line.match(/^REC:\s*(.+)/i)
    if (recMatch) {
      recommendations.push(recMatch[1].trim())
      continue
    }

    for (const cat of categories) {
      const catMatch = line.match(new RegExp(`^${cat}:\\s*(.+)`, 'i'))
      if (catMatch) {
        categorySummaries[cat] = catMatch[1].trim()
        break
      }
    }
  }

  // Fallback: if parsing failed, use the whole response as overall summary
  if (!overallSummary && response.trim()) {
    overallSummary = response.trim().slice(0, 300)
  }

  return {
    overallSummary,
    categorySummaries,
    threatAssessment: threatAssessment || undefined,
    complianceNotes: complianceNotes || undefined,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  }
}

// ─── Main Analysis Function ───────────────────────────────────────────────

export async function generateAnalysis(
  keywordContext: string,
  categoryData: Record<CategoryKey, string>,
  weakCategories: CategoryKey[],
  overallScore: number,
  overallGrade: string,
): Promise<LLMAnalysisResult> {
  if (!engine) throw new Error('Engine not initialized')

  const prompt = buildAnalysisPrompt(
    keywordContext,
    categoryData,
    weakCategories,
    overallScore,
    overallGrade,
  )

  const reply = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.18,
    top_p: 0.92,
    max_tokens: 256,
  })

  const content = reply.choices[0]?.message?.content ?? ''
  const categories = Object.keys(categoryData) as CategoryKey[]
  return parseAnalysisResponse(content, categories)
}

/**
 * Fallback: simpler prompt that only asks for an overall summary.
 * Used when the full analysis times out — much faster due to shorter prompt
 * and fewer expected output tokens.
 */
export async function generateQuickOverview(
  keywordContext: string,
  categoryData: Record<CategoryKey, string>,
  overallScore: number,
  overallGrade: string,
): Promise<LLMAnalysisResult> {
  if (!engine) throw new Error('Engine not initialized')

  const prompt = buildQuickPrompt(
    keywordContext,
    categoryData,
    overallScore,
    overallGrade,
  )

  const reply = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.12,
    top_p: 0.92,
    max_tokens: 112,
  })

  const content = reply.choices[0]?.message?.content ?? ''
  return parseAnalysisResponse(content, Object.keys(categoryData) as CategoryKey[])
}

export function disposeEngine(): void {
  engineInitPromise = null
  initializingModelId = null
  engine = null
  currentModelId = null
  worker?.terminate()
  worker = null
}
