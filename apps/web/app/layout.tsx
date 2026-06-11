import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Ghosted — silence, measured.',
  description: 'Ghosted turns the silence of your job search into data and next actions.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
