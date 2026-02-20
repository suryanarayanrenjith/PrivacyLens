export function severityToScore(severity: string): number {
  switch (severity) {
    case 'good':
      return 90
    case 'moderate':
      return 70
    case 'poor':
      return 40
    case 'critical':
      return 15
    default:
      return 50
  }
}

export function scoreToGrade(score: number): string {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 45) return 'D'
  return 'F'
}

export function gradeColor(grade: string): string {
  switch (grade) {
    case 'A':
      return 'text-grade-a'
    case 'B':
      return 'text-grade-b'
    case 'C':
      return 'text-grade-c'
    case 'D':
      return 'text-grade-d'
    case 'F':
      return 'text-grade-f'
    default:
      return 'text-gray-400'
  }
}

export function gradeBg(grade: string): string {
  switch (grade) {
    case 'A':
      return 'bg-grade-a'
    case 'B':
      return 'bg-grade-b'
    case 'C':
      return 'bg-grade-c'
    case 'D':
      return 'bg-grade-d'
    case 'F':
      return 'bg-grade-f'
    default:
      return 'bg-gray-400'
  }
}
