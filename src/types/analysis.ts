export interface CategoryResult {
  severity: 'good' | 'moderate' | 'poor' | 'critical'
  findings: string[]
  quote: string
  summary: string
}

export interface LLMResponse {
  data_collection: CategoryResult
  retention: CategoryResult
  third_party: CategoryResult
  user_rights: CategoryResult
  children: CategoryResult
  security: CategoryResult
}

export type CategoryKey = keyof LLMResponse

export type AnalysisTarget = 'privacy_policy' | 'tos' | 'auto'
export type DocumentKind = 'privacy_policy' | 'tos' | 'mixed' | 'unknown'
export type AnalysisDepth = 'shallow' | 'deep'

export interface ReadabilityDetails {
  fleschKincaid: number
  gunningFog: number
  colemanLiau: number
  ari: number
  smog: number
  averageGrade: number
}

export interface VagueLanguageResult {
  score: number
  instances: string[]
  density: number
}

export interface BoilerplateResult {
  score: number
  uniqueness: number
  matches: string[]
}

export interface DocumentAssessment {
  kind: DocumentKind
  confidence: number
  isLikelyPolicyOrTos: boolean
  signals: string[]
  privacySignalCount: number
  tosSignalCount: number
}

export interface ScoredCategory {
  key: CategoryKey
  label: string
  score: number
  grade: string
  severity: string
  findings: string[]
  quote: string
  summary: string
  insights?: string[]
  regulatorySignals?: string[]
  darkPatterns?: string[]
  readabilityGrade?: number
  readabilityDetails?: ReadabilityDetails
  vagueLanguage?: VagueLanguageResult
  completenessScore?: number
  boilerplateScore?: number
  sentimentMismatches?: string[]
}

export interface AnalysisReport {
  categories: ScoredCategory[]
  overallScore: number
  overallGrade: string
  redFlags: string[]
  analyzedAt: string
  modelUsed: string
  policyWordCount: number
  chunksAnalyzed: number
  analysisTarget: AnalysisTarget
  documentKind: DocumentKind
  documentConfidence: number
  isLikelyPolicyOrTos: boolean
  documentSignals: string[]
  sourceUrl?: string
  /** Heuristic-generated instant summary (always available) */
  instantSummary?: string
  /** LLM-generated refined summary (only set after model inference completes) */
  llmSummary?: string
  /** LLM-generated per-category summaries keyed by category */
  llmCategorySummaries?: Partial<Record<CategoryKey, string>>
  /** Error message if LLM refinement failed */
  llmError?: string
  /** Aggregated regulatory compliance signals across all categories */
  regulatorySignals?: string[]
  /** Aggregated dark pattern detections across all categories */
  darkPatterns?: string[]
  /** Average readability grade (Flesch-Kincaid) across analyzed text */
  readabilityGrade?: number
  /** Cross-category inconsistencies detected */
  inconsistencies?: string[]
  /** AI-assessed threat vectors and risk analysis */
  llmThreatAssessment?: string
  /** AI-generated compliance observations */
  llmComplianceNotes?: string
  /** AI-generated actionable recommendations */
  llmRecommendations?: string[]
  /** Whether shallow or deep analysis was performed */
  analysisDepth?: AnalysisDepth
  /** Multi-index readability ensemble details */
  readabilityDetails?: ReadabilityDetails
  /** Aggregated vague language score (0-100) */
  vagueLanguageScore?: number
  /** Policy completeness score via cosine similarity (0-100) */
  completenessScore?: number
  /** Boilerplate/template language percentage (0-100) */
  boilerplateScore?: number
  /** Sentiment mismatch detections */
  sentimentMismatches?: string[]
}

export type AppStatus =
  | 'idle'
  | 'fetching'
  | 'loading-model'
  | 'analyzing'
  | 'done'
  | 'error'
  | 'unsupported'
