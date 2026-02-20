import type { InitProgressReport } from '@mlc-ai/web-llm'
import type { AppStatus } from '../types/analysis'

interface Props {
  status: AppStatus
  progress: InitProgressReport | null
}

export function LoadingScreen({ status, progress }: Props) {
  const pct = progress ? Math.round(progress.progress * 100) : 0
  const isFetching = status === 'fetching'
  const isLoading = status === 'loading-model'

  return (
    <div class="flex items-center justify-center min-h-[70vh] animate-fade-in">
      <div class="max-w-sm w-full text-center px-6 section-enter">
        {/* Terminal-style scanner box */}
        <div class="relative w-36 h-36 mx-auto mb-8 border border-neon-border overflow-hidden animate-pulse-soft">
          <div class="absolute inset-3 border border-neon-border/40 animate-pulse-soft" />
          <div class="absolute inset-6 border border-neon-border/30 animate-pulse-soft" style={{ animationDelay: '300ms' }} />
          {/* Corner brackets */}
          <div class="absolute -top-px -left-px w-5 h-5 border-t-2 border-l-2 border-neon border-dotted z-10" />
          <div class="absolute -top-px -right-px w-5 h-5 border-t-2 border-r-2 border-neon border-dotted z-10" />
          <div class="absolute -bottom-px -left-px w-5 h-5 border-b-2 border-l-2 border-neon border-dotted z-10" />
          <div class="absolute -bottom-px -right-px w-5 h-5 border-b-2 border-r-2 border-neon border-dotted z-10" />

          {/* Full scan line — travels top to bottom to top */}
          <div
            class="absolute left-0 right-0 h-[2px] animate-scan-full z-10"
            style={{
              background: 'linear-gradient(90deg, transparent, #00ff88, transparent)',
              boxShadow: '0 0 20px rgba(0,255,136,0.6), 0 0 60px rgba(0,255,136,0.2)',
            }}
          />
          {/* Scan trail glow */}
          <div
            class="absolute left-0 right-0 h-8 animate-scan-full z-[5] opacity-30"
            style={{
              background: 'linear-gradient(180deg, rgba(0,255,136,0.15), transparent)',
            }}
          />

          {/* Center icon */}
          <div class="absolute inset-0 flex items-center justify-center">
            {isFetching ? (
              <svg class="w-12 h-12 text-neon/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            ) : (
              <svg class="w-12 h-12 text-neon/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
          </div>

          {/* Background hex pattern */}
          <div class="absolute inset-0 hex-grid" />
        </div>

        {/* Status */}
        <div class="space-y-1 mb-6 section-enter delay-150">
          <h2 class="text-sm font-bold text-neon tracking-widest uppercase animate-flicker">
            {isFetching && '> fetching_policy'}
            {isLoading && '> loading_model'}
          </h2>
          <p class="text-xs text-neutral-600 font-mono">
            {isFetching && 'Extracting policy or terms text from target...'}
            {isLoading && (progress?.text ?? 'Initializing WebGPU runtime...')}
          </p>
        </div>

        {/* Progress bar */}
        {isLoading && (
          <div class="space-y-2 section-enter delay-250">
            <div class="w-full bg-neon-border h-1 overflow-hidden">
              <div
                class="h-1 progress-neon transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div class="flex justify-between">
              <p class="text-[10px] text-neutral-600 font-mono tracking-wider">
                progress
              </p>
              <p class="text-[10px] text-neon font-mono tracking-wider">
                {pct}%
              </p>
            </div>
          </div>
        )}

        {isFetching && (
          <div class="w-full bg-neon-border h-1 overflow-hidden section-enter delay-250">
            <div class="h-1 progress-neon w-full" />
          </div>
        )}

        {isLoading && (
          <p class="text-[9px] text-neutral-700 mt-6 tracking-wider uppercase">
            first-time setup downloads the ai model.
            <br />
            cached locally for future scans.
          </p>
        )}
      </div>
    </div>
  )
}
