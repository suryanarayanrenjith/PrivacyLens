import { useCallback } from 'preact/hooks'
import type { AnalysisReport } from '../types/analysis'
import { OverallGrade } from './OverallGrade'
import { ReportCard } from './ReportCard'
import { ShareButton } from './ShareButton'
import { PolicyInsights } from './PolicyInsights'

interface Props {
  report: AnalysisReport
  copyShareUrl: (report: AnalysisReport) => Promise<boolean>
  onReset: () => void
  isEnhancing?: boolean
}

export function Report({ report, copyShareUrl, onReset, isEnhancing }: Props) {
  const documentKindLabel =
    report.documentKind === 'privacy_policy'
      ? 'privacy_policy'
      : report.documentKind === 'tos'
        ? 'terms_of_service'
        : report.documentKind === 'mixed'
          ? 'mixed_policy_tos'
          : 'unknown_document'

  const scrollToSection = useCallback((id: string) => {
    const target = document.getElementById(id)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  return (
    <div class="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8 animate-fade-in">
      {/* Top section: grade + meta */}
      <div id="top-section" class="flex flex-col items-center gap-5 section-enter">
        <OverallGrade grade={report.overallGrade} score={report.overallScore} />

        <div class="text-center space-y-2 section-enter delay-100">
          {report.sourceUrl && (
            <p class="text-[10px] text-neutral-600 font-mono truncate max-w-md tracking-wider">
              {report.sourceUrl}
            </p>
          )}
          <p class="text-[11px] text-neutral-600 font-mono tracking-wider">
            {report.policyWordCount.toLocaleString()} words scanned
            {' '} // {report.modelUsed.split('-q')[0]}
          </p>
          <p class="text-[10px] font-mono tracking-wider">
            <span class={report.isLikelyPolicyOrTos ? 'text-neon-muted' : 'text-grade-f'}>
              {documentKindLabel} // confidence {report.documentConfidence}%
            </span>
          </p>
        </div>

        <div class="flex gap-2 section-enter delay-150">
          <button
            type="button"
            class="cyber-btn"
            onClick={onReset}
          >
            <span class="flex items-center gap-2">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              back_home
            </span>
          </button>
          <ShareButton report={report} copyShareUrl={copyShareUrl} />
          <button
            type="button"
            class="cyber-btn"
            onClick={onReset}
          >
            <span class="flex items-center gap-2">
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              new_scan
            </span>
          </button>
        </div>
      </div>

      {/* Quick section access */}
      <div class="cyber-card p-3 section-enter delay-150">
        <div class="cyber-corners absolute inset-0 pointer-events-none" />
        <div class="flex flex-wrap items-center justify-center gap-2">
          <button type="button" class="cyber-btn text-[10px] !py-1.5 !px-3" onClick={() => scrollToSection('summary-section')}>
            summary
          </button>
          {report.redFlags.length > 0 && (
            <button type="button" class="cyber-btn text-[10px] !py-1.5 !px-3" onClick={() => scrollToSection('flags-section')}>
              red_flags
            </button>
          )}
          <button type="button" class="cyber-btn text-[10px] !py-1.5 !px-3" onClick={() => scrollToSection('categories-section')}>
            categories
          </button>
          <button type="button" class="cyber-btn text-[10px] !py-1.5 !px-3" onClick={() => scrollToSection('insights-section')}>
            insights
          </button>
          <button type="button" class="cyber-btn text-[10px] !py-1.5 !px-3" onClick={() => scrollToSection('top-section')}>
            top
          </button>
        </div>
      </div>

      {/* Summary section: shows instant heuristic summary immediately,
           then replaces it with LLM-refined summary once model inference completes */}
      {(report.instantSummary || report.llmSummary) && (
        <div id="summary-section" class="cyber-card lift-on-hover p-5 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <div class="cyber-corners absolute inset-0 pointer-events-none" />

          {/* Header: shows whether this is heuristic or AI-generated */}
          <h3 class="font-semibold text-neon mb-2 flex items-center gap-2 text-xs tracking-widest uppercase">
            <span>{'>'}</span>
            {report.llmSummary ? 'ai_summary' : 'heuristic_summary'}
          </h3>

          {/* LLM refinement loading indicator — visible while model loads/generates */}
          {isEnhancing && !report.llmSummary && (
            <div class="mb-3">
              <div class="flex items-center gap-2 mb-1">
                <span class="w-1.5 h-1.5 bg-neon animate-pulse-glow" />
                <span class="text-[9px] text-neon-muted tracking-wider uppercase font-mono cursor-blink">
                  refining_with_ai_model...
                </span>
              </div>
              <div class="w-full bg-neon-border h-1 overflow-hidden">
                <div class="h-1 progress-neon w-full" />
              </div>
            </div>
          )}

          {/* Display LLM summary if available, otherwise show instant heuristic summary */}
          <p class="text-xs text-neutral-400 leading-relaxed font-mono">
            {report.llmSummary ?? report.instantSummary}
          </p>

          {/* Source label */}
          {!report.llmSummary && !isEnhancing && (
            <p class="text-[9px] text-neutral-700 mt-2 font-mono tracking-wider">
              generated by heuristic analysis engine v2
            </p>
          )}
          {report.llmSummary && (
            <p class="text-[9px] text-neutral-700 mt-2 font-mono tracking-wider">
              refined by on-device ai model
            </p>
          )}
        </div>
      )}

      {/* LLM error notification — shows when AI refinement failed */}
      {report.llmError && !report.llmSummary && (
        <div class="cyber-card lift-on-hover p-4 animate-fade-in" style={{ borderColor: 'rgba(255, 136, 0, 0.2)' }}>
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <div class="flex items-center gap-2">
            <span class="text-grade-d text-xs">[i]</span>
            <span class="text-[10px] text-grade-d tracking-wider uppercase font-mono">ai_refinement_unavailable</span>
          </div>
          <p class="text-[10px] text-neutral-600 font-mono mt-1.5">
            {report.llmError}. Showing heuristic analysis results.
          </p>
        </div>
      )}

      {!report.isLikelyPolicyOrTos && (
        <div class="cyber-card lift-on-hover p-4 animate-fade-in-left" style={{ borderColor: 'rgba(255, 136, 0, 0.25)' }}>
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <h3 class="font-semibold text-grade-d mb-2 flex items-center gap-2 text-xs tracking-widest uppercase">
            <span>[!]</span>
            document_validation_warning
          </h3>
          <p class="text-[11px] text-neutral-500 font-mono mb-3">
            This input does not strongly match a Privacy Policy or Terms of Service. Results are best-effort heuristics.
          </p>
          {report.documentSignals.length > 0 && (
            <ul class="space-y-1">
              {report.documentSignals.map((signal, idx) => (
                <li key={`${signal}-${idx}`} class="text-[10px] text-neutral-600 font-mono flex gap-2">
                  <span class="text-grade-d">{'>'}</span>
                  <span>{signal}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Red flags */}
      {report.redFlags.length > 0 && (
        <div id="flags-section" class="cyber-card lift-on-hover p-5 animate-fade-in-left" style={{ animationDelay: '200ms', borderColor: 'rgba(255, 34, 68, 0.2)' }}>
          <div class="cyber-corners absolute inset-0 pointer-events-none" />
          <h3 class="font-semibold text-grade-f mb-3 flex items-center gap-2 text-xs tracking-widest uppercase">
            <span>[!]</span>
            red_flags
          </h3>
          <ul class="space-y-2">
            {report.redFlags.map((flag, i) => (
              <li key={i} class="text-[11px] text-grade-f/70 flex gap-2 font-mono">
                <span class="shrink-0 text-grade-f">{'>'}</span>
                <span class="italic">"{flag}"</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Section divider: Categories */}
      <div id="categories-section" class="flex items-center gap-3 section-enter delay-200">
        <div class="divider-neon flex-1" />
        <h3 class="text-xs text-neon tracking-[0.3em] uppercase font-mono">
          category_analysis
        </h3>
        <div class="divider-neon flex-1" />
      </div>

      {/* Category cards — pass per-category LLM summaries when available */}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 stagger-children section-enter delay-250">
        {report.categories.map((cat) => (
          <ReportCard
            key={cat.key}
            category={cat}
            llmSummary={report.llmCategorySummaries?.[cat.key]}
          />
        ))}
      </div>

      {/* Advanced insights */}
      <div id="insights-section">
        <PolicyInsights report={report} />
      </div>

      {/* Footer */}
      <div class="text-center py-6 section-enter delay-500">
        <div class="divider-neon mb-4" />
        <p class="text-[9px] text-neutral-700 tracking-[0.2em] uppercase font-mono">
          privacylens // on-device ai privacy scanner // all data processed locally
        </p>
      </div>
    </div>
  )
}
