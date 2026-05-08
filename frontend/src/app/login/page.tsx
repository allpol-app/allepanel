'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [form, setForm] = useState({ email: '', password: '', firstName: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      if (mode === 'login') {
        await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: form.email, password: form.password }) })
      } else {
        await api('/auth/register', { method: 'POST', body: JSON.stringify(form) })
      }
      router.push('/dashboard')
    } catch (err: any) {
      setError(err?.message || 'Błąd logowania')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">AP</span>
          </div>
          <span className="text-xl font-semibold">AllePanel</span>
        </div>

        <div className="flex rounded-lg border border-gray-200 mb-6 overflow-hidden">
          {(['login', 'register'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError('') }}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${mode === m ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {m === 'login' ? 'Logowanie' : 'Rejestracja'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === 'register' && (
            <input
              className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500"
              placeholder="Imię"
              value={form.firstName}
              onChange={e => set('firstName', e.target.value)}
              required
            />
          )}
          <input
            className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            required
          />
          <input
            className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500"
            type="password"
            placeholder="Hasło"
            value={form.password}
            onChange={e => set('password', e.target.value)}
            required
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Ładowanie...' : mode === 'login' ? 'Zaloguj się' : 'Zarejestruj się'}
          </button>
        </form>
      </div>
    </div>
  )
}
