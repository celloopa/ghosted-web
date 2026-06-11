'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { strings } from '../lib/strings'

const tabs = [
  { href: '/', label: 'Today' },
  { href: '/applications', label: 'Applications' },
  { href: '/stats', label: 'Stats' },
  { href: '/settings', label: 'Settings' },
]

export function Nav() {
  const path = usePathname()
  return (
    <nav className="nav">
      <Link href="/" className="nav-brand">
        Ghosted <span className="dim nav-tag">{strings.tagline}</span>
      </Link>
      <div className="nav-tabs">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`nav-tab${path === t.href || (t.href !== '/' && path?.startsWith(t.href)) ? ' nav-tab-active' : ''}`}
          >
            {t.label}
          </Link>
        ))}
        <Link href="/apply" className="btn btn-primary nav-add">
          Apply
        </Link>
      </div>
    </nav>
  )
}
