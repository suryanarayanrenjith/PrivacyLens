import { gradeColor } from '../utils/grade-utils'

interface Props {
  grade: string
  score: number
}

function gradeStroke(grade: string): string {
  switch (grade) {
    case 'A': return '#00ff88'
    case 'B': return '#88ff00'
    case 'C': return '#ffcc00'
    case 'D': return '#ff8800'
    case 'F': return '#ff2244'
    default: return '#333'
  }
}

function gradeGlow(grade: string): string {
  switch (grade) {
    case 'A': return 'glow-grade-a'
    case 'B': return 'glow-grade-b'
    case 'C': return 'glow-grade-c'
    case 'D': return 'glow-grade-d'
    case 'F': return 'glow-grade-f'
    default: return ''
  }
}

function gradeLabel(grade: string): string {
  switch (grade) {
    case 'A': return 'EXCELLENT'
    case 'B': return 'GOOD'
    case 'C': return 'AVERAGE'
    case 'D': return 'POOR'
    case 'F': return 'CRITICAL'
    default: return 'UNKNOWN'
  }
}

export function OverallGrade({ grade, score }: Props) {
  const color = gradeColor(grade)
  const glow = gradeGlow(grade)
  const stroke = gradeStroke(grade)
  const label = gradeLabel(grade)

  const radius = 72
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  // Outer decorative ring
  const outerR = 84

  return (
    <div class="text-center animate-fade-in-scale section-enter">
      <div class={`relative inline-block ${glow}`}>
        {/* Corner brackets — larger */}
        <div class="absolute -top-3 -left-3 w-6 h-6 border-t-2 border-l-2 border-dotted" style={{ borderColor: stroke }} />
        <div class="absolute -top-3 -right-3 w-6 h-6 border-t-2 border-r-2 border-dotted" style={{ borderColor: stroke }} />
        <div class="absolute -bottom-3 -left-3 w-6 h-6 border-b-2 border-l-2 border-dotted" style={{ borderColor: stroke }} />
        <div class="absolute -bottom-3 -right-3 w-6 h-6 border-b-2 border-r-2 border-dotted" style={{ borderColor: stroke }} />

        <svg class="w-52 h-52" viewBox="0 0 200 200">
          <circle
            cx="100" cy="100" r="92"
            fill="none"
            stroke={stroke}
            stroke-width="0.8"
            opacity="0.12"
            class="animate-pulse-soft"
          />
          {/* Outer decorative ring — slowly rotating dashes */}
          <g class="animate-hex-rotate" style={{ transformOrigin: '100px 100px' }}>
            <circle
              cx="100" cy="100" r={outerR}
              fill="none"
              stroke={stroke}
              stroke-width="1"
              stroke-dasharray="8 12"
              opacity="0.2"
            />
          </g>

          {/* Tick marks around the ring */}
          {Array.from({ length: 40 }).map((_, i) => {
            const angle = (i / 40) * 360 - 90
            const rad = (angle * Math.PI) / 180
            const isMajor = i % 10 === 0
            const r1 = isMajor ? 62 : 65
            const r2 = 68
            const x1 = 100 + r1 * Math.cos(rad)
            const y1 = 100 + r1 * Math.sin(rad)
            const x2 = 100 + r2 * Math.cos(rad)
            const y2 = 100 + r2 * Math.sin(rad)
            return (
              <line
                key={i}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={stroke}
                stroke-width={isMajor ? 1.5 : 0.5}
                opacity={isMajor ? 0.5 : 0.15}
              />
            )
          })}

          {/* Background ring */}
          <circle
            cx="100" cy="100" r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.03)"
            stroke-width="8"
          />

          {/* Score arc */}
          <circle
            cx="100" cy="100" r={radius}
            fill="none"
            stroke={stroke}
            stroke-width="8"
            stroke-linecap="butt"
            stroke-dasharray={circumference}
            stroke-dashoffset={offset}
            class="score-ring"
            transform="rotate(-90 100 100)"
            style={{ filter: `drop-shadow(0 0 8px ${stroke}50)` }}
          />

          {/* Inner subtle ring */}
          <circle
            cx="100" cy="100" r="56"
            fill="none"
            stroke={stroke}
            stroke-width="0.5"
            opacity="0.1"
          />
        </svg>

        {/* Center content */}
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-[9px] text-neutral-700 tracking-[0.3em] uppercase mb-1 font-mono">
            privacy_score
          </span>
          <span class={`text-6xl font-black ${color} glitch-text leading-none`}>{grade}</span>
          <span class="text-lg font-bold font-mono tracking-wider mt-1" style={{ color: stroke }}>
            {score}
          </span>
          <span class="text-[8px] tracking-[0.25em] uppercase mt-1 font-mono" style={{ color: stroke, opacity: 0.6 }}>
            {label}
          </span>
        </div>
      </div>
    </div>
  )
}
