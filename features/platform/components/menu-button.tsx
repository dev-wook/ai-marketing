export function MenuButton({
  active = false,
  disabled = false,
  label,
  onClick,
}: {
  active?: boolean
  disabled?: boolean
  label: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-4 py-3 text-left transition ${
        active
          ? 'border-cyan-300/45 bg-cyan-300/10 shadow-[0_0_24px_rgba(34,211,238,0.16)]'
          : 'border-white/8 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.06]'
      } ${disabled ? 'cursor-not-allowed opacity-45 hover:border-white/8 hover:bg-white/[0.03]' : ''}`}
    >
      <span className="block break-keep text-base font-black text-white">{label}</span>
    </button>
  )
}
