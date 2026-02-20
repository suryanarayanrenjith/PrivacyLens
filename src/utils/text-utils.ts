export function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

export function estimateTokens(text: string): number {
  return Math.ceil(wordCount(text) / 0.75)
}
