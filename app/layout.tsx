import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AIVA — AI Marketing Platform',
  description: 'AIVA AI 마케팅 플랫폼',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'AIVA',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icon.png',
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#070a12',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="AIVA" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#070a12" />
      </head>
      <body>{children}</body>
    </html>
  )
}
