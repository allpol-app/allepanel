'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/lib/context'

export default function Sidebar() {
  const path = usePathname()
  const user = useUser()
  const initials = user?.firstName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'

  return (
    <aside className="w-14 flex flex-col items-center justify-between bg-gray-900 py-4 shrink-0 h-screen sticky top-0">
      <div className="flex flex-col gap-2 items-center">
        <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center mb-4">
          <span className="text-white text-xs font-bold">AP</span>
        </div>
        <Link
          href="/dashboard"
          title="Zamówienia"
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${path.startsWith('/dashboard') || path.startsWith('/orders') ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </Link>
      </div>
      <Link
        href="/account"
        title="Konto"
        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${path.startsWith('/account') ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
      >
        {initials}
      </Link>
    </aside>
  )
}
