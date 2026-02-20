import { useCallback } from 'preact/hooks'
import { Header } from './Header'
import { WebGPUCheck } from './WebGPUCheck'
import { PolicyInput } from './PolicyInput'
import { LoadingScreen } from './LoadingScreen'
import { Report } from './Report'
import { useLLM } from '../hooks/use-llm'
import { useShare } from '../hooks/use-share'
import type { ModelId } from '../engine/llm-engine'
import type { AnalysisTarget } from '../types/analysis'

export function App() {
  const {
    status,
    progress,
    report,
    error,
    analyzeUrl,
    analyzeText,
    reset,
    preloadModel,
    isModelReady,
    warmingModelId,
  } = useLLM()
  const { sharedReport, copyShareUrl } = useShare()

  const handleUnsupported = useCallback(() => {}, [])

  const activeReport = sharedReport ?? report

  const handleAnalyzeUrl = useCallback(
    (url: string, modelId: ModelId, analysisTarget: AnalysisTarget) => {
      analyzeUrl(url, modelId, analysisTarget)
    },
    [analyzeUrl],
  )

  const handleAnalyzeText = useCallback(
    (text: string, modelId: ModelId, analysisTarget: AnalysisTarget) => {
      analyzeText(text, modelId, analysisTarget)
    },
    [analyzeText],
  )

  const handlePrefetchModel = useCallback(
    (modelId: ModelId) => {
      void preloadModel(modelId)
    },
    [preloadModel],
  )

  const handleReset = useCallback(() => {
    reset()
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname)
    }
  }, [reset])

  // Show loading screen only when fetching URL (before any report exists)
  const showLoading =
    status === 'fetching' && !activeReport

  // Show report whenever we have one (heuristic results come instantly,
  // LLM summary updates the report in the background)
  const showReport = !!activeReport

  // Is the LLM still generating a summary in background?
  const isEnhancing =
    showReport &&
    (status === 'loading-model' || status === 'analyzing')

  return (
    <div class="app-shell min-h-screen bg-terminal relative overflow-hidden scanlines grid-bg">
      <div class="app-ambient" aria-hidden="true">
        <div class="ambient-orb orb-one" />
        <div class="ambient-orb orb-two" />
        <div class="ambient-orb orb-three" />
        <div class="app-grain" />
      </div>

      <Header />
      <main class="relative z-10">
        {sharedReport ? (
          <div class="section-enter">
            <Report
              report={sharedReport}
              copyShareUrl={copyShareUrl}
              onReset={handleReset}
            />
          </div>
        ) : (
          <WebGPUCheck onUnsupported={handleUnsupported}>
            {status === 'idle' && !showReport && (
              <div class="section-enter">
                <PolicyInput
                  onAnalyzeUrl={handleAnalyzeUrl}
                  onAnalyzeText={handleAnalyzeText}
                  onPrefetchModel={handlePrefetchModel}
                  isModelReady={isModelReady}
                  warmingModelId={warmingModelId}
                />
              </div>
            )}

            {showLoading && (
              <div class="section-enter">
                <LoadingScreen
                  status={status}
                  progress={progress}
                />
              </div>
            )}

            {showReport && (
              <div class="section-enter">
                <Report
                  report={activeReport!}
                  copyShareUrl={copyShareUrl}
                  onReset={handleReset}
                  isEnhancing={isEnhancing}
                />
              </div>
            )}

            {status === 'error' && !showReport && (
              <div class="flex items-center justify-center min-h-[60vh] animate-fade-in">
                <div class="cyber-card lift-on-hover max-w-md text-center p-8 relative">
                  <div class="cyber-corners absolute inset-0 pointer-events-none" />
                  <div class="text-grade-f text-4xl mb-4 font-mono">[!]</div>
                  <h2 class="text-sm font-bold text-white mb-3 tracking-widest uppercase">
                    error_occurred
                  </h2>
                  <p class="text-xs text-neutral-500 mb-5 font-mono">{error}</p>
                  <button
                    type="button"
                    class="cyber-btn cyber-btn-primary"
                    onClick={reset}
                  >
                    retry
                  </button>
                </div>
              </div>
            )}
          </WebGPUCheck>
        )}
      </main>
    </div>
  )
}
