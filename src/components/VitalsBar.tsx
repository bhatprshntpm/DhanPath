import { useMemo } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { useApp } from '../context/AppContext'
import {
  netWorth, fmtINR, trueFireAge,
  totalAssets, totalLiabilities, requiredMonthlySIP, sipToHitFIREAge,
} from '../lib/calc'

export default function VitalsBar() {
  const { data } = useApp()
  const { snapshots, settings, scenarios, goals, holdings } = data

  const currentMonth = new Date().toISOString().slice(0, 7)

  // Only use past/present snapshots — exclude future-dated EPF projections
  const sorted = useMemo(
    () => [...snapshots]
      .filter(s => s.date.slice(0, 7) <= currentMonth)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [snapshots, currentMonth],
  )
  const latest = sorted.at(-1)
  // Previous = most recent snapshot from a different calendar month (not just previous row)
  const prevMonth = useMemo(
    () => {
      const latestMonth = latest?.date.slice(0, 7) ?? ''
      return [...sorted].reverse().find(s => s.date.slice(0, 7) < latestMonth) ?? null
    },
    [sorted, latest],
  )

  const nwNow = useMemo(() => {
    if (holdings.length > 0) {
      const invested  = holdings.reduce((a, h) => a + h.value, 0)
      const cashExtra = latest ? latest.assets.checking + latest.assets.savings + latest.assets.realEstate : 0
      const liab      = latest ? totalLiabilities(latest) : 0
      return invested + cashExtra - liab
    }
    return latest ? totalAssets(latest) - totalLiabilities(latest) : 0
  }, [holdings, latest])

  const nwPrev    = prevMonth ? netWorth(prevMonth) : 0
  const momChange = nwNow - nwPrev
  const isUp      = momChange >= 0

  const baseline  = scenarios.find(s => s.enabled && s.id === 'baseline') ?? scenarios.find(s => s.enabled)

  const effectiveScenario = useMemo(() => {
    if (!baseline) return null
    // Kite SIP total takes precedence over manually-entered existingSIP
    const activeSIP = settings.kiteMonthlyInvestment ?? (settings.existingSIP > 0 ? settings.existingSIP : undefined)
    return {
      ...baseline,
      assumptions: {
        ...baseline.assumptions,
        extraMonthlySavings: activeSIP ?? (baseline.assumptions.extraMonthlySavings ?? 0),
        monthlyExpenses: (settings.monthlyExpenses ?? 60000) + (settings.monthlyEMI ?? 0),
      },
    }
  }, [baseline, settings])

  const fireAge = useMemo(() => {
    if (!effectiveScenario) return null
    return trueFireAge(nwNow, settings, effectiveScenario, goals.filter(g => g.enabled))
  }, [effectiveScenario, nwNow, settings, goals])

  // How much more to invest to hit the TARGET retirement age
  const targetAge = settings.retirementAge
  const gapYears  = fireAge !== null ? fireAge - targetAge : null
  const sipToClose = useMemo(() => {
    if (!effectiveScenario || !gapYears || gapYears <= 0) return null
    return sipToHitFIREAge(targetAge, nwNow, settings, effectiveScenario, goals.filter(g => g.enabled))
  }, [effectiveScenario, gapYears, targetAge, nwNow, settings, goals])
  const currentInvestmentForGap = settings.kiteMonthlyInvestment
    ?? (settings.existingSIP > 0 ? settings.existingSIP : 0)
  const additionalNeeded = sipToClose !== null ? Math.max(0, sipToClose - currentInvestmentForGap) : null

  const requiredSIP = useMemo(() => {
    const enabled = goals.filter(g => g.enabled)
    if (!baseline || enabled.length === 0) return null
    return requiredMonthlySIP(nwNow, settings, baseline, enabled)
  }, [baseline, nwNow, settings, goals])

  const hasData = nwNow > 0

  if (!hasData) return null

  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-4 px-1 py-2">
      {/* Net worth — primary number */}
      <div>
        <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-0.5">Net Worth</p>
        <p className="text-4xl sm:text-5xl font-bold tracking-tight text-surface-900 leading-none">
          {fmtINR(nwNow)}
        </p>
        {prevMonth && nwPrev > 0 && (
          <p className={`flex items-center gap-1 text-xs font-semibold mt-1.5 ${isUp ? 'text-emerald-600' : 'text-rose-500'}`}>
            {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {isUp ? '+' : ''}{fmtINR(momChange)} vs last month
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="hidden sm:block w-px h-10 bg-surface-100" />

      {/* FIRE age — shows target vs actual when they differ */}
      {fireAge && (
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-0.5">Financial Independence</p>
          {gapYears && gapYears > 0 ? (
            // Target not yet funded — show both sides
            <>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-amber-500 leading-none">Age {fireAge}</p>
                <p className="text-xs text-surface-400 line-through">Target: {targetAge}</p>
              </div>
              <p className="text-xs mt-1.5 text-amber-600">
                {gapYears} yr{gapYears !== 1 ? 's' : ''} past target
                {additionalNeeded != null && additionalNeeded > 0
                  ? ` · +${fmtINR(additionalNeeded)}/mo to retire at ${targetAge}`
                  : ''}
              </p>
            </>
          ) : (
            // On track or ahead
            <>
              <p className="text-2xl font-bold text-amber-500 leading-none">Age {fireAge}</p>
              <p className="text-xs text-surface-400 mt-1.5">
                {fireAge - settings.currentAge > 0
                  ? `${fireAge - settings.currentAge} years away${fireAge < targetAge ? ` · ${targetAge - fireAge} yrs ahead of target` : ''}`
                  : "You've reached it"}
              </p>
            </>
          )}
        </div>
      )}

      {/* Divider */}
      {fireAge && requiredSIP && <div className="hidden sm:block w-px h-10 bg-surface-100" />}

      {/* Monthly SIP needed */}
      {requiredSIP != null && goals.filter(g => g.enabled).length > 0 && (() => {
        const currentInvestment = settings.kiteMonthlyInvestment
          ?? (settings.existingSIP > 0 ? settings.existingSIP : (baseline?.assumptions.extraMonthlySavings ?? 0))
        const gap = requiredSIP - currentInvestment
        const fromKite = settings.kiteMonthlyInvestment != null
        return (
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-0.5">
              Invest towards {goals.filter(g => g.enabled).length} goal{goals.filter(g => g.enabled).length !== 1 ? 's' : ''}
            </p>
            <p className="text-2xl font-bold text-surface-800 leading-none">{fmtINR(requiredSIP)}/mo</p>
            <p className={`text-xs mt-1.5 ${
              !currentInvestment ? 'text-surface-400' :
              gap <= 0 ? 'text-emerald-600' : 'text-amber-600'
            }`}>
              {fromKite ? (
                gap <= 0
                  ? `✓ ₹${(currentInvestment/1000).toFixed(0)}k Kite SIPs cover your goals`
                  : `₹${(currentInvestment/1000).toFixed(0)}k Kite SIPs · +${fmtINR(gap)} gap`
              ) : currentInvestment > 0 ? (
                gap <= 0
                  ? `✓ investing ${fmtINR(currentInvestment)}/mo — goals covered`
                  : `investing ${fmtINR(currentInvestment)}/mo · +${fmtINR(gap)} more needed`
              ) : 'connect Kite or set SIP in scenarios'}
            </p>
          </div>
        )
      })()}
    </div>
  )
}
