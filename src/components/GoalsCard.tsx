import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Pencil, Check, X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { fmt } from '../lib/calc'
import type { Goal } from '../types'

const EMOJIS = ['🏠','🚗','🎓','✈️','💍','👶','🏖️','💻','🏋️','🎸','🛥️','🌍','💊','🎯','🏦','🎨']

const PRIORITY_STYLES: Record<Goal['priority'], string> = {
  Must:   'border-rose-200 bg-rose-50 text-rose-600',
  Should: 'border-amber-200 bg-amber-50 text-amber-600',
  Nice:   'border-surface-200 bg-surface-50 text-surface-400',
}

const PRESET_GOALS: (Omit<Goal, 'id'> & { inflationRate: number })[] = [
  { name: 'Buy a House',      targetAge: 35, amountToday: 300000, inflate: true, priority: 'Must',   enabled: true, emoji: '🏠', inflationRate: 6 },
  { name: "Kid's Education",  targetAge: 48, amountToday: 150000, inflate: true, priority: 'Must',   enabled: true, emoji: '🎓', inflationRate: 8 },
  { name: 'Dream Vacation',   targetAge: 40, amountToday: 20000,  inflate: true, priority: 'Nice',   enabled: true, emoji: '✈️', inflationRate: 5 },
  { name: 'Car Upgrade',      targetAge: 38, amountToday: 50000,  inflate: true, priority: 'Should', enabled: true, emoji: '🚗', inflationRate: 4 },
  { name: 'Wedding Fund',     targetAge: 33, amountToday: 40000,  inflate: false,priority: 'Must',   enabled: true, emoji: '💍', inflationRate: 5 },
  { name: 'Emergency Fund',   targetAge: 32, amountToday: 30000,  inflate: false,priority: 'Must',   enabled: true, emoji: '🏦', inflationRate: 5 },
]

type GoalDraft = Omit<Goal, 'id'> & { inflationRate: number }

const BLANK_DRAFT: GoalDraft = {
  name: '', targetAge: 40, amountToday: 50000, inflate: true,
  priority: 'Must', enabled: true, emoji: '🎯', inflationRate: 6,
}

function GoalForm({
  initial,
  onSave,
  onCancel,
  currentAge,
  label,
}: {
  initial: GoalDraft
  onSave: (g: GoalDraft) => void
  onCancel: () => void
  currentAge: number
  label: string
}) {
  const [draft, setDraft] = useState<GoalDraft>({ ...initial })
  const yearsAway  = draft.targetAge - currentAge
  const inflated   = draft.inflate && yearsAway > 0
    ? draft.amountToday * Math.pow(1 + draft.inflationRate / 100, yearsAway)
    : draft.amountToday

  return (
    <div className="border border-amber-200 rounded-2xl p-4 bg-amber-50/40 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-700 uppercase tracking-widest">{label}</span>
        <button onClick={onCancel} className="text-surface-300 hover:text-rose-400 transition-colors"><X size={14}/></button>
      </div>

      <div className="flex gap-2">
        <select className="input-field w-14 text-lg text-center px-1 py-1" value={draft.emoji}
          onChange={e => setDraft(v => ({ ...v, emoji: e.target.value }))}>
          {EMOJIS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <input className="input-field flex-1" placeholder="Goal name" value={draft.name}
          onChange={e => setDraft(v => ({ ...v, name: e.target.value }))} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-surface-400 font-semibold uppercase tracking-widest">Target Age</label>
          <input className="input-field mt-0.5" type="number" min={currentAge + 1} max={100}
            value={draft.targetAge}
            onChange={e => setDraft(v => ({ ...v, targetAge: parseInt(e.target.value) || 40 }))} />
        </div>
        <div>
          <label className="text-[10px] text-surface-400 font-semibold uppercase tracking-widest">Amount Today ($)</label>
          <input className="input-field mt-0.5" type="number"
            value={draft.amountToday}
            onChange={e => setDraft(v => ({ ...v, amountToday: parseFloat(e.target.value) || 0 }))} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-surface-400 font-semibold uppercase tracking-widest">Priority</label>
          <select className="input-field mt-0.5" value={draft.priority}
            onChange={e => setDraft(v => ({ ...v, priority: e.target.value as Goal['priority'] }))}>
            <option>Must</option><option>Should</option><option>Nice</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] text-surface-400 font-semibold uppercase tracking-widest">Inflation Rate (%)</label>
          <input className="input-field mt-0.5" type="number" step="0.5" min={0} max={20}
            disabled={!draft.inflate}
            value={draft.inflationRate}
            onChange={e => setDraft(v => ({ ...v, inflationRate: parseFloat(e.target.value) || 0 }))} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-surface-800 cursor-pointer select-none">
        <input type="checkbox" checked={draft.inflate} className="accent-amber-500"
          onChange={e => setDraft(v => ({ ...v, inflate: e.target.checked }))} />
        Adjust for inflation
      </label>

      {draft.inflate && yearsAway > 0 && (
        <p className="text-xs text-amber-700 bg-amber-100 rounded-lg px-3 py-2">
          In {yearsAway} years at {draft.inflationRate}% inflation → <strong>{fmt(Math.round(inflated))}</strong>
        </p>
      )}

      <button
        disabled={!draft.name}
        onClick={() => draft.name && onSave(draft)}
        className="btn-primary flex items-center gap-1 justify-center disabled:opacity-40 disabled:cursor-not-allowed">
        <Check size={14}/> Add Goal
      </button>
    </div>
  )
}

export default function GoalsCard() {
  const { data, addGoal, updateGoal, deleteGoal } = useApp()
  const [expanded, setExpanded]       = useState(false)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [draftPreset, setDraftPreset] = useState<GoalDraft | null>(null)
  const [showCustom, setShowCustom]   = useState(false)

  const { settings } = data

  function saveGoal(draft: GoalDraft) {
    const { inflationRate: _ir, ...rest } = draft
    addGoal({ ...rest, inflate: draft.inflate })
    setDraftPreset(null)
    setShowCustom(false)
  }

  function saveEdit(draft: GoalDraft) {
    if (!editingId) return
    const { inflationRate: _ir, ...rest } = draft
    updateGoal({ ...rest, inflate: draft.inflate, id: editingId })
    setEditingId(null)
  }

  return (
    <div className="card p-4 sm:p-5 flex flex-col gap-4 col-span-full md:col-span-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title">Life Goals</p>
          <p className="text-xs text-surface-300">
            {data.goals.length} goal{data.goals.length !== 1 ? 's' : ''} · shown as emoji markers on the timeline
          </p>
        </div>
        <button data-expand="goals" className="btn-ghost" onClick={() => setExpanded(v => !v)}>
          {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        </button>
      </div>

      {/* Inline edit form — shown above chips when editing */}
      {editingId && (() => {
        const g = data.goals.find(x => x.id === editingId)
        if (!g) return null
        return (
          <GoalForm
            key={editingId}
            initial={{ ...g, inflationRate: settings.inflationRate }}
            label={`Edit — ${g.name}`}
            currentAge={settings.currentAge}
            onSave={saveEdit}
            onCancel={() => setEditingId(null)}
          />
        )
      })()}

      {/* Active goals chips */}
      <div className="flex flex-wrap gap-2">
        {data.goals.length === 0 && (
          <p className="text-xs text-surface-300 italic">No goals yet — add some below</p>
        )}
        {data.goals.map(g => {
          const yearsAway = g.targetAge - settings.currentAge
          const inflated  = g.inflate && yearsAway > 0
            ? g.amountToday * Math.pow(1 + settings.inflationRate / 100, Math.max(yearsAway, 0))
            : g.amountToday
          return (
            <div key={g.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-opacity cursor-pointer ${PRIORITY_STYLES[g.priority]} ${!g.enabled ? 'opacity-40' : ''}`}
              onClick={() => updateGoal({ ...g, enabled: !g.enabled })}
              title="Click to toggle on/off">
              <span>{g.emoji}</span>
              <div>
                <div>{g.name}</div>
                <div className="font-normal opacity-70">Age {g.targetAge} · {fmt(Math.round(inflated))}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); setEditingId(g.id) }}
                className="opacity-40 hover:opacity-100 transition-opacity ml-1">
                <Pencil size={11}/>
              </button>
              <button onClick={e => { e.stopPropagation(); deleteGoal(g.id) }}
                className="opacity-40 hover:opacity-100 transition-opacity">
                <Trash2 size={11}/>
              </button>
            </div>
          )
        })}
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 pt-2 border-t border-surface-100 animate-fade-up">

          {/* Preset quick-add buttons — click to open editable form */}
          {!draftPreset && !showCustom && (
            <div>
              <p className="text-xs text-surface-300 font-medium mb-2">
                Quick add — click to configure before adding
              </p>
              <div className="flex flex-wrap gap-2">
                {PRESET_GOALS
                  .filter(p => !data.goals.find(g => g.name === p.name))
                  .map(p => (
                    <button key={p.name}
                      onClick={() => setDraftPreset({ ...p })}
                      className="text-xs px-3 py-1.5 rounded-xl border border-surface-200 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 transition-colors text-surface-800">
                      {p.emoji} {p.name}
                    </button>
                  ))
                }
                <button onClick={() => setShowCustom(true)}
                  className="btn-primary flex items-center gap-1 text-xs px-3 py-1.5">
                  <Plus size={12}/> Custom
                </button>
              </div>
            </div>
          )}

          {/* Preset draft form */}
          {draftPreset && (
            <GoalForm
              initial={draftPreset}
              label={`Configure — ${draftPreset.name}`}
              currentAge={settings.currentAge}
              onSave={saveGoal}
              onCancel={() => setDraftPreset(null)}
            />
          )}

          {/* Custom goal form */}
          {showCustom && (
            <GoalForm
              initial={BLANK_DRAFT}
              label="New Custom Goal"
              currentAge={settings.currentAge}
              onSave={saveGoal}
              onCancel={() => setShowCustom(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}
