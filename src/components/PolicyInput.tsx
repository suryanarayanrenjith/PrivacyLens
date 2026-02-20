import { useMemo, useState, useEffect } from 'preact/hooks'
import { MODELS, type ModelId } from '../engine/llm-engine'
import type { AnalysisTarget } from '../types/analysis'

const EXAMPLE_URLS = [
  { label: 'Google Privacy', url: 'https://policies.google.com/privacy' },
  { label: 'OpenAI Privacy', url: 'https://openai.com/policies/privacy-policy/' },
  { label: 'OpenAI Terms', url: 'https://openai.com/policies/terms-of-use/' },
  { label: 'GitHub Terms', url: 'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service' },
]

interface Props {
  onAnalyzeUrl: (
    url: string,
    modelId: ModelId,
    analysisTarget: AnalysisTarget,
  ) => void
  onAnalyzeText: (
    text: string,
    modelId: ModelId,
    analysisTarget: AnalysisTarget,
  ) => void
  onPrefetchModel: (modelId: ModelId) => void
  isModelReady: (modelId: ModelId) => boolean
  warmingModelId: ModelId | null
}

export function PolicyInput({
  onAnalyzeUrl,
  onAnalyzeText,
  onPrefetchModel,
  isModelReady,
  warmingModelId,
}: Props) {
  const [url, setUrl] = useState('')
  const [modelId, setModelId] = useState<ModelId>(MODELS[0].id)
  const [mode, setMode] = useState<'url' | 'text'>('url')
  const [analysisTarget, setAnalysisTarget] = useState<AnalysisTarget>('auto')
  const [text, setText] = useState('')
  const selectedModel = useMemo(
    () => MODELS.find((model) => model.id === modelId) ?? MODELS[0],
    [modelId],
  )
  const textWordCount = text.trim().length
    ? text.trim().split(/\s+/).length
    : 0
  const modelReady = isModelReady(modelId)
  const modelWarming = warmingModelId === modelId

  useEffect(() => {
    onPrefetchModel(modelId)
  }, [modelId, onPrefetchModel])

  const canAnalyze = mode === 'url' ? url.trim().length > 5 : text.trim().split(/\s+/).length >= 50

  const handleSubmit = () => {
    if (mode === 'url') {
      onAnalyzeUrl(url.trim(), modelId, analysisTarget)
    } else {
      onAnalyzeText(text.trim(), modelId, analysisTarget)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && canAnalyze) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div class="max-w-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24 animate-fade-in-up">
      {/* Hero */}
      <div class="text-center mb-12 section-enter">
        <p class="text-[10px] text-neon-muted tracking-[0.3em] uppercase mb-4 animate-flicker">
          {'>'} initializing privacy scanner...
        </p>
        <h2 class="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4 section-enter delay-100">
          Scan any{' '}
          <span class="text-neon glitch-text">privacy policy or TOS</span>
        </h2>
        <p class="text-sm text-neutral-500 max-w-md mx-auto leading-relaxed font-mono section-enter delay-150">
          Paste a URL and get an instant AI-powered legal and privacy risk grade.
          Everything runs locally — zero data transmitted.
        </p>
      </div>

      {/* Mode toggle */}
      <div class="flex justify-center mb-6 section-enter delay-200">
        <div class="inline-flex border border-neon-border">
          <button
            type="button"
            class={`cyber-tab px-5 py-2 text-xs tracking-widest uppercase font-mono ${
              mode === 'url'
                ? 'bg-neon-subtle text-neon border-r border-neon-border'
                : 'text-neutral-600 hover:text-neutral-400 border-r border-neon-border'
            }`}
            onClick={() => setMode('url')}
          >
            url
          </button>
          <button
            type="button"
            class={`cyber-tab px-5 py-2 text-xs tracking-widest uppercase font-mono ${
              mode === 'text'
                ? 'bg-neon-subtle text-neon'
                : 'text-neutral-600 hover:text-neutral-400'
            }`}
            onClick={() => setMode('text')}
          >
            paste
          </button>
        </div>
      </div>

      {/* Input card */}
      <div class="cyber-card lift-on-hover p-5 section-enter delay-250">
        <div class="cyber-corners absolute inset-0 pointer-events-none" />

        {mode === 'url' ? (
          <>
            <div class="flex items-center gap-2 mb-3">
              <span class="text-neon-muted text-xs">{'>'}</span>
              <span class="text-xs text-neutral-600 tracking-wider uppercase">document_url</span>
            </div>
            <input
              type="url"
              class="cyber-input w-full px-4 py-3 text-sm"
              placeholder="https://example.com/privacy-policy or /terms"
              value={url}
              onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />

            {/* Quick examples */}
            <div class="flex items-center gap-2 mt-4 flex-wrap">
              <span class="text-[10px] text-neutral-600 tracking-wider uppercase">presets:</span>
              {EXAMPLE_URLS.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  class="preset-chip text-[10px] px-3 py-1 border border-neon-border text-neutral-500 hover:text-neon hover:border-neon-dim tracking-wider uppercase font-mono"
                  onClick={() => setUrl(ex.url)}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div class="flex items-center gap-2 mb-3">
              <span class="text-neon-muted text-xs">{'>'}</span>
              <span class="text-xs text-neutral-600 tracking-wider uppercase">policy_text</span>
            </div>
            <textarea
              class="cyber-input w-full h-48 p-4 text-sm resize-y"
              placeholder="Paste the full Privacy Policy or Terms of Service text here (minimum 50 words)..."
              value={text}
              onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
            />
            <div class="mt-2 text-[10px] font-mono tracking-wider">
              <span class={textWordCount >= 50 ? 'text-neon-muted' : 'text-neutral-600'}>
                words: {textWordCount} / 50
              </span>
            </div>
          </>
        )}

        {/* Controls */}
        <div class="divider-neon my-5" />
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="flex-1 min-w-0">
            <select
              class="cyber-input w-full px-3 py-2 text-xs tracking-wider uppercase mb-2"
              value={analysisTarget}
              onChange={(e) =>
                setAnalysisTarget(
                  (e.target as HTMLSelectElement).value as AnalysisTarget,
                )
              }
            >
              <option value="auto" class="bg-terminal text-neutral-400">
                Auto Detect (Privacy/TOS)
              </option>
              <option value="privacy_policy" class="bg-terminal text-neutral-400">
                Privacy Policy Focus
              </option>
              <option value="tos" class="bg-terminal text-neutral-400">
                Terms of Service Focus
              </option>
            </select>

            <select
              class="cyber-input w-full px-3 py-2 text-xs tracking-wider uppercase"
              value={modelId}
              onChange={(e) =>
                setModelId((e.target as HTMLSelectElement).value as ModelId)
              }
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id} class="bg-terminal text-neutral-400">
                  {m.label} ({m.size})
                </option>
              ))}
            </select>
            <div class="mt-2 flex items-center justify-between gap-2 text-[10px] font-mono tracking-wider">
              <span class="text-neutral-600 truncate">
                {selectedModel.description}
              </span>
              <span class={modelReady ? 'text-neon-muted' : modelWarming ? 'text-neon' : 'text-neutral-600'}>
                {modelReady ? 'model_ready' : modelWarming ? 'warming_model...' : 'model_not_ready'}
              </span>
            </div>
          </div>

          <button
            type="button"
            class={`cyber-btn ${canAnalyze ? 'cyber-btn-primary' : ''} w-full sm:w-auto`}
            disabled={!canAnalyze}
            onClick={handleSubmit}
          >
            <span class="flex items-center gap-2">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              scan
            </span>
          </button>
        </div>
      </div>

      {/* Trust badges */}
      <div class="flex justify-center gap-3 sm:gap-5 mt-8 flex-wrap stagger-inline section-enter delay-300">
        {[
          { text: 'zero_data_sent' },
          { text: 'gpu_accelerated' },
          { text: 'free_forever' },
        ].map(({ text }) => (
          <div key={text} class="trust-chip text-[9px] text-neutral-600 tracking-[0.2em] uppercase font-mono">
            [{text}]
          </div>
        ))}
      </div>
    </div>
  )
}
