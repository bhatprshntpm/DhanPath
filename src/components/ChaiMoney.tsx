import { useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { monthlyCashFlow, fmtINR } from '../lib/calc'

const CHAI_PRICE = 20
// const SWIGGY_ORDER = 400

function insight(emoji: string, text: string) { return { emoji, text } }

export default function ChaiMoney() {
  const { data } = useApp()
  const { transactions, settings, scenarios, snapshots } = data
  const baseline     = scenarios.find(s => s.id === 'baseline') ?? scenarios[0]
  const sip          = baseline?.assumptions.extraMonthlySavings ?? 0
  const monthlyIncome = baseline?.assumptions.monthlyIncome ?? 0

  const thisMonth = new Date().toISOString().slice(0, 7)
  const cf        = monthlyCashFlow(transactions, thisMonth)

  const swiggySpend = transactions
    .filter(t => t.date.startsWith(thisMonth) && /swiggy|zomato|food|restaurant/i.test(t.note))
    .reduce((a, t) => a + t.amount, 0)

  const nw = snapshots.length
    ? Object.values(snapshots[snapshots.length - 1].assets).reduce((a, b) => a + b, 0)
    : 0

  const insights = useMemo(() => {
    const list = []

    if (swiggySpend > 0) {
      const chais  = Math.round(swiggySpend / CHAI_PRICE)
      const future = Math.round(swiggySpend * 12 * ((Math.pow(1.12, 20) - 1) / 0.12))
      list.push(insight('☕', `You spent ${fmtINR(swiggySpend)} on food delivery this month — that's ${chais} cups of chai! Invested monthly, it becomes ${fmtINR(future)} in 20 years.`))
    }

    if (sip > 0) {
      const sipYears = [5, 10, 20]
      const r = 0.12
      const vals = sipYears.map(y => Math.round(sip * 12 * ((Math.pow(1 + r, y) - 1) / r)))
      list.push(insight('📈', `Your SIP of ${fmtINR(sip)}/mo grows to ${fmtINR(vals[0])} in 5 yrs, ${fmtINR(vals[1])} in 10 yrs, and ${fmtINR(vals[2])} in 20 yrs at 12% returns.`))
    }

    if (cf.net > 0 && cf.income > 0) {
      const savRate = Math.round((cf.net / cf.income) * 100)
      list.push(insight('💸', `You saved ${savRate}% this month. The average Indian household saves only 10-15%. You're ${savRate > 20 ? 'well above' : savRate > 10 ? 'above' : 'at'} average.`))
    }

    if (monthlyIncome > 0) {
      const skipCoffee = 150 * 22
      const future = Math.round(skipCoffee * 12 * ((Math.pow(1.12, 10) - 1) / 0.12))
      list.push(insight('🏪', `Skipping one office coffee (₹150/day) and investing that ${fmtINR(skipCoffee)}/mo could give you ${fmtINR(future)} in 10 years.`))
    }

    if (nw > 0) {
      const diwaliYear = new Date().getFullYear() + Math.ceil(Math.log(2) / Math.log(1.12))
      list.push(insight('🪔', `At 12% returns, your wealth doubles roughly every 6 years. Your ${fmtINR(nw)} could become ${fmtINR(nw * 2)} by ${diwaliYear}.`))
    }

    if (settings.currentAge < 30) {
      const sip5k  = Math.round(5000 * 12 * ((Math.pow(1.12, 35) - 1) / 0.12))
      list.push(insight('🌱', `Starting a ₹5,000/mo SIP at age ${settings.currentAge} gives you ${fmtINR(sip5k)} by retirement. Starting at 35 gives only ${fmtINR(Math.round(5000 * 12 * ((Math.pow(1.12, 25) - 1) / 0.12)))}. Time is your biggest asset!`))
    }

    return list.slice(0, 3)
  }, [swiggySpend, sip, cf, monthlyIncome, nw, settings.currentAge])

  if (!insights.length) return null

  return (
    <div className="card p-5 flex flex-col gap-4">
      <p className="section-title">☕ Chai Money — Did You Know?</p>
      <div className="flex flex-col gap-3">
        {insights.map((ins, i) => (
          <div key={i} className="flex items-start gap-3 p-3 bg-amber-50/60 rounded-xl border border-amber-100">
            <span className="text-xl shrink-0">{ins.emoji}</span>
            <p className="text-xs text-surface-700 leading-relaxed">{ins.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
