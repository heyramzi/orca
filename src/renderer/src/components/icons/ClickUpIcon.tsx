export function ClickUpIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      {/* Why: flatten the official ClickUp product mark so it matches Orca's
      monochrome provider icons instead of rendering as a branded gradient. */}
      <path d="M2 18.439l3.69-2.828c1.961 2.56 4.044 3.739 5.89 3.739 1.836 0 3.862-1.165 5.737-3.706L21.06 18.4C18.353 22.068 14.98 24 11.616 24c-3.35 0-6.7-1.92-9.616-5.561z" />
      <path d="M11.606 7.019L5.05 12.68l-3.02-3.5L11.611 1l9.61 8.186-3.008 3.518z" />
    </svg>
  )
}
