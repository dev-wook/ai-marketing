import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AIVA — AI Marketing Platform',
  description: 'AIVA AI 마케팅 플랫폼',
  icons: {
    icon: '/icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
