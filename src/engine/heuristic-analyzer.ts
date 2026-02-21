import type {
  AnalysisTarget,
  AnalysisDepth,
  CategoryKey,
  DocumentAssessment,
  DocumentKind,
  ReadabilityDetails,
  VagueLanguageResult,
  BoilerplateResult,
} from '../types/analysis'

// ─── Public Types ───────────────────────────────────────────────────────────

export interface HeuristicResult {
  severity: 'good' | 'moderate' | 'poor' | 'critical'
  findings: string[]
  quote: string
  score: number
  riskSignals: number
  safeguardSignals: number
  insights: string[]
  confidence: number
  /** Detected regulatory compliance signals (GDPR, CCPA, COPPA, etc.) */
  regulatorySignals?: string[]
  /** Dark pattern language detected in the text */
  darkPatterns?: string[]
  /** Flesch-Kincaid readability grade level (lower = easier to read) */
  readabilityGrade?: number
  /** Multi-index readability ensemble details */
  readabilityDetails?: ReadabilityDetails
  /** Vague/misleading language analysis */
  vagueLanguage?: VagueLanguageResult
  /** Policy completeness score (0-100) via cosine similarity */
  completenessScore?: number
  /** Boilerplate/template language percentage (0-100) */
  boilerplateScore?: number
  /** Sentiment mismatch detections */
  sentimentMismatches?: string[]
}

export interface AnalyzeAllOptions {
  analysisTarget?: AnalysisTarget
  documentKind?: DocumentKind
  analysisDepth?: AnalysisDepth
}

// ─── Internal Types ─────────────────────────────────────────────────────────

type RuleSignal = 'risk' | 'safeguard'
type SeverityLevel = HeuristicResult['severity']

interface PatternRule {
  pattern: RegExp
  signal: RuleSignal
  weight: number
  finding: string
}

interface RuleEvidence {
  finding: string
  signal: RuleSignal
  score: number
  quote: string
}

interface CoverageRequirement {
  keywords: RegExp[]
  penalty: number
  finding: string
}

interface DocRule {
  pattern: RegExp
  kind: 'privacy' | 'tos'
  weight: number
  label: string
}

interface ContextWindow {
  prev: string
  current: string
  next: string
  paragraph: string
}

interface TfIdfEntry {
  term: string
  tf: number
  idf: number
  tfidf: number
}

interface DarkPatternMatch {
  pattern: string
  category: string
  severity: number
}

interface RegulatoryMatch {
  regulation: string
  article?: string
  description: string
  isCompliance: boolean
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_FINDINGS = 7
const MAX_HITS_PER_RULE = 4
const TFIDF_MIN_RELEVANCE = 0.15

// ─── Expanded Pattern Rules (150+ patterns) ─────────────────────────────────
//
// Research-backed patterns derived from:
//   - OPP-115 dataset annotation categories
//   - GDPR Articles 12-14 disclosure requirements
//   - CCPA/CPRA consumer rights provisions
//   - FTC dark pattern enforcement actions (2024)
//   - PoliGraph privacy policy ontology (USENIX Security 2023)
//   - AutoCompliance rule-based compliance module (WWW 2021)

const BASE_RULES: Record<CategoryKey, PatternRule[]> = {
  data_collection: [
    // ── High-severity biometric / sensitive data ──
    { pattern: /\b(biometric|facial recognition|genetic|fingerprint|retina|iris|voiceprint|faceprint)\b/i, signal: 'risk', weight: 3.2, finding: 'Collects highly sensitive biometric identifiers' },
    { pattern: /\b(health|medical|disability|diagnosis|prescription|treatment)\s+(data|information|record)\b/i, signal: 'risk', weight: 3.0, finding: 'Collects health or medical information' },
    { pattern: /\b(racial|ethnic|religious|political|sexual orientation|sex life|trade union)\b.{0,30}\b(data|information)\b/i, signal: 'risk', weight: 3.0, finding: 'Collects special category / sensitive personal data' },
    { pattern: /\b(financial|bank|credit card|debit card|payment card|account number)\b.{0,20}\b(data|information|detail)\b/i, signal: 'risk', weight: 2.8, finding: 'Collects financial or payment information' },
    { pattern: /\b(social security|SSN|national id|passport|driver.?s?\s+licen[cs]e)\b/i, signal: 'risk', weight: 3.1, finding: 'Collects government-issued identifiers' },

    // ── Location tracking ──
    { pattern: /\b(precise|exact|gps|real.?time)\s+(location|geolocation|positioning)\b/i, signal: 'risk', weight: 2.7, finding: 'Collects precise geolocation data' },
    { pattern: /\b(location|geo.?fenc|beacon|bluetooth.?location)\b.{0,30}\b(track|monitor|collect|log)\b/i, signal: 'risk', weight: 2.4, finding: 'Tracks user location over time' },
    { pattern: /\b(approximate|coarse|city.?level|regional)\s+location\b/i, signal: 'risk', weight: 1.2, finding: 'Collects approximate location data' },

    // ── Behavioral tracking & profiling ──
    { pattern: /\b(sell|selling|sold)\b.{0,20}\b(personal data|personal information|user data)\b/i, signal: 'risk', weight: 3.0, finding: 'Allows sale of personal data' },
    { pattern: /\b(profiling|user profil|behavioral profil|inference|inferred data)\b/i, signal: 'risk', weight: 2.3, finding: 'Performs behavioral profiling or inference' },
    { pattern: /\b(advertising id|device fingerprint|browser fingerprint|canvas fingerprint)\b/i, signal: 'risk', weight: 2.2, finding: 'Uses device/browser fingerprinting for tracking' },
    { pattern: /\b(cross.?site|cross.?device|cross.?platform)\s+(track|profil|identif)\w*/i, signal: 'risk', weight: 2.5, finding: 'Performs cross-site or cross-device tracking' },
    { pattern: /\b(keystroke|mouse movement|scroll|click.?stream|session replay|screen record)\b/i, signal: 'risk', weight: 2.6, finding: 'Records detailed user interaction behavior' },
    { pattern: /\b(web ?beacon|pixel|tracking pixel|clear gif|1x1)\b/i, signal: 'risk', weight: 1.8, finding: 'Uses web beacons or tracking pixels' },
    { pattern: /\b(third.?party|analytics|tracking)\s+(cookie|tracker|SDK)\b/i, signal: 'risk', weight: 2.0, finding: 'Deploys third-party tracking cookies or SDKs' },
    { pattern: /\b(contact list|address book|phone book|call log|sms|text message)\b/i, signal: 'risk', weight: 2.4, finding: 'Accesses contact lists or communication logs' },
    { pattern: /\b(camera|microphone|photo library|gallery)\s+(access|permission)\b/i, signal: 'risk', weight: 2.0, finding: 'Requests camera or microphone access' },

    // ── Automated decision-making ──
    { pattern: /\b(automated decision|algorithmic|AI.?based|machine learning).{0,30}\b(decision|scoring|profiling|assessment)\b/i, signal: 'risk', weight: 2.4, finding: 'Uses automated decision-making on personal data' },
    { pattern: /\b(credit scor|risk scor|fraud scor|eligibility)\b.{0,20}\b(automat|algorithm)\b/i, signal: 'risk', weight: 2.6, finding: 'Applies automated scoring that may affect user eligibility' },

    // ── Safeguards ──
    { pattern: /\b(data minimization|minimize|minimal data|only collect what)\b/i, signal: 'safeguard', weight: 1.9, finding: 'Commits to data minimization' },
    { pattern: /\b(do\s+not|does\s+not|never)\b.{0,25}\b(sell|share|rent|trade)\b.{0,25}\b(personal data|personal information|your data|user data)\b/i, signal: 'safeguard', weight: 2.2, finding: 'States it does not sell or share personal data' },
    { pattern: /\b(anonymous|anonymize|anonymization|de.?identif|pseudonymiz|aggregate)\b/i, signal: 'safeguard', weight: 1.8, finding: 'Applies anonymization or de-identification techniques' },
    { pattern: /\b(purpose limitation|specific purpose|limited purpose|solely for)\b/i, signal: 'safeguard', weight: 1.7, finding: 'Limits data collection to specific purposes' },
    { pattern: /\b(consent|explicit consent|opt.?in)\b.{0,30}\b(before|prior to|required)\b.{0,20}\b(collect|process|share)\b/i, signal: 'safeguard', weight: 2.0, finding: 'Requires consent before data collection' },
    { pattern: /\b(privacy by design|privacy by default|built.?in privacy)\b/i, signal: 'safeguard', weight: 1.6, finding: 'References privacy by design principles' },
  ],

  retention: [
    // ── Indefinite / vague retention ──
    { pattern: /\b(indefinite|forever|perpetual|unlimited|no limit)\b.{0,25}\b(retain|retention|keep|store|maintain)\b/i, signal: 'risk', weight: 3.0, finding: 'Allows indefinite data retention' },
    { pattern: /\b(as long as|for as long as)\b.{0,25}\b(necessary|needed|required|appropriate|useful)\b/i, signal: 'risk', weight: 2.1, finding: 'Uses vague retention timeframe language' },
    { pattern: /\b(retain|store|keep|maintain)\b.{0,30}\b(reasonable|appropriate|suitable)\s+(period|time|duration)\b/i, signal: 'risk', weight: 1.9, finding: 'Defines retention as vaguely "reasonable" without specifics' },
    { pattern: /\b(after|following)\b.{0,25}\b(termination|account closure|cancellation|deletion)\b.{0,35}\b(retain|store|keep|maintain|preserve)\b/i, signal: 'risk', weight: 1.8, finding: 'Retains data after account termination' },
    { pattern: /\b(legal obligation|regulatory requirement|law enforcement)\b.{0,25}\b(retain|store|keep|preserve)\b/i, signal: 'risk', weight: 1.4, finding: 'Retains data beyond user control for legal obligations' },
    { pattern: /\b(backup|archive|archived)\b.{0,25}\b(retain|store|indefinite|may persist|for\s+\w+\s+period)\b/i, signal: 'risk', weight: 1.5, finding: 'Backups or archives may retain data beyond stated period' },
    { pattern: /\b(residual|cached|log)\b.{0,20}\b(data|copies|information)\b.{0,25}\b(may\s+(remain|persist)|not.{0,15}immediately)\b/i, signal: 'risk', weight: 1.3, finding: 'Residual data may persist in caches or logs' },

    // ── Data lifecycle ──
    { pattern: /\b(retain|keep|store)\b.{0,30}\b(commercial|business|marketing)\s+(purpose|reason)\b/i, signal: 'risk', weight: 2.0, finding: 'Retains data for commercial or marketing purposes' },
    { pattern: /\b(data retention|retention policy|retention schedule)\b.{0,20}\b(not\s+defined|unclear|unspecified)\b/i, signal: 'risk', weight: 2.2, finding: 'Retention schedule is not clearly defined' },

    // ── Safeguards ──
    { pattern: /\b\d{1,3}\b.{0,12}\b(day|days|month|months|year|years)\b.{0,25}\b(retention|retain|stored|store|kept|deleted|removed)\b/i, signal: 'safeguard', weight: 2.0, finding: 'Defines explicit numerical retention periods' },
    { pattern: /\b(auto(mat(ic|ically))?|scheduled|periodic)\b.{0,25}\b(delete|deletion|purge|remove|destroy|expunge)\b/i, signal: 'safeguard', weight: 2.0, finding: 'Implements automatic data deletion' },
    { pattern: /\b(request|right)\b.{0,18}\b(delete|deletion|erase|erasure|remove|destroy)\b/i, signal: 'safeguard', weight: 1.7, finding: 'Supports user deletion requests' },
    { pattern: /\b(data lifecycle|retention schedule|retention period)\b.{0,25}\b(document|defined|published|transparent)\b/i, signal: 'safeguard', weight: 1.8, finding: 'Documents a transparent data lifecycle policy' },
    { pattern: /\b(right to be forgotten|erasure right|deletion right)\b/i, signal: 'safeguard', weight: 1.9, finding: 'Recognizes right to be forgotten / erasure' },
    { pattern: /\b(anonymiz|de.?identif|pseudonymiz)\b.{0,25}\b(after|upon|when)\b.{0,25}\b(retention|period|expir)\b/i, signal: 'safeguard', weight: 1.6, finding: 'Anonymizes data after retention period' },
    { pattern: /\b(secure(ly)?|permanent(ly)?)\b.{0,15}\b(delet|destroy|erase|wipe|shred)\b/i, signal: 'safeguard', weight: 1.5, finding: 'Commits to secure data destruction' },
  ],

  third_party: [
    // ── High-risk sharing ──
    { pattern: /\bdata broker\w*\b/i, signal: 'risk', weight: 3.0, finding: 'Shares data with data brokers' },
    { pattern: /\b(advertiser|ad network|advertising network|marketing partner|demand.?side platform)\b/i, signal: 'risk', weight: 2.4, finding: 'Shares data with advertising or marketing networks' },
    { pattern: /\b(targeted advertising|cross[-\s]?context|behavioral advertising|interest.?based advertising)\b/i, signal: 'risk', weight: 2.2, finding: 'Allows targeted or behavioral advertising' },
    { pattern: /\b(affiliates?|partners?|subsidiaries)\b.{0,40}\b(share|disclose|provide|transfer|transmit)\b/i, signal: 'risk', weight: 1.8, finding: 'Allows broad sharing with affiliates or partners' },
    { pattern: /\b(government|law enforcement|intelligence|national security)\b.{0,30}\b(share|disclose|provide|access|request)\b/i, signal: 'risk', weight: 2.0, finding: 'May share data with government or law enforcement' },
    { pattern: /\b(merger|acquisition|bankruptcy|sale of (business|assets|company))\b.{0,30}\b(transfer|share|disclose|assign)\b/i, signal: 'risk', weight: 2.1, finding: 'Data may be transferred during corporate transactions' },
    { pattern: /\b(any|all)\s+(third.?part|external|outside)\b.{0,20}\b(we\s+choose|at\s+our\s+discretion|we\s+deem)\b/i, signal: 'risk', weight: 2.8, finding: 'Reserves discretion to share with any third party' },
    { pattern: /\b(social media|facebook|google|meta|twitter|tiktok)\b.{0,30}\b(plugin|widget|SDK|integration|pixel)\b/i, signal: 'risk', weight: 1.7, finding: 'Integrates social media tracking plugins' },
    { pattern: /\b(cross.?border|international|overseas|foreign)\b.{0,25}\b(transfer|sharing|transmit|send)\b/i, signal: 'risk', weight: 1.9, finding: 'Transfers data across international borders' },
    { pattern: /\b(without\s+(your\s+)?consent|without\s+notice|without\s+informing)\b.{0,25}\b(share|transfer|disclose|sell)\b/i, signal: 'risk', weight: 2.8, finding: 'May share data without user consent' },
    { pattern: /\b(data enrichment|data append|supplement|augment)\b.{0,25}\b(third.?party|external|outside)\b/i, signal: 'risk', weight: 2.0, finding: 'Enriches user data with third-party sources' },

    // ── Safeguards ──
    { pattern: /\b(service providers?|processors?|sub.?processors?)\b.{0,40}\b(limited purpose|on our behalf|contract(ual)?|bound by)\b/i, signal: 'safeguard', weight: 1.7, finding: 'Limits sharing to contracted service providers' },
    { pattern: /\b(opt[-\s]?out|do not sell|do not share|global privacy control|GPC)\b/i, signal: 'safeguard', weight: 1.8, finding: 'Offers controls to limit third-party sharing' },
    { pattern: /\b(do\s+not|does\s+not|never|will\s+not)\b.{0,20}\b(sell|rent|trade|barter)\b.{0,20}\b(personal|user|your)\b/i, signal: 'safeguard', weight: 2.0, finding: 'Explicitly prohibits selling user data' },
    { pattern: /\b(data processing agreement|DPA|contractual safeguard|standard contractual clause|SCC)\b/i, signal: 'safeguard', weight: 1.8, finding: 'Uses data processing agreements with third parties' },
    { pattern: /\b(adequacy decision|privacy shield|binding corporate rules|BCR)\b/i, signal: 'safeguard', weight: 1.6, finding: 'References cross-border transfer safeguards' },
    { pattern: /\b(vetted|verified|assessed|audited)\b.{0,20}\b(third.?part|vendor|partner|provider)\b/i, signal: 'safeguard', weight: 1.4, finding: 'Vets or audits third-party recipients' },
    { pattern: /\b(limit|restrict|minimize)\b.{0,20}\b(sharing|disclosure|transfer)\b.{0,20}\b(third.?part|external)\b/i, signal: 'safeguard', weight: 1.5, finding: 'Restricts scope of third-party sharing' },
    { pattern: /\b(transparent|transparency)\b.{0,20}\b(third.?part|partner|vendor|sharing)\b/i, signal: 'safeguard', weight: 1.3, finding: 'Commits to transparency about third-party sharing' },
  ],

  user_rights: [
    // ── Rights denial / restrictions ──
    { pattern: /\b(no|not)\b.{0,25}\b(right|ability|option|mechanism)\b.{0,25}\b(access|delete|correct|opt[-\s]?out|withdraw)\b/i, signal: 'risk', weight: 3.0, finding: 'Does not clearly provide privacy rights' },
    { pattern: /\b(deny|reject|refuse|decline)\b.{0,25}\b(request|requests|right)\b/i, signal: 'risk', weight: 1.8, finding: 'May deny user rights requests' },
    { pattern: /\b(binding arbitration|class action waiver|waive.*class action|mandatory arbitration)\b/i, signal: 'risk', weight: 2.6, finding: 'Contains restrictive dispute resolution terms' },
    { pattern: /\b(may|we may|reserve the right)\b.{0,30}\b(change|modify|update|amend|revise)\b.{0,25}\b(terms|agreement|policy|privacy)\b/i, signal: 'risk', weight: 1.9, finding: 'Reserves right to unilaterally change terms' },
    { pattern: /\b(without\s+(prior\s+)?notice|at\s+any\s+time|sole\s+discretion|absolute\s+discretion)\b.{0,25}\b(change|modify|terminat|suspend|restrict)\b/i, signal: 'risk', weight: 2.4, finding: 'May change terms or terminate service without notice' },
    { pattern: /\b(waive|forgo|relinquish|surrender)\b.{0,20}\b(right|claim|remedy)\b/i, signal: 'risk', weight: 2.2, finding: 'Requires users to waive rights or claims' },
    { pattern: /\b(irrevocab|perpetual|worldwide|royalty.?free)\b.{0,20}\b(licen[cs]e|right|grant)\b.{0,20}\b(content|data|information|material)\b/i, signal: 'risk', weight: 2.5, finding: 'Demands broad irrevocable license to user content' },
    { pattern: /\b(indemnif|hold harmless|defend us|at your expense)\b/i, signal: 'risk', weight: 2.0, finding: 'Contains indemnification requirements' },
    { pattern: /\b(continued use|by using|by accessing|by continuing)\b.{0,25}\b(constitutes?|implies?|means?|indicates?)\b.{0,20}\b(acceptance|agreement|consent)\b/i, signal: 'risk', weight: 1.7, finding: 'Uses browsewrap / implied consent model' },
    { pattern: /\b(verification|verify|identity)\b.{0,25}\b(before|prior|in order)\b.{0,25}\b(process|fulfill|honor)\b.{0,20}\b(request|right)\b/i, signal: 'risk', weight: 1.2, finding: 'May delay rights fulfillment pending identity verification' },
    { pattern: /\b(fee|charge|cost|payment)\b.{0,25}\b(request|access|deletion|portability)\b/i, signal: 'risk', weight: 2.0, finding: 'May charge fees for exercising privacy rights' },

    // ── Safeguards ──
    { pattern: /\b(access|view|download|portability|export)\b.{0,30}\b(your\s+)?(data|information|personal)\b/i, signal: 'safeguard', weight: 1.8, finding: 'Provides data access or portability rights' },
    { pattern: /\b(delete|erasure|erase|deletion|rectif|correct)\b.{0,30}\b(your\s+)?(data|information|personal|request|right)\b/i, signal: 'safeguard', weight: 1.9, finding: 'Provides correction or deletion rights' },
    { pattern: /\b(withdraw|revoke)\b.{0,20}\b(consent|permission|authorization)\b/i, signal: 'safeguard', weight: 2.0, finding: 'Allows withdrawal of consent' },
    { pattern: /\b(object|opt[-\s]?out|unsubscribe|stop)\b.{0,25}\b(processing|marketing|profiling|communication|email)\b/i, signal: 'safeguard', weight: 1.7, finding: 'Provides right to object or opt out' },
    { pattern: /\b(data protection officer|DPO|privacy officer|privacy team|privacy contact)\b/i, signal: 'safeguard', weight: 1.5, finding: 'Designates a data protection contact' },
    { pattern: /\b(complain|complaint|supervisory authority|data protection authority|ICO|CNIL)\b/i, signal: 'safeguard', weight: 1.6, finding: 'Informs users of right to lodge complaints' },
    { pattern: /\b(respond|reply|acknowledge)\b.{0,20}\b(within|in)\b.{0,15}\b\d+\b.{0,10}\b(day|business day|hour)\b/i, signal: 'safeguard', weight: 1.8, finding: 'Commits to a response timeline for requests' },
    { pattern: /\b(free of charge|no fee|at no cost|without charge)\b.{0,20}\b(request|access|right|exercise)\b/i, signal: 'safeguard', weight: 1.5, finding: 'Provides rights free of charge' },
    { pattern: /\b(appeal|escalat|review)\b.{0,20}\b(decision|denial|refusal)\b/i, signal: 'safeguard', weight: 1.4, finding: 'Offers an appeal process for denied requests' },
    { pattern: /\b(non.?discriminat|not\s+discriminat|without\s+discriminat)\b/i, signal: 'safeguard', weight: 1.6, finding: 'Commits to non-discrimination for exercising rights' },
  ],

  children: [
    // ── Risks ──
    { pattern: /\b(no|not|without)\b.{0,25}\b(age|child|minor)\b.{0,30}\b(protection|restriction|verification|policy|safeguard|gate)\b/i, signal: 'risk', weight: 3.0, finding: 'No clear child protection policy language' },
    { pattern: /\b(collect|process|gather|obtain)\b.{0,30}\b(child|children|minor|kid|teen|adolescent)\b.{0,30}\b(data|information)\b/i, signal: 'risk', weight: 2.4, finding: 'Collects data from children or minors' },
    { pattern: /\b(child|children|minor|kid)\b.{0,30}\b(target|direct|market|advertis)\b/i, signal: 'risk', weight: 2.6, finding: 'May target content or advertising to children' },
    { pattern: /\b(under\s*(13|16))\b.{0,25}\b(may\s+use|can\s+use|permitted|allowed)\b/i, signal: 'risk', weight: 2.2, finding: 'May permit use by children under legal thresholds' },
    { pattern: /\b(no\s+age\s+verification|do\s+not\s+verify\s+age|cannot\s+verify)\b/i, signal: 'risk', weight: 2.0, finding: 'Does not verify user age' },
    { pattern: /\b(student|pupil|educational)\b.{0,25}\b(data|information|record)\b.{0,20}\b(collect|process|share)\b/i, signal: 'risk', weight: 2.0, finding: 'Collects student or educational data' },
    { pattern: /\b(child|children|minor)\b.{0,20}\b(profil|track|behavio)\b/i, signal: 'risk', weight: 2.8, finding: 'Profiles or tracks children online behavior' },

    // ── Safeguards ──
    { pattern: /\b(COPPA|parental consent|verifiable parental consent)\b/i, signal: 'safeguard', weight: 2.0, finding: 'References COPPA or parental consent requirements' },
    { pattern: /\b(age gate|age verification|min(imum)? age|at least\s+\d+|age\s+screen)\b/i, signal: 'safeguard', weight: 1.6, finding: 'Implements age-gating or minimum age controls' },
    { pattern: /\b(not\s+intended|not\s+directed|not\s+designed)\b.{0,25}\b(child|children|minor|under\s*(13|16|18))\b/i, signal: 'safeguard', weight: 1.7, finding: 'Service is not directed at children' },
    { pattern: /\b(delete|remove|destroy)\b.{0,25}\b(child|children|minor)\b.{0,20}\b(data|information)\b/i, signal: 'safeguard', weight: 1.8, finding: 'Commits to deleting children data if discovered' },
    { pattern: /\b(parent|guardian|legal representative)\b.{0,25}\b(consent|permission|approve|authorize|review)\b/i, signal: 'safeguard', weight: 1.9, finding: 'Requires parental consent for minor data' },
    { pattern: /\b(FERPA|PRIVO|kidSAFE|CIPA|Age Appropriate Design Code|AADC)\b/i, signal: 'safeguard', weight: 1.7, finding: 'References children-specific privacy regulations' },
    { pattern: /\b(teacher|school|educator)\b.{0,20}\b(consent|approve|authorize)\b/i, signal: 'safeguard', weight: 1.3, finding: 'Involves educators in consent process' },
  ],

  security: [
    // ── Risks ──
    { pattern: /\b(no|without)\b.{0,25}\b(security|safeguards?|protection|measure)\b/i, signal: 'risk', weight: 3.1, finding: 'Does not describe concrete security safeguards' },
    { pattern: /\b(cannot|can\s*not|do\s+not|unable to)\b.{0,25}\b(guarantee|warrant|ensure|promise)\b.{0,25}\b(security|safety|protection|confidentiality)\b/i, signal: 'risk', weight: 2.0, finding: 'Disclaims security guarantees' },
    { pattern: /\b(limitation of liability|as is|without warrant(y|ies)|provided as.?is)\b/i, signal: 'risk', weight: 2.1, finding: 'Uses strong liability or warranty disclaimers' },
    { pattern: /\b(not\s+responsible|not\s+liable|no\s+liability)\b.{0,25}\b(breach|hack|unauthorized|loss|damage)\b/i, signal: 'risk', weight: 2.3, finding: 'Disclaims liability for data breaches' },
    { pattern: /\b(no\s+method|no\s+system|no\s+transmission)\b.{0,25}\b(100\s*%|completely|fully|totally)\b.{0,15}\b(secure|safe)\b/i, signal: 'risk', weight: 1.5, finding: 'Acknowledges no system is perfectly secure (standard disclaimer)' },
    { pattern: /\b(assume|accept|bear)\b.{0,15}\b(risk|responsibility)\b.{0,20}\b(use|access|transmit)\b/i, signal: 'risk', weight: 1.8, finding: 'Shifts security risk to the user' },
    { pattern: /\b(consequential|indirect|incidental|special|punitive)\s+damages?\b.{0,20}\b(exclud|disclaim|not\s+liable|waive)\b/i, signal: 'risk', weight: 1.9, finding: 'Excludes liability for consequential damages' },
    { pattern: /\b(maximum|aggregate)\s+liability\b.{0,20}\b(shall\s+not\s+exceed|limited to|capped at)\b/i, signal: 'risk', weight: 1.7, finding: 'Caps aggregate liability to a limited amount' },

    // ── Safeguards ──
    { pattern: /\b(encrypt(ion|ed)?|encrypted at rest|encrypted in transit|end.?to.?end encrypt)\b/i, signal: 'safeguard', weight: 2.2, finding: 'Implements encryption controls' },
    { pattern: /\b(SSL|TLS|HTTPS|transport layer security)\b/i, signal: 'safeguard', weight: 1.3, finding: 'Uses secure transport protocols' },
    { pattern: /\b(audit|penetration test|SOC\s*2|ISO\s*27001|ISO\s*27701|PCI.?DSS|NIST|FedRAMP)\b/i, signal: 'safeguard', weight: 1.9, finding: 'References security certifications or audits' },
    { pattern: /\b(incident response|breach notification|data breach|security incident)\b.{0,25}\b(plan|protocol|procedure|notify|inform|within)\b/i, signal: 'safeguard', weight: 2.0, finding: 'Has breach notification or incident response procedures' },
    { pattern: /\b(access control|role.?based|least privilege|need.?to.?know|multi.?factor|MFA|2FA|two.?factor)\b/i, signal: 'safeguard', weight: 1.8, finding: 'Implements access control measures' },
    { pattern: /\b(regular(ly)?|periodic(ally)?|annual(ly)?)\b.{0,20}\b(review|audit|assess|test|update)\b.{0,20}\b(security|privacy|practice|measure)\b/i, signal: 'safeguard', weight: 1.6, finding: 'Conducts regular security reviews' },
    { pattern: /\b(data protection impact assessment|DPIA|privacy impact assessment|PIA|risk assessment)\b/i, signal: 'safeguard', weight: 1.7, finding: 'Performs data protection impact assessments' },
    { pattern: /\b(employee|staff|personnel)\b.{0,20}\b(train|education|awareness)\b.{0,20}\b(security|privacy|data protection)\b/i, signal: 'safeguard', weight: 1.4, finding: 'Provides security/privacy training to staff' },
    { pattern: /\b(hashing|salted hash|bcrypt|argon|tokeniz)\b/i, signal: 'safeguard', weight: 1.5, finding: 'Uses hashing or tokenization for sensitive data' },
    { pattern: /\b(bug bounty|responsible disclosure|vulnerability disclosure)\b/i, signal: 'safeguard', weight: 1.3, finding: 'Maintains a vulnerability disclosure program' },
  ],
}

// ─── Coverage Requirements ──────────────────────────────────────────────────

const COVERAGE: Record<CategoryKey, CoverageRequirement> = {
  data_collection: {
    keywords: [
      /\b(data we collect|information we collect|personal data|personal information|data collection)\b/i,
      /\b(we\s+(collect|gather|obtain|receive|process))\b/i,
    ],
    penalty: 1.5,
    finding: 'Data collection scope is not clearly disclosed',
  },
  retention: {
    keywords: [
      /\b(retention|retain|delet(e|ion)|storage period|how long)\b/i,
      /\b(keep|stored|maintained)\b.{0,15}\b(period|duration|time)\b/i,
    ],
    penalty: 1.8,
    finding: 'Retention/deletion timelines are not clearly documented',
  },
  third_party: {
    keywords: [
      /\b(third.?part(y|ies)|share|disclose|sell|assign|transfer)\b/i,
      /\b(service provider|processor|partner|vendor)\b/i,
    ],
    penalty: 1.6,
    finding: 'Third-party transfer conditions are not clearly documented',
  },
  user_rights: {
    keywords: [
      /\b(right|request|access|delete|arbitration|termination)\b/i,
      /\b(opt.?out|withdraw|complaint|choice)\b/i,
    ],
    penalty: 1.8,
    finding: 'User rights and contract obligations are under-specified',
  },
  children: {
    keywords: [
      /\b(child|children|minor|under\s*(13|16|18)|age)\b/i,
      /\b(COPPA|parental|kid|teen)\b/i,
    ],
    penalty: 1.5,
    finding: 'Children policy coverage appears limited or absent',
  },
  security: {
    keywords: [
      /\b(security|safeguard|encrypt|liability|protect)\b/i,
      /\b(measure|control|practice)\b.{0,15}\b(security|privacy|data)\b/i,
    ],
    penalty: 1.9,
    finding: 'Security controls and liability boundaries are under-specified',
  },
}

// ─── Document Type Rules ────────────────────────────────────────────────────

const DOC_RULES: DocRule[] = [
  { pattern: /\bprivacy policy\b/i, kind: 'privacy', weight: 3.0, label: 'Explicit privacy policy heading' },
  { pattern: /\bprivacy notice\b/i, kind: 'privacy', weight: 2.8, label: 'Privacy notice heading' },
  { pattern: /\bpersonal (data|information)\b/i, kind: 'privacy', weight: 2.0, label: 'Personal data handling language' },
  { pattern: /\b(cookies?|data controller|data processor)\b/i, kind: 'privacy', weight: 1.8, label: 'Privacy operational references' },
  { pattern: /\b(GDPR|CCPA|CPRA|LGPD|POPIA|PIPEDA|PDPA)\b/i, kind: 'privacy', weight: 2.0, label: 'Privacy regulatory references' },
  { pattern: /\b(data subject|your rights|opt[-\s]?out|delete your data|right to know)\b/i, kind: 'privacy', weight: 1.8, label: 'Data-rights clauses' },
  { pattern: /\b(lawful basis|legal basis|legitimate interest|consent)\b.{0,20}\b(process|collect|use)\b/i, kind: 'privacy', weight: 1.9, label: 'Legal basis for processing' },
  { pattern: /\b(terms of service|terms of use|user agreement|terms and conditions)\b/i, kind: 'tos', weight: 3.0, label: 'Explicit terms-of-service heading' },
  { pattern: /\b(accept|agree)\b.{0,25}\b(terms|agreement|conditions)\b/i, kind: 'tos', weight: 1.8, label: 'Acceptance of terms language' },
  { pattern: /\b(arbitration|governing law|jurisdiction|class action waiver|venue)\b/i, kind: 'tos', weight: 2.2, label: 'Dispute-resolution clauses' },
  { pattern: /\b(limitation of liability|disclaimer of warranties?|as is|termination of (service|account))\b/i, kind: 'tos', weight: 2.0, label: 'Core contract-risk clauses' },
  { pattern: /\b(intellectual property|copyright|trademark|licen[cs]e grant)\b/i, kind: 'tos', weight: 1.6, label: 'IP/licensing clauses' },
]

// ─── Regulatory Compliance Patterns ─────────────────────────────────────────
//
// Detects references to specific privacy regulations and their requirements.
// Based on GDPR Articles 12-22, CCPA §1798.100-199, COPPA 16 CFR 312.

interface RegulatoryPattern {
  pattern: RegExp
  regulation: string
  article?: string
  description: string
  isCompliance: boolean
  weight: number
}

const REGULATORY_PATTERNS: RegulatoryPattern[] = [
  // ── GDPR ──
  { pattern: /\b(GDPR|General Data Protection Regulation)\b/i, regulation: 'GDPR', description: 'References GDPR compliance', isCompliance: true, weight: 2.0 },
  { pattern: /\b(data controller|data processor|joint controller)\b/i, regulation: 'GDPR', article: 'Art. 4', description: 'Defines controller/processor roles (GDPR Art. 4)', isCompliance: true, weight: 1.5 },
  { pattern: /\b(lawful basis|legal basis)\b.{0,20}\b(process|collect)\b/i, regulation: 'GDPR', article: 'Art. 6', description: 'States lawful basis for processing (GDPR Art. 6)', isCompliance: true, weight: 1.8 },
  { pattern: /\blegitimate interest\b/i, regulation: 'GDPR', article: 'Art. 6(1)(f)', description: 'Claims legitimate interest basis (GDPR Art. 6(1)(f))', isCompliance: true, weight: 1.2 },
  { pattern: /\bdata protection officer\b|DPO\b/i, regulation: 'GDPR', article: 'Art. 37', description: 'Designates DPO (GDPR Art. 37)', isCompliance: true, weight: 1.6 },
  { pattern: /\bdata protection impact assessment\b|DPIA\b/i, regulation: 'GDPR', article: 'Art. 35', description: 'Conducts DPIAs (GDPR Art. 35)', isCompliance: true, weight: 1.5 },
  { pattern: /\bright to (be forgotten|erasure)\b/i, regulation: 'GDPR', article: 'Art. 17', description: 'Provides right to erasure (GDPR Art. 17)', isCompliance: true, weight: 1.7 },
  { pattern: /\bright to (data\s+)?portability\b/i, regulation: 'GDPR', article: 'Art. 20', description: 'Provides data portability (GDPR Art. 20)', isCompliance: true, weight: 1.6 },
  { pattern: /\bsupervisory authority\b/i, regulation: 'GDPR', article: 'Art. 77', description: 'References supervisory authority complaints (GDPR Art. 77)', isCompliance: true, weight: 1.3 },
  { pattern: /\bstandard contractual clauses?\b|SCC\b/i, regulation: 'GDPR', article: 'Art. 46', description: 'Uses SCCs for transfers (GDPR Art. 46)', isCompliance: true, weight: 1.5 },
  { pattern: /\b(72\s+hours?|without undue delay)\b.{0,20}\b(breach|notification|notify)\b/i, regulation: 'GDPR', article: 'Art. 33', description: 'Meets breach notification timeline (GDPR Art. 33)', isCompliance: true, weight: 1.8 },

  // ── CCPA / CPRA ──
  { pattern: /\b(CCPA|California Consumer Privacy Act|CPRA|California Privacy Rights Act)\b/i, regulation: 'CCPA/CPRA', description: 'References CCPA/CPRA compliance', isCompliance: true, weight: 2.0 },
  { pattern: /\b(right to know|right to delete|right to opt.?out|right to correct)\b/i, regulation: 'CCPA/CPRA', description: 'Provides CCPA consumer rights', isCompliance: true, weight: 1.7 },
  { pattern: /\bdo not sell\b.{0,15}\b(my|personal)\b/i, regulation: 'CCPA/CPRA', description: 'Provides "Do Not Sell" option (CCPA §1798.120)', isCompliance: true, weight: 1.8 },
  { pattern: /\b(sensitive personal information|SPI)\b.{0,25}\b(limit|restrict|opt.?out)\b/i, regulation: 'CCPA/CPRA', description: 'Allows limiting sensitive personal information use (CPRA)', isCompliance: true, weight: 1.7 },
  { pattern: /\bglobal privacy control\b|GPC\b/i, regulation: 'CCPA/CPRA', description: 'Honors Global Privacy Control signals', isCompliance: true, weight: 1.8 },
  { pattern: /\bauthorized agent\b.{0,20}\b(submit|exercise|behalf)\b/i, regulation: 'CCPA/CPRA', description: 'Allows authorized agent requests (CCPA §1798.185)', isCompliance: true, weight: 1.3 },
  { pattern: /\bfinancial incentive\b.{0,20}\b(program|discount|loyalty)\b/i, regulation: 'CCPA/CPRA', description: 'Discloses financial incentive programs (CCPA §1798.125)', isCompliance: true, weight: 1.2 },

  // ── COPPA ──
  { pattern: /\b(COPPA|Children.?s Online Privacy Protection)\b/i, regulation: 'COPPA', description: 'References COPPA compliance', isCompliance: true, weight: 2.0 },
  { pattern: /\bverifiable parental consent\b/i, regulation: 'COPPA', description: 'Requires verifiable parental consent (COPPA §312.5)', isCompliance: true, weight: 1.8 },

  // ── Other regulations ──
  { pattern: /\b(PIPEDA|Personal Information Protection.{0,10}Electronic Documents)\b/i, regulation: 'PIPEDA', description: 'References Canadian PIPEDA', isCompliance: true, weight: 1.5 },
  { pattern: /\b(LGPD|Lei Geral de Prote[cç][aã]o de Dados)\b/i, regulation: 'LGPD', description: 'References Brazilian LGPD', isCompliance: true, weight: 1.5 },
  { pattern: /\b(POPIA|Protection of Personal Information Act)\b/i, regulation: 'POPIA', description: 'References South African POPIA', isCompliance: true, weight: 1.5 },
  { pattern: /\b(PDPA|Personal Data Protection Act)\b/i, regulation: 'PDPA', description: 'References PDPA compliance', isCompliance: true, weight: 1.5 },
  { pattern: /\b(HIPAA|Health Insurance Portability)\b/i, regulation: 'HIPAA', description: 'References HIPAA health data compliance', isCompliance: true, weight: 1.8 },
  { pattern: /\b(FERPA|Family Educational Rights)\b/i, regulation: 'FERPA', description: 'References FERPA student privacy', isCompliance: true, weight: 1.5 },
  { pattern: /\b(Virginia Consumer Data Protection|VCDPA|Colorado Privacy Act|CPA|Connecticut Data Privacy|CTDPA)\b/i, regulation: 'US State Laws', description: 'References US state privacy laws', isCompliance: true, weight: 1.4 },
]

// ─── Dark Pattern Language Detection ────────────────────────────────────────
//
// Based on FTC enforcement actions (2024), CPPA dark pattern guidelines,
// and research from UIGuard (UIST 2023) and GPT-3 dark pattern detection.

interface DarkPatternRule {
  pattern: RegExp
  category: string
  description: string
  severity: number
}

const DARK_PATTERN_RULES: DarkPatternRule[] = [
  // ── Forced action / no real choice ──
  { pattern: /\b(by (using|accessing|continuing)|your (use|continued use))\b.{0,25}\b(you (agree|accept|consent|acknowledge))\b/i, category: 'forced_action', description: 'Browsewrap: assumes consent through continued use', severity: 2.0 },
  { pattern: /\b(must|required to|shall)\b.{0,20}\b(agree|accept|consent)\b.{0,20}\b(all|entire|whole)\b/i, category: 'forced_action', description: 'Forces all-or-nothing consent with no granularity', severity: 2.2 },
  { pattern: /\b(cannot|unable to)\b.{0,20}\b(use|access|continue)\b.{0,20}\b(unless|without)\b.{0,20}\b(agree|accept|consent)\b/i, category: 'forced_action', description: 'Conditions service access on blanket consent', severity: 2.0 },

  // ── Obstruction / friction to opt out ──
  { pattern: /\b(contact us|email us|write to us|call us|send .{0,15} letter)\b.{0,25}\b(to\s+)?(opt.?out|delete|remove|unsubscribe|withdraw)\b/i, category: 'obstruction', description: 'Requires manual contact to exercise privacy rights', severity: 1.8 },
  { pattern: /\b(mail|certified mail|registered mail|postal)\b.{0,25}\b(request|opt.?out|delete|withdraw)\b/i, category: 'obstruction', description: 'Requires physical mail for privacy requests', severity: 2.2 },
  { pattern: /\b(30|45|60|90)\s+(day|business day)\b.{0,20}\b(to\s+)?(process|respond|fulfill|complete)\b/i, category: 'obstruction', description: 'Uses extended processing time for user requests', severity: 1.3 },

  // ── Misdirection / confusing language ──
  { pattern: /\b(we (may|might|could|reserve the right to))\b.{0,30}\b(at any time|without (prior )?notice|at our (sole )?discretion)\b/i, category: 'misdirection', description: 'Uses vague discretionary language to obscure data practices', severity: 1.8 },
  { pattern: /\b(including but not limited to|without limitation|among other things|and other)\b/i, category: 'misdirection', description: 'Uses open-ended language that expands scope beyond stated items', severity: 1.2 },
  { pattern: /\b(deemed|considered|treated as)\b.{0,15}\b(consent|agreement|acceptance)\b/i, category: 'misdirection', description: 'Constructs implied consent through assumed agreement', severity: 1.7 },

  // ── Sneaking / hidden terms ──
  { pattern: /\b(we\s+(may|will|can)\s+)?(change|modify|update|amend|revise)\b.{0,30}\b(without\s+(prior\s+)?notice|at\s+any\s+time|from\s+time\s+to\s+time)\b/i, category: 'sneaking', description: 'Allows silent changes to terms without notification', severity: 2.0 },
  { pattern: /\b(pre.?selected|pre.?checked|default|automatically\s+(enrolled|opted|subscribed))\b/i, category: 'sneaking', description: 'Uses pre-selected or default opt-in settings', severity: 1.8 },
  { pattern: /\b(your\s+responsibility|it\s+is\s+your\s+(duty|obligation))\b.{0,25}\b(review|check|monitor|read)\b/i, category: 'sneaking', description: 'Places burden on user to detect policy changes', severity: 1.5 },

  // ── Emotional manipulation ──
  { pattern: /\b(trust|safe|protect)\b.{0,15}\b(we|us|our)\b.{0,20}\b(value|care|committ?ed|dedicated)\b/i, category: 'emotional', description: 'Uses trust-building language without substantive commitments', severity: 0.8 },
]

// ─── Advanced Context Analysis ──────────────────────────────────────────────

const NEGATION = /\b(do\s+not|does\s+not|don['']t|doesn['']t|no|never|not|neither|nor|without|lack|absent)\b/i
const EXCEPTIONS = /\b(except|unless|subject to|as required by law|provided that|so long as|on condition|notwithstanding)\b/i
const WEAK_QUALIFIERS = /\b(may|might|typically|generally|where possible|in some cases|occasionally|sometimes|could|can)\b/i
const STRONG_COMMIT = /\b(we will|we shall|must|required|ensure|guarantee|always|commit|obligat)\b/i
const CONDITIONAL = /\b(if|when|where|provided that|in the event|should|in case)\b/i
const TEMPORAL_VAGUE = /\b(from time to time|periodically|occasionally|as needed|as appropriate|when necessary)\b/i
const TEMPORAL_SPECIFIC = /\b(\d+\s+(day|week|month|year)s?|annual(ly)?|quarterly|monthly|weekly|daily)\b/i

/**
 * Advanced negation scope detection.
 *
 * Instead of simply checking if the sentence contains a negation word,
 * this analyzes whether the negation actually applies to the matched
 * pattern by checking proximity and syntactic position.
 */
function negationAppliesToMatch(sentence: string, matchIndex: number): boolean {
  // Look for negation words within 60 characters before the match
  const prefix = sentence.slice(Math.max(0, matchIndex - 60), matchIndex)
  if (!NEGATION.test(prefix)) return false

  // Check there's no clause break (period, semicolon, "but", "however") between negation and match
  const clauseBreak = /[.;]|\b(but|however|although|though|yet|nevertheless|still)\b/i
  return !clauseBreak.test(prefix)
}

/**
 * Enhanced context multiplier using multi-sentence windows and
 * advanced negation scope detection.
 */
function contextMultiplier(window: ContextWindow, signal: RuleSignal, matchIndex: number): number {
  const { current, prev, next } = window

  if (signal === 'risk') {
    const negationApplies = negationAppliesToMatch(current, matchIndex)
    const hasExc = EXCEPTIONS.test(current)
    const hasConditional = CONDITIONAL.test(current)

    // Check adjacent sentences for negation/exception context
    const adjacentNegation = NEGATION.test(prev) || NEGATION.test(next)
    const adjacentException = EXCEPTIONS.test(prev) || EXCEPTIONS.test(next)

    if (negationApplies && hasExc) return 0.12
    if (negationApplies) return 0.10
    if (hasExc && hasConditional) return 0.70
    if (hasExc) return 0.80
    if (hasConditional) return 0.85
    if (adjacentNegation && !adjacentException) return 0.35
    return 1
  }

  // Safeguard signal
  let value = 1
  if (WEAK_QUALIFIERS.test(current)) value *= 0.65
  if (STRONG_COMMIT.test(current)) value *= 1.15
  if (TEMPORAL_VAGUE.test(current)) value *= 0.80
  if (TEMPORAL_SPECIFIC.test(current)) value *= 1.10
  if (CONDITIONAL.test(current)) value *= 0.75

  // Adjacent sentence reinforcement
  if (STRONG_COMMIT.test(prev) || STRONG_COMMIT.test(next)) value *= 1.05
  if (WEAK_QUALIFIERS.test(prev) || WEAK_QUALIFIERS.test(next)) value *= 0.90

  return clamp(value, 0.30, 1.35)
}

// ─── Backward-compatible simple context multiplier ──────────────────────────

// simpleContextMultiplier (legacy) removed to avoid unused symbol

// ─── TF-IDF Relevance Engine ────────────────────────────────────────────────
//
// Computes term importance to weight findings by their relative significance
// in the analyzed document vs. typical privacy policy language.

// Common privacy policy terms (approximates IDF from a large corpus)
const COMMON_TERMS = new Set([
  'data', 'information', 'personal', 'we', 'you', 'your', 'our', 'use',
  'may', 'will', 'service', 'services', 'provide', 'collect', 'share',
  'third', 'party', 'privacy', 'policy', 'terms', 'agree', 'consent',
  'access', 'account', 'user', 'users', 'right', 'rights', 'please',
  'including', 'such', 'also', 'any', 'other', 'not', 'with', 'for',
  'that', 'this', 'the', 'and', 'have', 'from', 'about',
])

function buildTfIdf(text: string): Map<string, TfIdfEntry> {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2)
  const totalWords = words.length || 1
  const termCounts = new Map<string, number>()

  for (const word of words) {
    termCounts.set(word, (termCounts.get(word) ?? 0) + 1)
  }

  const entries = new Map<string, TfIdfEntry>()
  for (const [term, count] of termCounts) {
    const tf = count / totalWords
    // Higher IDF for uncommon terms (not in standard privacy policy vocabulary)
    const idf = COMMON_TERMS.has(term) ? 0.3 : 1.0 + Math.log(1 + 1 / (count + 1))
    entries.set(term, { term, tf, idf, tfidf: tf * idf })
  }

  return entries
}

/**
 * Computes a relevance boost for a finding based on TF-IDF scores of
 * terms in the matched sentence. High-importance (rare) terms get
 * a boost; generic boilerplate text gets dampened.
 */
function tfidfRelevance(sentence: string, tfidfIndex: Map<string, TfIdfEntry>): number {
  const words = sentence.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2)
  if (words.length === 0) return 1.0

  let totalScore = 0
  let count = 0
  for (const word of words) {
    const entry = tfidfIndex.get(word)
    if (entry) {
      totalScore += entry.tfidf
      count++
    }
  }

  const avgRelevance = count > 0 ? totalScore / count : 0
  // Map to a multiplier: low relevance (boilerplate) → 0.7, high relevance → 1.3
  if (avgRelevance < TFIDF_MIN_RELEVANCE) return 0.75
  return clamp(0.85 + avgRelevance * 3.5, 0.75, 1.35)
}

// ─── Readability Scoring ────────────────────────────────────────────────────
//
// Flesch-Kincaid Grade Level adapted for privacy policy text.
// Lower scores = easier to read. Privacy policies averaging 14+ are
// deliberately obfuscatory (college+ reading level).

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length <= 2) return 1

  let count = 0
  const vowels = /[aeiouy]/
  let prevVowel = false

  for (let i = 0; i < w.length; i++) {
    const isVowel = vowels.test(w[i])
    if (isVowel && !prevVowel) count++
    prevVowel = isVowel
  }

  // Silent 'e' at end
  if (w.endsWith('e') && count > 1) count--
  // '-le' ending counts as syllable
  if (w.endsWith('le') && w.length > 2 && !/[aeiouy]/.test(w[w.length - 3])) count++

  return Math.max(1, count)
}

function fleschKincaidGrade(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const words = text.split(/\s+/).filter(w => w.replace(/[^a-z]/gi, '').length > 0)

  if (sentences.length === 0 || words.length === 0) return 0

  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0)
  const avgWordsPerSentence = words.length / sentences.length
  const avgSyllablesPerWord = totalSyllables / words.length

  // Flesch-Kincaid Grade Level formula
  return 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59
}

/**
 * Returns a readability penalty/bonus for scoring.
 * Grade 8-12: neutral (typical legal text)
 * Grade 12-16: slight penalty (harder to understand)
 * Grade 16+: significant penalty (deliberately obfuscatory)
 * Grade < 8: bonus (accessible language)
 */
function readabilityFactor(grade: number): number {
  if (grade >= 18) return -2.5
  if (grade >= 16) return -1.8
  if (grade >= 14) return -1.0
  if (grade >= 12) return -0.3
  if (grade < 6) return 1.0
  if (grade < 8) return 0.5
  return 0
}

// ─── Additional Readability Indices ──────────────────────────────────────
//
// Ensemble of readability formulas for more robust scoring.
// Each formula has different biases; averaging produces stable results.

function countComplexWords(text: string): number {
  const words = text.split(/\s+/).filter(w => w.replace(/[^a-z]/gi, '').length > 0)
  return words.filter(w => countSyllables(w) >= 3).length
}

function gunningFogIndex(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const words = text.split(/\s+/).filter(w => w.replace(/[^a-z]/gi, '').length > 0)
  if (sentences.length === 0 || words.length === 0) return 0
  const complexWords = countComplexWords(text)
  return 0.4 * (words.length / sentences.length + 100 * (complexWords / words.length))
}

function colemanLiauIndex(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const words = text.split(/\s+/).filter(w => w.replace(/[^a-z]/gi, '').length > 0)
  if (sentences.length === 0 || words.length === 0) return 0
  const chars = words.reduce((sum, w) => sum + w.replace(/[^a-z]/gi, '').length, 0)
  const L = (chars / words.length) * 100  // avg letters per 100 words
  const S = (sentences.length / words.length) * 100  // avg sentences per 100 words
  return 0.0588 * L - 0.296 * S - 15.8
}

function automatedReadabilityIndex(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const words = text.split(/\s+/).filter(w => w.replace(/[^a-z]/gi, '').length > 0)
  if (sentences.length === 0 || words.length === 0) return 0
  const chars = words.reduce((sum, w) => sum + w.replace(/[^a-z]/gi, '').length, 0)
  return 4.71 * (chars / words.length) + 0.5 * (words.length / sentences.length) - 21.43
}

function smogIndex(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  if (sentences.length === 0) return 0
  const polysyllables = countComplexWords(text)
  return 1.0430 * Math.sqrt(polysyllables * (30 / sentences.length)) + 3.1291
}

function readabilityEnsemble(text: string): ReadabilityDetails {
  const fk = fleschKincaidGrade(text)
  const fog = gunningFogIndex(text)
  const cli = colemanLiauIndex(text)
  const ari = automatedReadabilityIndex(text)
  const sm = smogIndex(text)
  // Average FK, Fog, CLI, ARI for the ensemble grade
  const averageGrade = (fk + fog + cli + ari) / 4
  return {
    fleschKincaid: Math.round(fk * 10) / 10,
    gunningFog: Math.round(fog * 10) / 10,
    colemanLiau: Math.round(cli * 10) / 10,
    ari: Math.round(ari * 10) / 10,
    smog: Math.round(sm * 10) / 10,
    averageGrade: Math.round(averageGrade * 10) / 10,
  }
}

// ─── Vague & Misleading Language Detection ──────────────────────────────
//
// Based on ACL research on hedge detection and vagueness in privacy policies.
// Detects weasel words, double negatives, scope expansion, passive evasion,
// and responsibility-shifting language.

const VAGUE_PATTERNS: { pattern: RegExp; label: string; weight: number }[] = [
  { pattern: /\b(it is believed|some people|widely regarded|arguably|purportedly|supposedly|presumably)\b/i, label: 'Weasel words', weight: 1.0 },
  { pattern: /\b(not\s+un\w+|cannot\s+deny|not\s+impossible|never\s+(?:not|without))\b/i, label: 'Double negatives', weight: 1.2 },
  { pattern: /\b(including but not limited to|without limitation|among other things)\b/i, label: 'Scope expansion', weight: 0.8 },
  { pattern: /\bsuch as\b.{0,30}\b(and more|and others?|etc\.?)\b/i, label: 'Open-ended list', weight: 0.7 },
  { pattern: /\b(and\/or|and other)\b/i, label: 'Ambiguous conjunction', weight: 0.5 },
  { pattern: /\bdata\s+(?:is|are|was|were|may be|might be)\s+(?:collected|shared|processed|used|transferred|stored)\b/i, label: 'Passive voice evasion', weight: 0.9 },
  { pattern: /\b(?:you\s+(?:are|is)\s+(?:responsible|liable)|at\s+your\s+(?:own\s+)?risk|user\s+assumes?)\b/i, label: 'Responsibility shifting', weight: 1.1 },
  { pattern: /\b(to the (?:fullest|maximum) extent (?:permitted|allowed))\b/i, label: 'Maximum legal shield', weight: 1.0 },
  { pattern: /\b(as\s+(?:we|it)\s+(?:see|deem)\s+(?:fit|appropriate|necessary))\b/i, label: 'Discretionary language', weight: 1.0 },
  { pattern: /\b(certain|various|numerous|applicable|relevant|appropriate)\b.{0,20}\b(data|information|circumstances|situations)\b/i, label: 'Vague quantifiers', weight: 0.6 },
]

function detectVagueLanguage(text: string): VagueLanguageResult {
  const sentences = splitSentences(normalize(text))
  const instances: string[] = []
  let totalWeight = 0

  for (const sentence of sentences) {
    for (const rule of VAGUE_PATTERNS) {
      if (rule.pattern.test(sentence)) {
        totalWeight += rule.weight
        if (instances.length < 8 && !instances.includes(rule.label)) {
          instances.push(rule.label)
        }
      }
    }
  }

  const density = sentences.length > 0 ? (totalWeight / sentences.length) * 100 : 0
  // Score: 0-100 based on density and total instances
  const score = Math.round(clamp(density * 3 + totalWeight * 2, 0, 100))

  return { score, instances, density: Math.round(density * 10) / 10 }
}

// ─── Cosine Similarity & Policy Completeness ────────────────────────────
//
// Compares submitted document against a reference "ideal" privacy policy
// term distribution derived from GDPR Art. 13-14 requirements.

const REFERENCE_POLICY_TERMS = new Map<string, number>([
  // Core privacy concepts
  ['controller', 0.08], ['processor', 0.06], ['personal', 0.09], ['data', 0.10],
  ['purpose', 0.07], ['legal', 0.05], ['basis', 0.05], ['consent', 0.08],
  ['legitimate', 0.04], ['interest', 0.04], ['recipients', 0.06], ['transfer', 0.06],
  ['retention', 0.07], ['period', 0.05], ['rights', 0.08], ['access', 0.06],
  ['deletion', 0.07], ['erasure', 0.06], ['portability', 0.05], ['objection', 0.04],
  ['withdraw', 0.05], ['complaint', 0.04], ['supervisory', 0.04], ['authority', 0.04],
  ['automated', 0.05], ['decision', 0.04], ['profiling', 0.05], ['children', 0.05],
  ['security', 0.07], ['encryption', 0.05], ['breach', 0.05], ['notification', 0.05],
  ['cookies', 0.05], ['tracking', 0.04], ['third', 0.06], ['party', 0.06],
  ['sharing', 0.05], ['disclosure', 0.05], ['collection', 0.07], ['processing', 0.06],
  ['protection', 0.06], ['officer', 0.04], ['contact', 0.04], ['update', 0.03],
  ['amendment', 0.03], ['notice', 0.04], ['policy', 0.06], ['privacy', 0.08],
  ['minimize', 0.04], ['anonymize', 0.04], ['pseudonymize', 0.03],
])

function cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (const [term, valA] of vecA) {
    const valB = vecB.get(term) ?? 0
    dotProduct += valA * valB
    normA += valA * valA
  }
  for (const [, valB] of vecB) normB += valB * valB

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator > 0 ? dotProduct / denominator : 0
}

function computeCompletenessScore(text: string): number {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2)
  const totalWords = words.length || 1
  const termCounts = new Map<string, number>()

  for (const word of words) {
    termCounts.set(word, (termCounts.get(word) ?? 0) + 1)
  }

  // Build TF vector for the document (only for terms in reference)
  const docVector = new Map<string, number>()
  for (const [term] of REFERENCE_POLICY_TERMS) {
    const count = termCounts.get(term) ?? 0
    docVector.set(term, count / totalWords)
  }

  const similarity = cosineSimilarity(docVector, REFERENCE_POLICY_TERMS)
  return Math.round(clamp(similarity * 100, 0, 100))
}

// ─── N-gram Boilerplate Detection ───────────────────────────────────────
//
// Detects template/boilerplate language using bigram and trigram matching.

const BOILERPLATE_NGRAMS = new Set([
  'we may collect', 'we may use', 'we may share', 'we may disclose',
  'from time to', 'time to time', 'at our sole', 'our sole discretion',
  'sole discretion we', 'to the fullest', 'the fullest extent',
  'fullest extent permitted', 'extent permitted by', 'permitted by law',
  'by using this', 'using this service', 'this service you',
  'service you agree', 'you agree to', 'we reserve the',
  'reserve the right', 'the right to', 'right to change',
  'without prior notice', 'at any time', 'in our discretion',
  'we will not', 'we do not', 'your continued use',
  'continued use of', 'use of the', 'of the service',
  'as described in', 'described in this', 'in this policy',
  'this privacy policy', 'personal information we', 'information we collect',
  'we collect from', 'how we use', 'how we share',
  'we use your', 'use your personal', 'your personal information',
  'third party services', 'party services that', 'may contain links',
  'not responsible for', 'responsible for the', 'for the privacy',
  'subject to the', 'to the terms', 'terms and conditions',
  'in accordance with', 'accordance with applicable', 'with applicable law',
  'please contact us', 'contact us at', 'if you have',
  'you have any', 'have any questions',
])

function extractNgrams(text: string, n: number): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 0)
  const ngrams: string[] = []
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.push(words.slice(i, i + n).join(' '))
  }
  return ngrams
}

function computeBoilerplateScore(text: string): BoilerplateResult {
  const trigrams = extractNgrams(text, 3)
  if (trigrams.length === 0) return { score: 0, uniqueness: 100, matches: [] }

  const matchedSet = new Set<string>()
  let matchCount = 0

  for (const ngram of trigrams) {
    if (BOILERPLATE_NGRAMS.has(ngram)) {
      matchCount++
      if (matchedSet.size < 6) matchedSet.add(ngram)
    }
  }

  const score = Math.round(clamp((matchCount / trigrams.length) * 100 * 8, 0, 100))
  const uniqueness = 100 - score

  return { score, uniqueness, matches: [...matchedSet] }
}

// ─── Sentiment Polarity Detection ───────────────────────────────────────
//
// Detects positive framing of negative data practices — a subtle dark pattern.

const POSITIVE_FRAMERS = /\b(to improve your experience|to better serve you|to enhance our services?|for your convenience|to personalize|to provide you with|to help us|for your benefit|to protect you|to ensure quality)\b/i
const NEGATIVE_PRACTICES = /\b(collect|share|sell|track|monitor|profile|disclose|transfer|retain|store|process|gather|record|log|access)\b/i

function detectSentimentMismatch(text: string): string[] {
  const sentences = splitSentences(normalize(text))
  const mismatches: string[] = []

  for (const sentence of sentences) {
    const hasPositive = POSITIVE_FRAMERS.test(sentence)
    const hasNegative = NEGATIVE_PRACTICES.test(sentence)

    if (hasPositive && hasNegative) {
      const truncated = sentence.length > 120 ? sentence.slice(0, 117) + '...' : sentence
      if (mismatches.length < 5) {
        mismatches.push(truncated)
      }
    }
  }

  return mismatches
}

// ─── Utility Functions ──────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)
}

function splitParagraphs(text: string): string[][] {
  const paragraphs = text.split(/\n\s*\n/)
  return paragraphs.map(p => splitSentences(normalize(p)))
}

function truncateQuote(sentence: string): string {
  const compact = sentence.replace(/\s+/g, ' ').trim()
  return compact.length <= 240 ? compact : `${compact.slice(0, 237)}...`
}

function severityFromScore(score: number): SeverityLevel {
  if (score >= 82) return 'good'
  if (score >= 60) return 'moderate'
  if (score >= 38) return 'poor'
  return 'critical'
}

// ─── Scoring Algorithm ──────────────────────────────────────────────────────
//
// Enhanced scoring with Bayesian confidence adjustment and multi-signal fusion.

interface ScoringParams {
  riskPoints: number
  safeguardPoints: number
  riskSignals: number
  safeguardSignals: number
  profile: DocumentKind
  readabilityGrade: number
  regulatoryCount: number
  darkPatternCount: number
  vagueScore: number
  completenessScore: number
  boilerplateScore: number
  sentimentMismatches: number
}

function scoreFromEvidence(params: ScoringParams): number {
  const {
    riskPoints, safeguardPoints, riskSignals, safeguardSignals,
    profile, readabilityGrade, regulatoryCount, darkPatternCount,
    vagueScore, completenessScore, boilerplateScore, sentimentMismatches,
  } = params

  // Base score depends on document type
  let score = profile === 'tos' ? 66 : 72

  // Core evidence scoring with non-linear diminishing returns
  const effectiveRisk = riskPoints > 3 ? 3 + (riskPoints - 3) * 0.7 : riskPoints
  const effectiveSafeguard = safeguardPoints > 3 ? 3 + (safeguardPoints - 3) * 0.7 : safeguardPoints

  score += effectiveSafeguard * 6.5
  score -= effectiveRisk * 8.8

  // Signal count adjustments (capped)
  score += Math.min(5, safeguardSignals * 0.7)
  score -= Math.min(7, riskSignals * 0.85)

  // Mixed signal penalty
  if (riskSignals > 0 && safeguardSignals > 0) score -= 0.6

  // Readability adjustment: obfuscatory text penalizes score
  score += readabilityFactor(readabilityGrade)

  // Regulatory compliance bonus: more regulation references = likely more transparent
  score += Math.min(4, regulatoryCount * 0.8)

  // Dark pattern penalty: each detected pattern reduces trust
  score -= Math.min(6, darkPatternCount * 1.2)

  // ── Ensemble Voters (new advanced scoring dimensions) ──

  // Vagueness penalty: vague language undermines trust
  score -= Math.min(4, vagueScore / 25)

  // Completeness bonus/penalty: comprehensive policies score higher
  if (completenessScore > 70) score += 2
  else if (completenessScore < 30) score -= 2

  // Boilerplate penalty: template language = low effort
  if (boilerplateScore > 60) score -= 1.5

  // Sentiment mismatch penalty: positive framing of negative practices
  score -= Math.min(3, sentimentMismatches * 0.6)

  return Math.round(clamp(score, 5, 95))
}

function docCoverageFactor(
  category: CategoryKey,
  analysisTarget: AnalysisTarget,
  documentKind: DocumentKind,
): number {
  const tosContext = analysisTarget === 'tos' || documentKind === 'tos'
  if (!tosContext) return 1
  if (category === 'retention') return 0.55
  if (category === 'children') return 0.6
  if (category === 'data_collection') return 0.8
  if (category === 'third_party') return 0.9
  return 1
}

// ─── Bayesian Confidence Scoring ────────────────────────────────────────────
//
// Replaces the linear confidence metric with a Bayesian-inspired model
// that factors in evidence strength, coverage, and consistency.

function bayesianConfidence(
  riskSignals: number,
  safeguardSignals: number,
  hasQuote: boolean,
  missingCoverage: boolean,
  tfidfStrength: number,
  regulatoryCount: number,
  documentWordCount: number,
): number {
  const totalSignals = riskSignals + safeguardSignals

  // Prior: base confidence from signal count (logarithmic saturation)
  let prior = 30 + 50 * (1 - Math.exp(-totalSignals / 6))

  // Evidence quality factors
  if (hasQuote) prior += 7
  if (missingCoverage) prior -= 10

  // TF-IDF strength: higher relevance = higher confidence in findings
  prior += clamp(tfidfStrength * 8, -5, 8)

  // Regulatory references increase confidence in analysis
  prior += Math.min(6, regulatoryCount * 1.5)

  // Document length factor: very short docs have lower confidence
  if (documentWordCount < 100) prior -= 15
  else if (documentWordCount < 300) prior -= 8
  else if (documentWordCount > 2000) prior += 5

  // Consistency bonus: signals from both sides = more thorough analysis
  if (riskSignals > 0 && safeguardSignals > 0) prior += 4

  return Math.round(clamp(prior, 12, 97))
}

// ─── Insights Builder ───────────────────────────────────────────────────────

function buildInsights(
  score: number,
  riskSignals: number,
  safeguardSignals: number,
  confidenceScore: number,
  missingCoverage: boolean,
  readabilityGrade: number,
  regulatorySignals: string[],
  darkPatterns: string[],
  topRisk?: string,
  topSafe?: string,
): string[] {
  const out: string[] = []

  // Primary posture assessment
  if (score <= 30) out.push('Critical-risk posture with severe adverse clauses.')
  else if (score <= 37) out.push('High-risk posture with strong adverse clauses.')
  else if (score >= 85) out.push('Strong posture with clear, well-documented safeguards.')
  else if (score >= 82) out.push('Good posture with clear safeguards.')
  else if (score >= 60) out.push('Mixed posture with both protections and risks.')
  else out.push('Below-average posture with more risks than safeguards.')

  // Top findings
  if (topRisk) out.push(`Primary risk driver: ${topRisk}.`)
  if (topSafe) out.push(`Primary safeguard: ${topSafe}.`)

  // Readability insight
  if (readabilityGrade >= 16) {
    out.push(`Readability grade ${readabilityGrade.toFixed(1)}: text is deliberately complex (college+ level).`)
  } else if (readabilityGrade >= 13) {
    out.push(`Readability grade ${readabilityGrade.toFixed(1)}: text requires advanced reading level.`)
  }

  // Coverage gap
  if (missingCoverage) out.push('Coverage gap detected: key disclosures are absent.')

  // Regulatory compliance
  if (regulatorySignals.length >= 3) {
    out.push(`References ${regulatorySignals.length} regulatory frameworks, suggesting compliance awareness.`)
  } else if (regulatorySignals.length === 0) {
    out.push('No specific regulatory framework references detected.')
  }

  // Dark patterns
  if (darkPatterns.length >= 2) {
    out.push(`Detected ${darkPatterns.length} dark pattern indicators in the text.`)
  }

  // Confidence and mixed signals
  if (riskSignals > 0 && safeguardSignals > 0) {
    out.push('Clauses include both commitments and exceptions; verify edge-case language.')
  }
  out.push(`Detection confidence: ${confidenceScore}%.`)

  return out.slice(0, 6)
}

// ─── Evidence Aggregation ───────────────────────────────────────────────────

function addEvidence(target: Map<string, RuleEvidence>, evidence: RuleEvidence): void {
  const current = target.get(evidence.finding)
  if (!current) {
    target.set(evidence.finding, evidence)
    return
  }
  target.set(evidence.finding, {
    finding: current.finding,
    signal: current.signal,
    score: current.score + evidence.score,
    quote: current.quote.length >= evidence.quote.length ? current.quote : evidence.quote,
  })
}

// ─── Regulatory Signal Detection ────────────────────────────────────────────

function detectRegulatorySignals(text: string): RegulatoryMatch[] {
  const matches: RegulatoryMatch[] = []
  const seen = new Set<string>()

  for (const rule of REGULATORY_PATTERNS) {
    if (!rule.pattern.test(text)) continue
    const key = `${rule.regulation}:${rule.description}`
    if (seen.has(key)) continue
    seen.add(key)
    matches.push({
      regulation: rule.regulation,
      article: rule.article,
      description: rule.description,
      isCompliance: rule.isCompliance,
    })
  }

  return matches
}

// ─── Dark Pattern Detection ─────────────────────────────────────────────────

function detectDarkPatterns(text: string): DarkPatternMatch[] {
  const matches: DarkPatternMatch[] = []
  const sentences = splitSentences(text)

  for (const sentence of sentences) {
    for (const rule of DARK_PATTERN_RULES) {
      if (!rule.pattern.test(sentence)) continue
      matches.push({
        pattern: rule.description,
        category: rule.category,
        severity: rule.severity,
      })
    }
  }

  // Deduplicate by pattern description
  const seen = new Set<string>()
  return matches.filter(m => {
    if (seen.has(m.pattern)) return false
    seen.add(m.pattern)
    return true
  })
}

// ─── Cross-Category Inconsistency Detection ─────────────────────────────────

export function detectInconsistencies(
  results: Record<CategoryKey, HeuristicResult>,
): string[] {
  const inconsistencies: string[] = []

  // If data collection is high-risk but third_party claims no sharing
  if (results.data_collection.riskSignals >= 3 && results.third_party.score >= 80) {
    inconsistencies.push(
      'Extensive data collection detected but third-party sharing claims are very positive — verify if all collected data stays in-house.',
    )
  }

  // If security is high but data collection is invasive
  if (results.security.score >= 80 && results.data_collection.score <= 35) {
    inconsistencies.push(
      'Strong security measures claimed alongside highly invasive data collection — security doesn\'t mitigate excessive collection.',
    )
  }

  // If user rights are strong but retention is poor
  if (results.user_rights.score >= 75 && results.retention.score <= 35) {
    inconsistencies.push(
      'User rights appear strong but retention policy is poor — deletion rights may be undermined by indefinite retention.',
    )
  }

  // If children protection is claimed but data collection is extensive
  if (results.children.safeguardSignals >= 2 && results.data_collection.riskSignals >= 4) {
    inconsistencies.push(
      'Children safeguards are claimed but data collection is extensive — verify children data is truly excluded.',
    )
  }

  // If no regulatory references but claims strong compliance
  const avgScore = Object.values(results).reduce((s, r) => s + r.score, 0) / 6
  const hasRegulatory = Object.values(results).some(r => (r.regulatorySignals?.length ?? 0) > 0)
  if (avgScore >= 75 && !hasRegulatory) {
    inconsistencies.push(
      'High scores across categories but no regulatory framework references — claims may lack legal backing.',
    )
  }

  return inconsistencies.slice(0, 4)
}

// ─── Document Type Assessment ───────────────────────────────────────────────

export function assessDocumentType(
  text: string,
  sourceHint?: string,
  target: AnalysisTarget = 'auto',
): DocumentAssessment {
  const normalized = normalize(text)
  const words = normalized ? normalized.split(/\s+/).length : 0
  let privacyScore = 0
  let tosScore = 0
  let privacySignals = 0
  let tosSignals = 0
  const labels: { label: string; weight: number }[] = []

  for (const rule of DOC_RULES) {
    if (!rule.pattern.test(normalized)) continue
    if (rule.kind === 'privacy') {
      privacyScore += rule.weight
      privacySignals += 1
    } else {
      tosScore += rule.weight
      tosSignals += 1
    }
    labels.push({ label: rule.label, weight: rule.weight })
  }

  const lowerSource = sourceHint?.toLowerCase() ?? ''
  if (/(privacy|data-policy|privacy-policy|privacynotice)/.test(lowerSource)) {
    privacyScore += 1.4
    labels.push({ label: 'URL suggests privacy policy content', weight: 1.4 })
  }
  if (/(terms|tos|terms-of-service|terms-of-use|user-agreement|eula)/.test(lowerSource)) {
    tosScore += 1.4
    labels.push({ label: 'URL suggests terms-of-service content', weight: 1.4 })
  }

  let kind: DocumentKind = 'unknown'
  if (privacyScore >= 4 && tosScore >= 4) kind = 'mixed'
  else if (privacyScore >= 4 && privacyScore >= tosScore * 1.35) kind = 'privacy_policy'
  else if (tosScore >= 4 && tosScore >= privacyScore * 1.35) kind = 'tos'
  else if (privacyScore >= 2.8 && tosScore < 2.8) kind = 'privacy_policy'
  else if (tosScore >= 2.8 && privacyScore < 2.8) kind = 'tos'
  else if (target === 'privacy_policy' && privacyScore >= 2.2) kind = 'privacy_policy'
  else if (target === 'tos' && tosScore >= 2.2) kind = 'tos'

  let conf = 30 + Math.max(privacyScore, tosScore) * 8 + Math.abs(privacyScore - tosScore) * 4
  if (kind === 'mixed') conf -= 6
  if (kind === 'unknown') conf -= 14
  if (words < 120) conf -= 12
  if (target !== 'auto' && kind === target) conf += 4
  conf = clamp(conf, 5, 98)

  return {
    kind,
    confidence: Math.round(conf),
    isLikelyPolicyOrTos: kind !== 'unknown' && words >= 90 && Math.max(privacyScore, tosScore) >= 3,
    signals: labels.sort((a, b) => b.weight - a.weight).slice(0, 6).map((x) => x.label),
    privacySignalCount: privacySignals,
    tosSignalCount: tosSignals,
  }
}

// ─── Core Category Analysis ─────────────────────────────────────────────────

/**
 * Shallow analysis: basic keyword presence only, no advanced algorithms.
 * Used for documents that are not likely privacy policies or ToS.
 */
function analyzeCategoryShallow(
  text: string,
  category: CategoryKey,
  options: AnalyzeAllOptions = {},
): HeuristicResult {
  const analysisTarget = options.analysisTarget ?? 'auto'
  const documentKind = options.documentKind ?? 'unknown'
  const normalized = normalize(text)
  const rules = BASE_RULES[category]
  const evidence = new Map<string, RuleEvidence>()

  let riskPoints = 0
  let safeguardPoints = 0
  let riskSignals = 0
  let safeguardSignals = 0

  // Simple pattern matching without context windows or TF-IDF
  for (const rule of rules) {
    if (!rule.pattern.test(normalized)) continue
    const adjusted = rule.weight * 0.5  // Reduce weight for shallow analysis
    if (rule.signal === 'risk') {
      riskPoints += adjusted
      riskSignals += 1
    } else {
      safeguardPoints += adjusted
      safeguardSignals += 1
    }
    addEvidence(evidence, {
      finding: rule.finding,
      signal: rule.signal,
      score: adjusted,
      quote: '',
    })
  }

  // Coverage check only
  const coverage = COVERAGE[category]
  const hasCoverage = coverage.keywords.some((pattern) => pattern.test(normalized))
  if (!hasCoverage) {
    const penalty = coverage.penalty * docCoverageFactor(category, analysisTarget, documentKind)
    riskPoints += penalty
    riskSignals += 1
    addEvidence(evidence, {
      finding: coverage.finding,
      signal: 'risk',
      score: penalty,
      quote: '',
    })
  }

  const score = scoreFromEvidence({
    riskPoints, safeguardPoints, riskSignals, safeguardSignals,
    profile: documentKind, readabilityGrade: 10,
    regulatoryCount: 0, darkPatternCount: 0,
    vagueScore: 0, completenessScore: 50,
    boilerplateScore: 0, sentimentMismatches: 0,
  })

  const ranked = [...evidence.values()].sort((a, b) => b.score - a.score)
  const findings = ranked.map(x => x.finding).filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 3)

  return {
    severity: severityFromScore(score),
    findings: findings.length > 0 ? findings : ['Document does not appear to be a privacy policy — shallow analysis performed'],
    quote: '',
    score,
    riskSignals,
    safeguardSignals,
    confidence: 15,
    insights: ['Shallow analysis: document does not appear to be a privacy policy or terms of service.'],
  }
}

/**
 * Deep analysis: full pipeline with all advanced algorithms.
 * Used for confirmed privacy policies and terms of service.
 */
export function analyzeCategory(
  text: string,
  category: CategoryKey,
  options: AnalyzeAllOptions = {},
): HeuristicResult {
  // Route to shallow analysis if depth is set to shallow
  if (options.analysisDepth === 'shallow') {
    return analyzeCategoryShallow(text, category, options)
  }

  const analysisTarget = options.analysisTarget ?? 'auto'
  const documentKind = options.documentKind ?? 'unknown'
  const normalized = normalize(text)
  const sentences = splitSentences(normalized)
  const paragraphs = splitParagraphs(text)
  const rules = BASE_RULES[category]
  const evidence = new Map<string, RuleEvidence>()
  const ruleHits = new Map<PatternRule, number>()

  // Build TF-IDF index for relevance weighting
  const tfidfIndex = buildTfIdf(normalized)

  // ── Multi-Index Readability Ensemble ──
  const readability = readabilityEnsemble(normalized)
  const readabilityGrade = readability.averageGrade

  // Detect regulatory signals and dark patterns
  const regulatoryMatches = detectRegulatorySignals(normalized)
  const darkPatternMatches = detectDarkPatterns(normalized)

  // ── New Advanced Analysis Passes ──
  const vagueResult = detectVagueLanguage(normalized)
  const completeness = computeCompletenessScore(normalized)
  const boilerplate = computeBoilerplateScore(normalized)
  const sentimentMismatches = detectSentimentMismatch(normalized)

  let riskPoints = 0
  let safeguardPoints = 0
  let riskSignals = 0
  let safeguardSignals = 0
  let totalTfidfStrength = 0
  let tfidfCount = 0

  // Process with multi-sentence context windows
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i]
    const window: ContextWindow = {
      prev: i > 0 ? sentences[i - 1] : '',
      current: sentence,
      next: i < sentences.length - 1 ? sentences[i + 1] : '',
      paragraph: sentence,
    }

    // Find containing paragraph for broader context
    for (const para of paragraphs) {
      if (para.some(s => s === sentence)) {
        window.paragraph = para.join(' ')
        break
      }
    }

    for (const rule of rules) {
      const match = rule.pattern.exec(sentence)
      if (!match) continue
      const hits = ruleHits.get(rule) ?? 0
      if (hits >= MAX_HITS_PER_RULE) continue
      ruleHits.set(rule, hits + 1)

      const ctxMult = contextMultiplier(window, rule.signal, match.index)
      const relevanceMult = tfidfRelevance(sentence, tfidfIndex)
      const adjusted = rule.weight * ctxMult * relevanceMult

      totalTfidfStrength += relevanceMult
      tfidfCount++

      if (adjusted < 0.15) continue

      if (rule.signal === 'risk') {
        riskPoints += adjusted
        riskSignals += 1
      } else {
        safeguardPoints += adjusted
        safeguardSignals += 1
      }

      addEvidence(evidence, {
        finding: rule.finding,
        signal: rule.signal,
        score: adjusted,
        quote: truncateQuote(sentence),
      })
    }
  }

  // Coverage check
  let missingCoverage = false
  const coverage = COVERAGE[category]
  const hasCoverage = coverage.keywords.some((pattern) => pattern.test(normalized))
  if (!hasCoverage) {
    missingCoverage = true
    const penalty = coverage.penalty * docCoverageFactor(category, analysisTarget, documentKind)
    riskPoints += penalty
    riskSignals += 1
    addEvidence(evidence, {
      finding: coverage.finding,
      signal: 'risk',
      score: penalty,
      quote: '',
    })
  }

  // Add findings from new advanced detectors
  if (vagueResult.score >= 40) {
    addEvidence(evidence, {
      finding: `High vague language density detected (${vagueResult.instances.slice(0, 3).join(', ')})`,
      signal: 'risk',
      score: vagueResult.score / 30,
      quote: '',
    })
  }

  if (boilerplate.score >= 50) {
    addEvidence(evidence, {
      finding: 'Policy appears largely template-based with limited customization',
      signal: 'risk',
      score: boilerplate.score / 40,
      quote: '',
    })
  }

  if (sentimentMismatches.length >= 2) {
    addEvidence(evidence, {
      finding: `Uses positive language to frame ${sentimentMismatches.length} invasive data practices`,
      signal: 'risk',
      score: sentimentMismatches.length * 0.5,
      quote: sentimentMismatches[0] ?? '',
    })
  }

  if (completeness >= 75) {
    addEvidence(evidence, {
      finding: 'Policy demonstrates comprehensive coverage of privacy topics',
      signal: 'safeguard',
      score: 1.5,
      quote: '',
    })
  }

  const avgTfidfStrength = tfidfCount > 0 ? totalTfidfStrength / tfidfCount : 1.0
  const wc = normalized.split(/\s+/).length

  const score = scoreFromEvidence({
    riskPoints,
    safeguardPoints,
    riskSignals,
    safeguardSignals,
    profile: documentKind,
    readabilityGrade,
    regulatoryCount: regulatoryMatches.length,
    darkPatternCount: darkPatternMatches.length,
    vagueScore: vagueResult.score,
    completenessScore: completeness,
    boilerplateScore: boilerplate.score,
    sentimentMismatches: sentimentMismatches.length,
  })
  const severity = severityFromScore(score)

  const ranked = [...evidence.values()].sort((a, b) => {
    if (a.signal !== b.signal) return a.signal === 'risk' ? -1 : 1
    return b.score - a.score
  })
  const findings = ranked
    .map((x) => x.finding)
    .filter((x, i, arr) => arr.indexOf(x) === i)
    .slice(0, MAX_FINDINGS)

  const quote =
    ranked.find((x) => x.signal === 'risk' && x.quote)?.quote ??
    ranked.find((x) => x.quote)?.quote ??
    ''

  const confidenceScore = bayesianConfidence(
    riskSignals,
    safeguardSignals,
    quote.length > 0,
    missingCoverage,
    avgTfidfStrength - 1.0,
    regulatoryMatches.length,
    wc,
  )

  const topRisk = ranked.find((x) => x.signal === 'risk')?.finding
  const topSafe = ranked.find((x) => x.signal === 'safeguard')?.finding

  const regulatorySignals = regulatoryMatches.map(m => m.description)
  const darkPatterns = darkPatternMatches.map(m => m.pattern)

  return {
    severity,
    findings: findings.length > 0 ? findings : ['No strong indicators found in this section'],
    quote,
    score,
    riskSignals,
    safeguardSignals,
    confidence: confidenceScore,
    insights: buildInsights(
      score,
      riskSignals,
      safeguardSignals,
      confidenceScore,
      missingCoverage,
      readabilityGrade,
      regulatorySignals,
      darkPatterns,
      topRisk,
      topSafe,
    ),
    regulatorySignals,
    darkPatterns,
    readabilityGrade: Math.round(readabilityGrade * 10) / 10,
    readabilityDetails: readability,
    vagueLanguage: vagueResult,
    completenessScore: completeness,
    boilerplateScore: boilerplate.score,
    sentimentMismatches,
  }
}

// ─── Full Analysis Entry Point ──────────────────────────────────────────────

export function analyzeAllCategories(
  text: string,
  options: AnalyzeAllOptions = {},
): Record<CategoryKey, HeuristicResult> {
  const categories: CategoryKey[] = [
    'data_collection',
    'retention',
    'third_party',
    'user_rights',
    'children',
    'security',
  ]

  const out = {} as Record<CategoryKey, HeuristicResult>
  for (const category of categories) {
    out[category] = analyzeCategory(text, category, options)
  }
  return out
}
