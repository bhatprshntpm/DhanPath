import { Upload } from 'lucide-react'

interface EmptyStateProps {
  title:       string
  description: string
  cta?:        string
  onCta?:      () => void
  footnote?:   string
}

export default function EmptyState({ title, description, cta, onCta, footnote }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 text-center">
      <div className="w-10 h-10 rounded-full bg-surface-100 flex items-center justify-center">
        <Upload size={16} className="text-surface-300" />
      </div>
      <div>
        <p className="text-sm font-semibold text-surface-700">{title}</p>
        <p className="text-xs text-surface-400 mt-1 max-w-[260px] leading-relaxed">{description}</p>
      </div>
      {cta && onCta && (
        <button onClick={onCta}
          className="text-xs font-semibold text-amber-600 hover:text-amber-700 underline underline-offset-2 transition-colors">
          {cta}
        </button>
      )}
      {footnote && <p className="text-[10px] text-surface-300">{footnote}</p>}
    </div>
  )
}
