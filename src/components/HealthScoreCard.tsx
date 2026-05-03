import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { calcHealthScore, HEALTH_LABELS } from '../lib/healthScore'

interface RingProps { score: number; size?: number; stroke?: number; color: string }
function ScoreRing({ score, size = 140, stroke = 12, color }: RingProps) {
  const r    = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const cx   = size / 2
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#f5f5f4" strokeWidth={stroke} />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease-out' }} />
    </svg>
  )
}

interface MiniBarProps { label: string; score: number; max: number; detail: string; color: string }
function MiniBar({ label, score, max, detail, color }: MiniBarProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs">
        <span className="text-surface-800 font-medium">{label}</span>
        <span className="font-mono text-surface-300">{score}/{max}</span>
      </div>
      <div className="w-full bg-surface-100 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all duration-700"
          style={{ width: `${(score / max) * 100}%`, backgroundColor: color }} />
      </div>
      <p className="text-[10px] text-surface-300">{detail}</p>
    </div>
  )
}

export default function HealthScoreCard() {
  const { data } = useApp()
  const hasData  = data.snapshots.length > 0 || data.transactions.length > 0

  const hs    = useMemo(() => calcHealthScore(data), [data])
  const label = HEALTH_LABELS[hs.grade]

  const bars = [
    { name: 'Savings Rate',    score: hs.savingsRate.score,    max: hs.savingsRate.max,    detail: hs.savingsRate.label,    color: '#10b981' },
    { name: 'Emergency Fund',  score: hs.emergencyFund.score,  max: hs.emergencyFund.max,  detail: hs.emergencyFund.label,  color: '#6366f1' },
    { name: 'Debt Ratio',      score: hs.debtRatio.score,      max: hs.debtRatio.max,      detail: hs.debtRatio.label,      color: '#f59e0b' },
    { name: 'Investment Rate', score: hs.investmentRate.score, max: hs.investmentRate.max, detail: hs.investmentRate.label, color: '#8b5cf6' },
    { name: 'FIRE Progress',   score: hs.fireProgress.score,   max: hs.fireProgress.max,   detail: hs.fireProgress.label,   color: '#ef4444' },
  ]

  if (!hasData) {
    return (
      <div className="card p-5 flex flex-col gap-4">
        <p className="section-title">Financial Health Index</p>
        <div className="flex flex-col items-center justify-center gap-4 py-6 text-center">
          <div className="relative">
            <svg width={140} height={140} className="-rotate-90">
              <circle cx={70} cy={70} r={60} fill="none" stroke="#f5f5f4" strokeWidth={12} />
              <circle cx={70} cy={70} r={60} fill="none" stroke="#e7e5e4" strokeWidth={12}
                strokeDasharray="100 999" strokeLinecap="round" strokeDashoffset={0} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-surface-300">—</span>
              <span className="text-xs text-surface-300">/ 100</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-surface-800">No data yet</p>
            <p className="text-xs text-surface-300 mt-1 max-w-[200px]">
              Add a net worth snapshot or log a transaction to calculate your score
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-5 flex flex-col gap-4">
      <p className="section-title">Financial Health Index</p>

      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <ScoreRing score={hs.total} color={hs.color} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold" style={{ color: hs.color }}>{hs.total}</span>
            <span className="text-xs text-surface-300">/ 100</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-2xl font-bold" style={{ color: hs.color }}>{hs.grade}</span>
          <p className="text-sm font-semibold text-surface-800">{label.text}</p>
          <p className="text-xs text-surface-300 max-w-[200px] leading-relaxed">{label.sub}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 pt-3 border-t border-surface-100">
        {bars.map(b => (
          <MiniBar key={b.name} label={b.name} score={b.score} max={b.max} detail={b.detail} color={b.color} />
        ))}
      </div>
    </div>
  )
}
