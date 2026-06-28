import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import {
  fmtINR, projectLifetime, fireNumber, requiredMonthlySIP,
  totalAssets, totalLiabilities,
} from '../lib/calc'

export default function PlanSummary() {
  const { data } = useApp()
  const { settings, snapshots, scenarios, goals, holdings } = data

  const baseline = scenarios.find(s => s.enabled && s.id === 'baseline') ?? scenarios.find(s => s.enabled)

  const nwNow = useMemo(() => {
    if (holdings.length > 0) {
      const invested = holdings.reduce((a, h) => a + h.value, 0)
      const sorted   = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
      const latest   = sorted.at(-1)
      const cashExtra = latest ? latest.assets.checking + latest.assets.savings + latest.assets.realEstate : 0
      const liab      = latest ? totalLiabilities(latest) : 0
      return invested + cashExtra - liab
    }
    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
    const latest = sorted.at(-1)
    return latest ? totalAssets(latest) - totalLiabilities(latest) : 0
  }, [holdings, snapshots])

  const proj = useMemo(() =>
    baseline ? projectLifetime(nwNow, settings, baseline, goals.filter(g => g.enabled)) : [],
  [baseline, nwNow, settings, goals])

  const fireTarget = settings.monthlyExpenses > 0
    ? fireNumber(settings.monthlyExpenses, settings.safeWithdrawalRate)
    : 0

  const currentYear  = new Date().getFullYear()
  const firePoint    = proj.find(p => p.value >= fireTarget && p.phase === 'accumulation')
  const fireAge      = firePoint ? settings.currentAge + (firePoint.year - currentYear) : null

  const enabledGoals = goals.filter(g => g.enabled)
  const requiredSIP  = useMemo(() => {
    if (!baseline || enabledGoals.length === 0) return null
    return requiredMonthlySIP(nwNow, settings, baseline, enabledGoals)
  }, [baseline, nwNow, settings, enabledGoals])

  const currentSIP = baseline?.assumptions.extraMonthlySavings ?? 0

  const atRiskGoals = proj.filter(p => p.goalAtRisk).flatMap(p => p.goalNames.filter(n => n.includes('⚠'))).length
  const allGoalsFunded = enabledGoals.length > 0 && atRiskGoals === 0

  if (nwNow === 0 && enabledGoals.length === 0) return null

  const name = settings.name || 'You'
  const age  = settings.currentAge

  function buildNarrative(): string {
    const parts: string[] = []

    if (nwNow > 0) {
      parts.push(`${name}, ${age} — with ${fmtINR(nwNow)} saved today`)
    }

    if (fireAge) {
      const yearsToFire = fireAge - age
      if (yearsToFire <= 0) {
        parts.push(`you've already reached your FIRE number — your savings can fund retirement`)
      } else if (yearsToFire <= 5) {
        parts.push(`you're on track to reach financial independence at ${fireAge} — just ${yearsToFire} years away`)
      } else {
        parts.push(`you're projected to reach financial independence at age ${fireAge}`)
      }
    }

    if (enabledGoals.length > 0 && requiredSIP != null) {
      if (allGoalsFunded) {
        parts.push(`all ${enabledGoals.length} goals look fully funded on your current plan`)
      } else if (requiredSIP > currentSIP) {
        const gap = requiredSIP - currentSIP
        parts.push(`to fund all ${enabledGoals.length} goal${enabledGoals.length !== 1 ? 's' : ''}, you need ${fmtINR(requiredSIP)}/mo — ${fmtINR(gap)}/mo more than now`)
      } else {
        parts.push(`your current SIP of ${fmtINR(currentSIP)}/mo is enough to fund all ${enabledGoals.length} goals`)
      }
    }

    if (parts.length === 0) return ''
    const [first, ...rest] = parts
    const cap = first.charAt(0).toUpperCase() + first.slice(1)
    return rest.length > 0 ? `${cap}. ${rest.join('. ')}.` : `${cap}.`
  }

  const narrative = buildNarrative()
  if (!narrative) return null

  return (
    <div className="card px-5 py-4 border-l-4 border-amber-400 bg-amber-50/40">
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5">🧭</span>
        <div>
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-widest mb-1">Your Plan at a Glance</p>
          <p className="text-sm text-surface-800 leading-relaxed">{narrative}</p>
          {atRiskGoals > 0 && (
            <p className="text-xs text-rose-600 mt-2 font-medium">
              ⚠ {atRiskGoals} goal{atRiskGoals !== 1 ? 's' : ''} may be underfunded at current savings pace.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
