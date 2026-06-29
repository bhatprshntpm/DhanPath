import { useMemo } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { useApp } from '../context/AppContext'
import {
  netWorth, fmtINR, trueFireAge,
  totalAssets, totalLiabilities, requiredMonthlySIP,
} from '../lib/calc'

export default function VitalsBar() {
  const { data } = useApp()
  const { snapshots, settings, scenarios, goals, holdings } = data

  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => a.date.localeCompare(b.date)),
    [snapshots],
  )
  const latest    = sorted.at(-1)
  const prevMonth = sorted.at(-2)

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
    return {
      ...baseline,
      assumptions: {
        ...baseline.assumptions,
        extraMonthlySavings: settings.existingSIP > 0 ? settings.existingSIP : (baseline.assumptions.extraMonthlySavings ?? 0),
        monthlyExpenses: (settings.monthlyExpenses ?? 60000) + (settings.monthlyEMI ?? 0),
      },
    }
  }, [baseline, settings])

  const fireAge = useMemo(() => {
    if (!effectiveScenario) return null
    return trueFireAge(nwNow, settings, effectiveScenario, goals.filter(g => g.enabled))
  }, [effectiveScenario, nwNow, settings, goals])

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
        {nwPrev > 0 && (
          <p className={`flex items-center gap-1 text-xs font-semibold mt-1.5 ${isUp ? 'text-emerald-600' : 'text-rose-500'}`}>
            {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {isUp ? '+' : ''}{fmtINR(momChange)} this month
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="hidden sm:block w-px h-10 bg-surface-100" />

      {/* FIRE age */}
      {fireAge && (
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-0.5">Financial Independence</p>
          <p className="text-2xl font-bold text-amber-500 leading-none">Age {fireAge}</p>
          <p className="text-xs text-surface-400 mt-1.5">
            {fireAge - settings.currentAge > 0
              ? `${fireAge - settings.currentAge} years away`
              : 'You\'ve reached it'}
          </p>
        </div>
      )}

      {/* Divider */}
      {fireAge && requiredSIP && <div className="hidden sm:block w-px h-10 bg-surface-100" />}

      {/* Monthly SIP needed */}
      {requiredSIP != null && goals.filter(g => g.enabled).length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest font-semibold text-surface-300 mb-0.5">
            Invest towards {goals.filter(g => g.enabled).length} goal{goals.filter(g => g.enabled).length !== 1 ? 's' : ''}
          </p>
          <p className="text-2xl font-bold text-surface-800 leading-none">{fmtINR(requiredSIP)}/mo</p>
          <p className="text-xs text-surface-400 mt-1.5">
            {baseline?.assumptions.extraMonthlySavings
              ? `investing ${fmtINR(baseline.assumptions.extraMonthlySavings)}/mo now`
              : 'set your SIP in scenarios'}
          </p>
        </div>
      )}
    </div>
  )
}
