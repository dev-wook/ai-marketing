export function AivaLogoImage({ className }: { className?: string }) {
  return (
    <img
      src="/aiva-logo.png"
      alt="AIVA logo"
      className={`${className ?? ''} rounded-md object-cover shadow-[0_0_26px_rgba(34,211,238,0.18)]`}
    />
  )
}
