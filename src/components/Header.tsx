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
        </div>
      </div>
    </header>
  )
}
