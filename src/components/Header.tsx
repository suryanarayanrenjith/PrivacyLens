export function Header() {
  return (
    <header class="relative overflow-hidden border-b border-neon-border sticky top-0 z-20 bg-terminal/90 backdrop-blur-sm animate-fade-in-down">
      <div class="header-scanline" />
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
        <div class="flex items-center gap-2">
          <span class="text-neon text-lg">[</span>
          <svg
            class="w-7 h-7 text-neon animate-pulse-soft"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <circle cx="12" cy="11" r="3" />
          </svg>
          <span class="text-neon text-lg">]</span>
        </div>
        <div>
          <h1 class="text-sm font-bold tracking-widest uppercase text-neon glitch-text">
            PrivacyLens
          </h1>
          <p class="text-[9px] text-neon-muted tracking-[0.25em] uppercase">
            on-device ai scanner
          </p>
        </div>
        <div class="ml-auto flex items-center gap-3">
          <span class="hidden sm:inline-flex items-center gap-2 text-[10px] text-neon-muted border border-neon-border px-3 py-1 tracking-wider uppercase font-mono">
            <span class="w-1.5 h-1.5 bg-neon animate-pulse-glow" />
            local_only
          </span>
          <a
            href="https://github.com/suryanarayanrenjith/PrivacyLens"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 text-[10px] text-neutral-500 hover:text-neon border border-neon-border hover:border-neon-dim px-3 py-1.5 tracking-wider uppercase font-mono transition-colors duration-200"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span class="hidden sm:inline">github</span>
          </a>
        </div>
      </div>
    </header>
  )
}
