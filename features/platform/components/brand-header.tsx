import { AivaLogoImage } from './aiva-logo-image'

export function BrandHeader({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-md text-left transition hover:opacity-85 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/20"
      aria-label="AIVA 메인 화면으로 이동"
    >
      <AivaLogoImage className="h-12 w-12" />
      <div>
        <h1 className="text-xl font-black tracking-[0.16em]">AIVA</h1>
        <p className="text-xs font-bold text-slate-400">AI Marketing Platform</p>
      </div>
    </button>
  )
}
