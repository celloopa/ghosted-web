import type { Metadata } from 'next'
import './globals.css'
import { Nav } from '../components/Nav'
import { RepoProvider } from '../lib/useApps'

export const metadata: Metadata = {
  title: 'Ghosted — silence, measured.',
  description: 'Ghosted turns the silence of your job search into data and next actions.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RepoProvider>
          <Nav />
          <main className="page">{children}</main>
        </RepoProvider>
      </body>
    </html>
  )
}
