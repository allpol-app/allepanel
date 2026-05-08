const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export const API_BASE = API

export async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...((opts.headers as Record<string, string>) || {}),
    },
  })

  if (res.status === 401) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 })
  }

  const ct = res.headers.get('content-type')

  if (!res.ok) {
    const err = ct?.includes('json') ? await res.json() : await res.text()
    throw typeof err === 'object' && err !== null ? err : new Error(String(err))
  }

  return ct?.includes('json') ? res.json() : res
}

export async function fetchTextFile(path: string): Promise<string> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
  })

  if (res.status === 401) {
    throw Object.assign(new Error('Unauthorized'), { status: 401 })
  }

  if (!res.ok) {
    const ct = res.headers.get('content-type')
    const err = ct?.includes('json') ? await res.json() : await res.text()
    throw typeof err === 'object' && err !== null ? err : new Error(String(err))
  }

  return res.text()
}

export const ALLEGRO_START = `${API}/integrations/allegro/start`