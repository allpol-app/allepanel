'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { UserContext, type User } from '@/lib/context'
import Sidebar from '@/components/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => {
    api('/auth/me').then(d => {
      if (!d.user) router.replace('/login')
      else setUser(d.user)
    }).catch(() => router.replace('/login'))
  }, [])

  if (user === undefined) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <UserContext.Provider value={user}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </UserContext.Provider>
  )
}
