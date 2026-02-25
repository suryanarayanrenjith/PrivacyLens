interface NavigatorWithGPU {
  gpu?: {
    requestAdapter(options?: Record<string, unknown>): Promise<unknown>
  }
}

export async function checkWebGPUSupport(): Promise<{
  supported: boolean
  reason?: string
}> {
  if (!('gpu' in navigator)) {
    return {
      supported: false,
      reason:
        'Your browser does not support WebGPU. Please use Chrome 113+, Edge 113+, or a recent version of Firefox.',
    }
  }

  try {
    const gpu = (navigator as NavigatorWithGPU).gpu
    if (!gpu) {
      return {
        supported: false,
        reason: 'WebGPU API is present but not accessible.',
      }
    }
    // Pass empty options (no powerPreference) to avoid Chrome warning on Windows
    const adapter = await gpu.requestAdapter({})
    if (!adapter) {
      return {
        supported: false,
        reason:
          'WebGPU is available but no GPU adapter was found. Make sure hardware acceleration is enabled in your browser settings.',
      }
    }
    return { supported: true }
  } catch {
    return {
      supported: false,
      reason: 'Failed to initialize WebGPU. Try updating your browser or GPU drivers.',
    }
  }
}
