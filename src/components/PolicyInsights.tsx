import type { AnalysisReport, ScoredCategory } from '../types/analysis'

interface Props {
  report: AnalysisReport
}

function getRiskLevel(score: number): { label: string; color: string } {
  if (score >= 85) return { label: 'LOW RISK', color: '#00ff88' }
  if (score >= 65) return { label: 'MODERATE', color: '#ffcc00' }
  if (score >= 40) return { label: 'HIGH RISK', color: '#ff8800' }
  return { label: 'CRITICAL', color: '#ff2244' }
}

function getWorstCategory(cats: ScoredCategory[]): ScoredCategory {
  return cats.reduce((worst, c) => (c.score < worst.score ? c : worst), cats[0])
}

function getBestCategory(cats: ScoredCategory[]): ScoredCategory {
  return cats.reduce((best, c) => (c.score > best.score ? c : best), cats[0])
}

function getReadabilityLevel(wordCount: number): string {
  if (wordCount > 8000) return 'Very Long — may obscure key details'
  if (wordCount > 4000) return 'Long — typical for major platforms'
  if (wordCount > 1500) return 'Medium — average length'
  return 'Short — could be missing key disclosures'
}

function getTransparencyScore(cats: ScoredCategory[]): number {
  // Based on how many categories have quotes (evidence of specific language)
  const withQuotes = cats.filter(c => c.quote && c.quote.length > 0).length
  return Math.round((withQuotes / cats.length) * 100)
}

function getDataExposureLevel(cats: ScoredCategory[]): { level: string; color: string; pct: number } {
  const dc = cats.find(c => c.key === 'data_collection')
  const tp = cats.find(c => c.key === 'third_party')
  const avgScore = ((dc?.score ?? 50) + (tp?.score ?? 50)) / 2
  if (avgScore >= 80) return { level: 'Minimal', color: '#00ff88', pct: 20 }
  if (avgScore >= 60) return { level: 'Standard', color: '#88ff00', pct: 45 }
  if (avgScore >= 40) return { level: 'Elevated', color: '#ffcc00', pct: 70 }
  return { level: 'Extensive', color: '#ff2244', pct: 95 }
}

function getUserControlLevel(cats: ScoredCategory[]): { level: string; color: string; pct: number } {
  const ur = cats.find(c => c.key === 'user_rights')
  const ret = cats.find(c => c.key === 'retention')
  const avgScore = ((ur?.score ?? 50) + (ret?.score ?? 50)) / 2
  if (avgScore >= 80) return { level: 'Strong', color: '#00ff88', pct: 90 }
  if (avgScore >= 60) return { level: 'Moderate', color: '#88ff00', pct: 65 }
  if (avgScore >= 40) return { level: 'Limited', color: '#ffcc00', pct: 40 }
  return { level: 'Minimal', color: '#ff2244', pct: 15 }
}

function getThreatVectors(cats: ScoredCategory[]): string[] {
  const threats: string[] = []
  for (const c of cats) {
    if (c.severity === 'critical') {
      threats.push(`${c.label}: ${c.findings[0] ?? 'Critical risk detected'}`)
    } else if (c.severity === 'poor') {
      threats.push(`${c.label}: ${c.findings[0] ?? 'Significant concern'}`)
    }
  }
  return threats.slice(0, 4)
}

function getComplianceIndicators(cats: ScoredCategory[]): { name: string; status: 'pass' | 'warn' | 'fail' }[] {
  const ur = cats.find(c => c.key === 'user_rights')
  const ch = cats.find(c => c.key === 'children')
  const sec = cats.find(c => c.key === 'security')
  const ret = cats.find(c => c.key === 'retention')

  const gdpr = (ur?.score ?? 0) >= 70 && (ret?.score ?? 0) >= 60
  const ccpa = (ur?.score ?? 0) >= 60
  const coppa = (ch?.score ?? 0) >= 70
  const encryption = sec?.findings.some(f => f.toLowerCase().includes('encrypt')) ?? false

  return [
    { name: 'GDPR', status: gdpr ? 'pass' : (ur?.score ?? 0) >= 50 ? 'warn' : 'fail' },
    { name: 'CCPA', status: ccpa ? 'pass' : (ur?.score ?? 0) >= 40 ? 'warn' : 'fail' },
    { name: 'COPPA', status: coppa ? 'pass' : (ch?.score ?? 0) >= 40 ? 'warn' : 'fail' },
    { name: 'ENCRYPTION', status: encryption ? 'pass' : 'warn' },
  ]
}

function statusColor(s: 'pass' | 'warn' | 'fail'): string {
  if (s === 'pass') return '#00ff88'
  if (s === 'warn') return '#ffcc00'
  return '#ff2244'
}

function statusLabel(s: 'pass' | 'warn' | 'fail'): string {
  if (s === 'pass') return 'PASS'
  if (s === 'warn') return 'WARN'
  return 'FAIL'
}

function getVaguenessLevel(score: number): { label: string; color: string } {
  if (score <= 20) return { label: 'CRYSTAL CLEAR', color: '#00ff88' }
  if (score <= 40) return { label: 'MOSTLY CLEAR', color: '#88ff00' }
  if (score <= 60) return { label: 'SOMEWHAT VAGUE', color: '#ffcc00' }
  if (score <= 80) return { label: 'HIGHLY VAGUE', color: '#ff8800' }
  return { label: 'EXTREMELY EVASIVE', color: '#ff2244' }
}

function getCompletenessLevel(score: number): { label: string; color: string } {
  if (score >= 75) return { label: 'COMPREHENSIVE', color: '#00ff88' }
  if (score >= 50) return { label: 'ADEQUATE', color: '#88ff00' }
  if (score >= 30) return { label: 'PARTIAL', color: '#ffcc00' }
  return { label: 'INCOMPLETE', color: '#ff2244' }
}

function getReadabilityColor(grade: number): string {
  if (grade <= 8) return '#00ff88'
  if (grade <= 12) return '#88ff00'
  if (grade <= 16) return '#ffcc00'
  return '#ff2244'
}

function getReadabilityLabel(grade: number): string {
  if (grade <= 6) return 'Easy (6th grade)'
  if (grade <= 8) return 'Fairly Easy (8th grade)'
  if (grade <= 10) return 'Standard (10th grade)'
  if (grade <= 12) return 'Fairly Difficult (12th grade)'
  if (grade <= 14) return 'Difficult (College)'
  if (grade <= 16) return 'Very Difficult (College+)'
  return 'Extremely Difficult (Graduate+)'
}

export function PolicyInsights({ report }: Props) {
  const cats = report.categories
  const risk = getRiskLevel(report.overallScore)
  const worst = getWorstCategory(cats)
  const best = getBestCategory(cats)
  const transparency = getTransparencyScore(cats)
  const dataExposure = getDataExposureLevel(cats)
  const userControl = getUserControlLevel(cats)
  const threats = getThreatVectors(cats)
  const compliance = getComplianceIndicators(cats)
  const readability = getReadabilityLevel(report.policyWordCount)
  const totalFindings = cats.reduce((sum, c) => sum + c.findings.length, 0)

  return (
    <div class="space-y-4">
      {/* Section header */}
      <div class="flex items-center gap-3 animate-fade-in-up" style={{ animationDelay: '300ms' }}>
        <div class="divider-neon flex-1" />
        <h3 class="text-xs text-neon tracking-[0.3em] uppercase font-mono">
          advanced_insights
        </h3>
        <div class="divider-neon flex-1" />
      </div>

      {/* Top stats row */}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in-up" style={{ animationDelay: '350ms' }}>
        <div class="cyber-card lift-on-hover p-3 text-center">
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="text-[9px] text-neutral-600 tracking-wider uppercase mb-1">risk_level</div>
          <div class="text-sm font-bold tracking-wider" style={{ color: risk.color }}>{risk.label}</div>
        </div>
        <div class="cyber-card lift-on-hover p-3 text-center">
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="text-[9px] text-neutral-600 tracking-wider uppercase mb-1">findings</div>
          <div class="text-sm font-bold text-neon tracking-wider">{totalFindings}</div>
        </div>
        <div class="cyber-card lift-on-hover p-3 text-center">
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="text-[9px] text-neutral-600 tracking-wider uppercase mb-1">word_count</div>
          <div class="text-sm font-bold text-neon tracking-wider">{report.policyWordCount.toLocaleString()}</div>
        </div>
        <div class="cyber-card lift-on-hover p-3 text-center">
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="text-[9px] text-neutral-600 tracking-wider uppercase mb-1">transparency</div>
          <div class="text-sm font-bold tracking-wider" style={{ color: transparency >= 60 ? '#00ff88' : '#ffcc00' }}>{transparency}%</div>
        </div>
      </div>

      {/* Data exposure + user control meters */}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
        <div class="cyber-card lift-on-hover p-4">
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="flex items-center justify-between mb-3">
            <span class="text-[10px] text-neutral-500 tracking-wider uppercase font-mono">{'>'} data_exposure</span>
            <span class="text-[10px] font-bold tracking-wider" style={{ color: dataExposure.color }}>{dataExposure.level}</span>
          </div>
          <div class="meter-track">
            <div class="meter-fill bar-fill" style={{ width: `${dataExposure.pct}%`, background: dataExposure.color }} />
          </div>
          <p class="text-[9px] text-neutral-700 mt-2 font-mono">
            How much personal data the service collects and shares
          </p>
        </div>

        <div class="cyber-card lift-on-hover p-4">
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="flex items-center justify-between mb-3">
            <span class="text-[10px] text-neutral-500 tracking-wider uppercase font-mono">{'>'} user_control</span>
            <span class="text-[10px] font-bold tracking-wider" style={{ color: userControl.color }}>{userControl.level}</span>
          </div>
          <div class="meter-track">
            <div class="meter-fill bar-fill" style={{ width: `${userControl.pct}%`, background: userControl.color, animationDelay: '200ms' }} />
          </div>
          <p class="text-[9px] text-neutral-700 mt-2 font-mono">
            Your ability to access, delete, and control your data
          </p>
        </div>
      </div>

      {/* Compliance indicators */}
      <div class="cyber-card lift-on-hover p-4 animate-fade-in-up" style={{ animationDelay: '450ms' }}>
        <div class="cyber-corners absolute inset-0 pointer-events-none" />
        <div class="flex items-center gap-2 mb-3">
          <span class="text-neon text-xs">{'>'}</span>
          <span class="text-[10px] text-neutral-500 tracking-[0.2em] uppercase font-mono">compliance_check</span>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          {compliance.map((c) => (
            <div key={c.name} class="flex items-center gap-2 border border-neon-border p-2">
              <div
                class="w-2 h-2 shrink-0"
                style={{ background: statusColor(c.status), boxShadow: `0 0 6px ${statusColor(c.status)}40` }}
              />
              <span class="text-[10px] text-neutral-500 tracking-wider font-mono">{c.name}</span>
              <span class="text-[9px] font-bold tracking-wider ml-auto font-mono" style={{ color: statusColor(c.status) }}>
                {statusLabel(c.status)}
              </span>
            </div>
          ))}
        </div>
        {report.llmComplianceNotes && (
          <div class="mt-3 border-l-2 border-neon-dim pl-3">
            <div class="flex items-center gap-1.5 mb-1">
              <span class="w-1 h-1 bg-neon" />
              <span class="text-[8px] text-neon-muted tracking-wider uppercase font-mono">ai_compliance_analysis</span>
            </div>
            <p class="text-[10px] text-neutral-400 font-mono leading-relaxed">{report.llmComplianceNotes}</p>
          </div>
        )}
      </div>

      {/* Best / Worst + Readability */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in-up" style={{ animationDelay: '500ms' }}>
        <div class="cyber-card lift-on-hover p-4">
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="text-[9px] text-neutral-600 tracking-wider uppercase mb-2 font-mono">strongest_area</div>
          <div class="text-xs text-grade-a font-bold tracking-wider uppercase">{best.label}</div>
          <div class="text-[10px] text-neutral-600 mt-1 font-mono">{best.summary}</div>
        </div>
        <div class="cyber-card lift-on-hover p-4">
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="text-[9px] text-neutral-600 tracking-wider uppercase mb-2 font-mono">weakest_area</div>
          <div class="text-xs text-grade-f font-bold tracking-wider uppercase">{worst.label}</div>
          <div class="text-[10px] text-neutral-600 mt-1 font-mono">{worst.summary}</div>
        </div>
        <div class="cyber-card lift-on-hover p-4">
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="text-[9px] text-neutral-600 tracking-wider uppercase mb-2 font-mono">readability</div>
          <div class="text-xs text-neon font-bold tracking-wider">{report.policyWordCount.toLocaleString()} WORDS</div>
          <div class="text-[10px] text-neutral-600 mt-1 font-mono">{readability}</div>
        </div>
      </div>

      {/* ── Ensemble Analysis Section (new advanced cards) ── */}
      {report.analysisDepth === 'deep' && (
        <>
          {/* Section divider */}
          <div class="flex items-center gap-3 animate-fade-in-up" style={{ animationDelay: '510ms' }}>
            <div class="divider-neon flex-1" />
            <h3 class="text-xs text-neon tracking-[0.3em] uppercase font-mono">
              ensemble_analysis
            </h3>
            <div class="divider-neon flex-1" />
          </div>

          {/* Readability Ensemble */}
          {report.readabilityDetails && (
            <div class="cyber-card lift-on-hover p-4 animate-fade-in-up" style={{ animationDelay: '520ms' }}>
              <div class="cyber-corners absolute inset-0 pointer-events-none" />
              <div class="flex items-center gap-2 mb-3">
                <span class="text-neon text-xs">{'>'}</span>
                <span class="text-[10px] text-neutral-500 tracking-[0.2em] uppercase font-mono">readability_ensemble</span>
                <span class="text-[9px] ml-auto font-bold tracking-wider font-mono" style={{ color: getReadabilityColor(report.readabilityDetails.averageGrade) }}>
                  {getReadabilityLabel(report.readabilityDetails.averageGrade)}
                </span>
              </div>
              <div class="text-center mb-3">
                <div class="text-[9px] text-neutral-600 tracking-wider uppercase mb-1">ensemble_grade</div>
                <div class="text-lg font-bold tracking-wider" style={{ color: getReadabilityColor(report.readabilityDetails.averageGrade) }}>
                  {report.readabilityDetails.averageGrade}
                </div>
              </div>
              <div class="space-y-2">
                {([
                  ['Flesch-Kincaid', report.readabilityDetails.fleschKincaid],
                  ['Gunning Fog', report.readabilityDetails.gunningFog],
                  ['Coleman-Liau', report.readabilityDetails.colemanLiau],
                  ['Auto. Readability', report.readabilityDetails.ari],
                  ['SMOG', report.readabilityDetails.smog],
                ] as const).map(([label, value]) => {
                  const barColor = getReadabilityColor(value)
                  const barWidth = Math.min(100, Math.max(5, (value / 20) * 100))
                  return (
                    <div key={label}>
                      <div class="flex items-center justify-between mb-0.5">
                        <span class="text-[9px] text-neutral-600 tracking-wider font-mono">{label}</span>
                        <span class="text-[9px] font-bold font-mono" style={{ color: barColor }}>{value}</span>
                      </div>
                      <div class="meter-track" style={{ height: '3px' }}>
                        <div class="meter-fill bar-fill" style={{ width: `${barWidth}%`, background: barColor }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <p class="text-[8px] text-neutral-700 mt-2 font-mono">
                5 readability indices averaged for robust scoring. Lower grade = easier to read.
              </p>
            </div>
          )}

          {/* Language Clarity + Policy Completeness + Originality */}
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in-up" style={{ animationDelay: '530ms' }}>
            {/* Language Clarity (Vagueness) */}
            {report.vagueLanguageScore !== undefined && (() => {
              const vague = getVaguenessLevel(report.vagueLanguageScore)
              return (
                <div class="cyber-card lift-on-hover p-4">
                  <div class="cyber-corners absolute inset-0 pointer-events-none" />
                  <div class="text-[9px] text-neutral-600 tracking-wider uppercase mb-2 font-mono">language_clarity</div>
                  <div class="text-xs font-bold tracking-wider" style={{ color: vague.color }}>{vague.label}</div>
                  <div class="meter-track mt-2">
                    <div
                      class="meter-fill bar-fill"
                      style={{ width: `${report.vagueLanguageScore}%`, background: vague.color }}
                    />
                  </div>
                  <div class="text-[9px] text-neutral-600 mt-1 font-mono">
                    Vagueness: {report.vagueLanguageScore}%
                  </div>
                  <p class="text-[8px] text-neutral-700 mt-1 font-mono">
                    Measures hedge words, double negatives, and evasive phrasing
                  </p>
                </div>
              )
            })()}

            {/* Policy Completeness */}
            {report.completenessScore !== undefined && (() => {
              const comp = getCompletenessLevel(report.completenessScore)
              return (
                <div class="cyber-card lift-on-hover p-4">
                  <div class="cyber-corners absolute inset-0 pointer-events-none" />
                  <div class="text-[9px] text-neutral-600 tracking-wider uppercase mb-2 font-mono">policy_completeness</div>
                  <div class="text-xs font-bold tracking-wider" style={{ color: comp.color }}>{comp.label}</div>
                  <div class="meter-track mt-2">
                    <div
                      class="meter-fill bar-fill"
                      style={{ width: `${report.completenessScore}%`, background: comp.color }}
                    />
                  </div>
                  <div class="text-[9px] text-neutral-600 mt-1 font-mono">
                    Coverage: {report.completenessScore}%
                  </div>
                  <p class="text-[8px] text-neutral-700 mt-1 font-mono">
                    Compared against GDPR Art. 13-14 disclosure requirements
                  </p>
                </div>
              )
            })()}

            {/* Originality (Boilerplate) */}
            {report.boilerplateScore !== undefined && (() => {
              const uniqueness = 100 - report.boilerplateScore
              const origColor = uniqueness >= 70 ? '#00ff88' : uniqueness >= 40 ? '#ffcc00' : '#ff2244'
              return (
                <div class="cyber-card lift-on-hover p-4">
                  <div class="cyber-corners absolute inset-0 pointer-events-none" />
                  <div class="text-[9px] text-neutral-600 tracking-wider uppercase mb-2 font-mono">originality_score</div>
                  <div class="text-xs font-bold tracking-wider" style={{ color: origColor }}>
                    {uniqueness >= 70 ? 'ORIGINAL' : uniqueness >= 40 ? 'MIXED' : 'TEMPLATE-HEAVY'}
                  </div>
                  <div class="meter-track mt-2">
                    <div
                      class="meter-fill bar-fill"
                      style={{ width: `${uniqueness}%`, background: origColor }}
                    />
                  </div>
                  <div class="text-[9px] text-neutral-600 mt-1 font-mono">
                    Uniqueness: {uniqueness}% / Boilerplate: {report.boilerplateScore}%
                  </div>
                  <p class="text-[8px] text-neutral-700 mt-1 font-mono">
                    How much custom language vs. copy-pasted template text
                  </p>
                </div>
              )
            })()}
          </div>

          {/* Sentiment Mismatches */}
          {report.sentimentMismatches && report.sentimentMismatches.length > 0 && (
            <div class="cyber-card lift-on-hover p-4 animate-fade-in-up" style={{ animationDelay: '540ms', borderColor: 'rgba(255, 136, 0, 0.2)' }}>
              <div class="cyber-corners absolute inset-0 pointer-events-none" />
              <div class="flex items-center gap-2 mb-3">
                <span class="text-grade-d text-xs">[!]</span>
                <span class="text-[10px] text-grade-d tracking-[0.2em] uppercase font-mono">sentiment_mismatch</span>
                <span class="text-[9px] text-neutral-600 ml-auto font-mono">{report.sentimentMismatches.length} detected</span>
              </div>
              <p class="text-[9px] text-neutral-600 mb-2 font-mono">
                Sentences that use positive framing to describe invasive data practices:
              </p>
              <div class="space-y-1.5">
                {report.sentimentMismatches.slice(0, 4).map((sm, i) => (
                  <div key={i} class="flex gap-2 text-[9px] font-mono">
                    <span class="text-grade-d shrink-0">{'>'}</span>
                    <span class="text-neutral-500 italic">"{sm}"</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Threat vectors */}
      {(threats.length > 0 || report.llmThreatAssessment) && (
        <div class="cyber-card lift-on-hover p-4 animate-fade-in-up" style={{ animationDelay: '550ms', borderColor: 'rgba(255, 34, 68, 0.2)' }}>
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="flex items-center gap-2 mb-3">
            <span class="text-grade-f text-xs">[!]</span>
            <span class="text-[10px] text-grade-f tracking-[0.2em] uppercase font-mono">threat_vectors</span>
          </div>
          {report.llmThreatAssessment && (
            <div class="mb-3 border-l-2 border-grade-f/30 pl-3">
              <div class="flex items-center gap-1.5 mb-1">
                <span class="w-1 h-1 bg-neon" />
                <span class="text-[8px] text-neon-muted tracking-wider uppercase font-mono">ai_threat_analysis</span>
              </div>
              <p class="text-[10px] text-neutral-400 font-mono leading-relaxed">{report.llmThreatAssessment}</p>
            </div>
          )}
          <div class="space-y-2">
            {threats.map((t, i) => (
              <div key={i} class="flex gap-2 text-[10px] font-mono">
                <span class="text-grade-f shrink-0">{'>'}</span>
                <span class="text-neutral-500">{t}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Recommendations */}
      {report.llmRecommendations && report.llmRecommendations.length > 0 && (
        <div class="cyber-card lift-on-hover p-4 animate-fade-in-up" style={{ animationDelay: '575ms', borderColor: 'rgba(0, 255, 136, 0.15)' }}>
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="flex items-center gap-2 mb-3">
            <span class="text-neon text-xs">{'>'}</span>
            <span class="text-[10px] text-neon-muted tracking-[0.2em] uppercase font-mono">ai_recommendations</span>
          </div>
          <div class="space-y-2">
            {report.llmRecommendations.map((rec, i) => (
              <div key={i} class="flex gap-2 text-[10px] font-mono">
                <span class="text-neon shrink-0">[{i + 1}]</span>
                <span class="text-neutral-400 leading-relaxed">{rec}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category breakdown bars */}
      <div class="cyber-card lift-on-hover p-4 animate-fade-in-up" style={{ animationDelay: '600ms' }}>
        <div class="cyber-corners absolute inset-0 pointer-events-none" />
        <div class="flex items-center gap-2 mb-4">
          <span class="text-neon text-xs">{'>'}</span>
          <span class="text-[10px] text-neutral-500 tracking-[0.2em] uppercase font-mono">category_breakdown</span>
        </div>
        <div class="space-y-3">
          {cats.map((c, i) => {
            const barColor = c.score >= 80 ? '#00ff88' : c.score >= 60 ? '#88ff00' : c.score >= 40 ? '#ffcc00' : '#ff2244'
            return (
              <div key={c.key}>
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[10px] text-neutral-500 tracking-wider uppercase font-mono">{c.label}</span>
                  <span class="text-[10px] font-bold font-mono" style={{ color: barColor }}>{c.score}</span>
                </div>
                <div class="meter-track">
                  <div
                    class="meter-fill bar-fill"
                    style={{ width: `${c.score}%`, background: barColor, animationDelay: `${i * 100}ms` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Scan metadata */}
      <div class="cyber-card lift-on-hover p-4 animate-fade-in-up" style={{ animationDelay: '650ms' }}>
        <div class="cyber-corners absolute inset-0 pointer-events-none" />
        <div class="flex items-center gap-2 mb-3">
          <span class="text-neon text-xs">{'>'}</span>
          <span class="text-[10px] text-neutral-500 tracking-[0.2em] uppercase font-mono">scan_metadata</span>
        </div>
        <div class="grid grid-cols-2 gap-x-6 gap-y-1.5">
          <div class="text-[10px] font-mono">
            <span class="text-neutral-700">scanned_at: </span>
            <span class="text-neutral-500">{new Date(report.analyzedAt).toLocaleString()}</span>
          </div>
          <div class="text-[10px] font-mono">
            <span class="text-neutral-700">model: </span>
            <span class="text-neutral-500">{report.modelUsed}</span>
          </div>
          <div class="text-[10px] font-mono">
            <span class="text-neutral-700">target: </span>
            <span class="text-neutral-500">{report.analysisTarget}</span>
          </div>
          <div class="text-[10px] font-mono">
            <span class="text-neutral-700">doc_type: </span>
            <span class={report.isLikelyPolicyOrTos ? 'text-neon-muted' : 'text-grade-d'}>
              {report.documentKind} ({report.documentConfidence}%)
            </span>
          </div>
          {report.sourceUrl && (
            <div class="text-[10px] font-mono col-span-2">
              <span class="text-neutral-700">source: </span>
              <span class="text-neon-muted">{report.sourceUrl}</span>
            </div>
          )}
          <div class="text-[10px] font-mono">
            <span class="text-neutral-700">categories: </span>
            <span class="text-neutral-500">{cats.length}</span>
          </div>
          <div class="text-[10px] font-mono">
            <span class="text-neutral-700">red_flags: </span>
            <span class={report.redFlags.length > 0 ? 'text-grade-f' : 'text-neutral-500'}>{report.redFlags.length}</span>
          </div>
          <div class="text-[10px] font-mono">
            <span class="text-neutral-700">analysis_depth: </span>
            <span class={report.analysisDepth === 'deep' ? 'text-neon-muted' : 'text-grade-d'}>
              {report.analysisDepth ?? 'deep'}
              {report.analysisDepth === 'shallow' && ' (non-policy document)'}
            </span>
          </div>
          <div class="text-[10px] font-mono">
            <span class="text-neutral-700">engine: </span>
            <span class="text-neutral-500">Ensemble v3 (11 voters)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
