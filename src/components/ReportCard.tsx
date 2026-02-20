import { useState } from 'preact/hooks'
import type { ScoredCategory } from '../types/analysis'
import { gradeColor } from '../utils/grade-utils'

interface Props {
  category: ScoredCategory
  /** AI-generated contextual summary for this category (if available) */
  llmSummary?: string
}

const CATEGORY_ICONS: Record<string, string> = {
  data_collection: 'M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M1 4h22M10 4V2h4v2',
  retention: 'M12 2v10l4-3M12 12l-4-3M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z',
  third_party: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  user_rights: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  children: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  security: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'good': return 'text-grade-a'
    case 'moderate': return 'text-grade-c'
    case 'poor': return 'text-grade-d'
    case 'critical': return 'text-grade-f'
    default: return 'text-neutral-500'
  }
}

function severityBorderColor(severity: string): string {
  switch (severity) {
    case 'good': return 'border-grade-a/30'
    case 'moderate': return 'border-grade-c/30'
    case 'poor': return 'border-grade-d/30'
    case 'critical': return 'border-grade-f/30'
    default: return 'border-neutral-800'
  }
}

export function ReportCard({ category, llmSummary }: Props) {
  const [expanded, setExpanded] = useState(false)
  const color = gradeColor(category.grade)
  const sevColor = severityColor(category.severity)
  const borderColor = severityBorderColor(category.severity)
  const icon = CATEGORY_ICONS[category.key] ?? CATEGORY_ICONS.security

  return (
    <div class={`cyber-card lift-on-hover p-4 hover:bg-white/[0.02] transition-all group`}>
      <div class="cyber-corners absolute inset-0 pointer-events-none" />

      <div class="flex items-start justify-between mb-3">
        <div class="flex items-center gap-2.5">
          <div class="w-7 h-7 border border-neon-border flex items-center justify-center group-hover:border-neon-dim transition-colors">
            <svg class="w-3.5 h-3.5 text-neon-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d={icon} />
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-white text-xs tracking-wider uppercase">{category.label}</h3>
            <span class={`inline-block text-[9px] px-2 py-0.5 border ${borderColor} ${sevColor} mt-0.5 tracking-wider uppercase font-mono`}>
              {category.severity}
            </span>
          </div>
        </div>
        <span
          class={`${color} text-sm font-black w-7 h-7 border border-neon-border flex items-center justify-center font-mono`}
        >
          {category.grade}
        </span>
      </div>

      <p class="text-xs text-neutral-500 mb-3 leading-relaxed">{category.summary}</p>

      {/* AI-generated contextual summary — shown when LLM provides per-category analysis */}
      {llmSummary && (
        <div class="mb-3 border-l-2 border-neon-dim pl-3">
          <div class="flex items-center gap-1.5 mb-1">
            <span class="w-1 h-1 bg-neon" />
            <span class="text-[8px] text-neon-muted tracking-wider uppercase font-mono">ai_analysis</span>
          </div>
          <p class="text-[10px] text-neutral-400 font-mono leading-relaxed">{llmSummary}</p>
        </div>
      )}

      {category.insights && category.insights.length > 0 && (
        <div class="mb-3 space-y-1.5">
          {category.insights.slice(0, 2).map((insight, idx) => (
            <p key={`${category.key}-insight-${idx}`} class="text-[10px] text-neutral-600 font-mono leading-relaxed">
              {insight}
            </p>
          ))}
        </div>
      )}

      <ul class="space-y-1.5 mb-3">
        {category.findings.map((f, i) => (
          <li key={i} class="text-[11px] text-neutral-600 flex gap-2 leading-relaxed font-mono">
            <span class={`mt-1 ${sevColor}`}>{'>'}</span>
            {f}
          </li>
        ))}
      </ul>

      {category.quote && (
        <button
          type="button"
          class="text-[10px] text-neon-muted hover:text-neon transition-colors tracking-wider uppercase font-mono"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '[-] hide_quote' : '[+] show_quote'}
        </button>
      )}

      {expanded && category.quote && (
        <blockquote
          class="mt-2 text-[10px] text-neutral-600 italic border-l-2 border-neon-border pl-3 animate-fade-in-up font-mono"
        >
          "{category.quote}"
        </blockquote>
      )}
    </div>
  )
}
