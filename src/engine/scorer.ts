import type {
  AnalysisTarget,
  CategoryKey,
  DocumentAssessment,
  ScoredCategory,
  AnalysisReport,
} from '../types/analysis'
import type { HeuristicResult } from './heuristic-analyzer'
import { detectInconsistencies } from './heuristic-analyzer'
import { severityToScore, scoreToGrade } from '../utils/grade-utils'

const CATEGORY_CONFIG: Record<
  CategoryKey,
  { label: string; weight: number; defaultSummary: Record<string, string> }
> = {
  data_collection: {
    label: 'Data Collection',
    weight: 0.2,
    defaultSummary: {
      good: 'Minimal and transparent data collection practices.',
      moderate: 'Standard data collection with some tracking.',
      poor: 'Extensive data collection including behavioral tracking.',
      critical: 'Highly invasive data collection with biometric or location tracking.',
    },
  },
  third_party: {
    label: 'Third-Party Sharing',
    weight: 0.2,
    defaultSummary: {
      good: 'No data sharing with third parties.',
      moderate: 'Shares data with service providers for processing.',
      poor: 'Shares data with advertisers and marketing partners.',
      critical: 'Sells personal data to third parties or data brokers.',
    },
  },
  user_rights: {
    label: 'User Rights',
    weight: 0.2,
    defaultSummary: {
      good: 'Strong user rights with data access, deletion, and portability.',
      moderate: 'Basic user rights with some data control options.',
      poor: 'Limited user control over personal data.',
      critical: 'No meaningful user rights or data control.',
    },
  },
  retention: {
    label: 'Data Retention',
    weight: 0.15,
    defaultSummary: {
      good: 'Clear retention periods with automatic deletion.',
      moderate: 'Defined retention period with deletion options.',
      poor: 'Vague retention policy without clear timeframes.',
      critical: 'Data retained indefinitely with no clear deletion policy.',
    },
  },
  security: {
    label: 'Security Measures',
    weight: 0.15,
    defaultSummary: {
      good: 'Strong security with encryption, audits, and breach notification.',
      moderate: 'Standard security measures including encryption.',
      poor: 'Vague security claims without specifics.',
      critical: 'No security measures mentioned or security disclaimed.',
    },
  },
  children: {
    label: "Children's Privacy",
    weight: 0.1,
    defaultSummary: {
      good: 'COPPA compliant with parental consent requirements.',
      moderate: 'Acknowledges age restrictions for the service.',
      poor: 'Minimal children protection measures.',
      critical: 'No children protection or age verification mentioned.',
    },
  },
}

const CATEGORY_KEYS = Object.keys(CATEGORY_CONFIG) as CategoryKey[]

interface ScoreOptions {
  llmSummary?: string
  analysisTarget?: AnalysisTarget
  documentAssessment?: DocumentAssessment
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function buildCategorySummary(
  fallbackSummary: string,
  result: HeuristicResult,
): string {
  const baseSummary = fallbackSummary.replace(/[.]+$/, '')
  const topFinding = result.findings[0]
  if (!topFinding) return `${baseSummary}.`

  const confidenceSuffix = `Confidence ${result.confidence}%.`

  // Enrich summary with dark pattern and readability warnings
  const darkPatternWarning =
    result.darkPatterns && result.darkPatterns.length >= 2
      ? ` Dark patterns detected (${result.darkPatterns.length}).`
      : ''

  const readabilityWarning =
    result.readabilityGrade !== undefined && result.readabilityGrade >= 16
      ? ' Language complexity is unusually high.'
      : ''

  const suffix = `${darkPatternWarning}${readabilityWarning} ${confidenceSuffix}`

  if (result.score >= 82) {
    return `${baseSummary}. Strongest safeguard signal: ${topFinding}.${suffix}`
  }
  if (result.score <= 37) {
    return `${baseSummary}. Primary risk signal: ${topFinding}.${suffix}`
  }
  if (result.riskSignals > result.safeguardSignals) {
    return `${baseSummary}. Main concern: ${topFinding}.${suffix}`
  }
  if (result.safeguardSignals > result.riskSignals) {
    return `${baseSummary}. Key safeguard: ${topFinding}.${suffix}`
  }

  return `${baseSummary}. Notable signal: ${topFinding}.${suffix}`
}

export function scoreHeuristicResults(
  heuristicResults: Record<CategoryKey, HeuristicResult>,
  modelUsed: string,
  policyWordCount: number,
  options: ScoreOptions = {},
): AnalysisReport {
  const {
    llmSummary,
    analysisTarget = 'auto',
    documentAssessment,
  } = options
  const categories: ScoredCategory[] = []
  let weightedSum = 0
  const redFlags: string[] = []

  // Aggregate new analysis dimensions across all categories
  const allRegulatorySignals = new Set<string>()
  const allDarkPatterns = new Set<string>()
  let totalReadability = 0
  let readabilityCount = 0

  for (const key of CATEGORY_KEYS) {
    const result = heuristicResults[key]
    const config = CATEGORY_CONFIG[key]
    const score = clamp(
      Math.round(
        Number.isFinite(result.score)
          ? result.score
          : severityToScore(result.severity),
      ),
      0,
      100,
    )
    const weight = config.weight
    weightedSum += score * weight

    const summary = buildCategorySummary(
      config.defaultSummary[result.severity],
      result,
    )

    // Collect new dimension data
    if (result.regulatorySignals) {
      for (const sig of result.regulatorySignals) allRegulatorySignals.add(sig)
    }
    if (result.darkPatterns) {
      for (const dp of result.darkPatterns) allDarkPatterns.add(dp)
    }
    if (result.readabilityGrade !== undefined) {
      totalReadability += result.readabilityGrade
      readabilityCount++
    }

    categories.push({
      key,
      label: config.label,
      score,
      grade: scoreToGrade(score),
      severity: result.severity,
      findings: result.findings,
      quote: result.quote,
      summary,
      insights: result.insights,
      regulatorySignals: result.regulatorySignals,
      darkPatterns: result.darkPatterns,
      readabilityGrade: result.readabilityGrade,
    })

    if (score <= 45 || result.severity === 'critical') {
      if (result.quote) redFlags.push(result.quote)
      else if (result.findings[0]) redFlags.push(result.findings[0])
    }
  }

  // Detect cross-category inconsistencies
  const inconsistencies = detectInconsistencies(heuristicResults)

  // Add dark pattern red flags
  if (allDarkPatterns.size >= 3) {
    redFlags.push(
      `${allDarkPatterns.size} dark pattern indicators detected, suggesting manipulative language.`,
    )
  }

  // Add inconsistency red flags
  for (const inc of inconsistencies) {
    redFlags.push(inc)
  }

  const overallScore = Math.round(weightedSum)
  const assessment = documentAssessment ?? {
    kind: 'unknown' as const,
    confidence: 0,
    isLikelyPolicyOrTos: false,
    signals: [],
    privacySignalCount: 0,
    tosSignalCount: 0,
  }

  if (!assessment.isLikelyPolicyOrTos) {
    redFlags.unshift(
      'Document validation is weak: text may not be a Privacy Policy or Terms of Service.',
    )
  }

  if (
    analysisTarget !== 'auto' &&
    assessment.kind !== 'unknown' &&
    assessment.kind !== 'mixed' &&
    assessment.kind !== analysisTarget
  ) {
    redFlags.unshift(
      `Detected document type "${assessment.kind}" does not match requested analysis target "${analysisTarget}".`,
    )
  }

  const avgReadability = readabilityCount > 0
    ? Math.round((totalReadability / readabilityCount) * 10) / 10
    : undefined

  return {
    categories,
    overallScore,
    overallGrade: scoreToGrade(overallScore),
    redFlags: redFlags.slice(0, 7),
    analyzedAt: new Date().toISOString(),
    modelUsed: llmSummary ? modelUsed : 'Heuristic Analysis v2',
    policyWordCount,
    chunksAnalyzed: 1,
    analysisTarget,
    documentKind: assessment.kind,
    documentConfidence: assessment.confidence,
    isLikelyPolicyOrTos: assessment.isLikelyPolicyOrTos,
    documentSignals: assessment.signals.slice(0, 6),
    llmSummary,
    regulatorySignals: [...allRegulatorySignals],
    darkPatterns: [...allDarkPatterns],
    readabilityGrade: avgReadability,
    inconsistencies,
  }
}
