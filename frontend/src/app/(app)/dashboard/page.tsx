'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

const TABS = [
  { key: 'inpost', label: 'InPost', color: 'bg-orange-500' },
  { key: 'dpd', label: 'DPD', color: 'bg-red-600' },
  { key: 'dhl', label: 'DHL', color: 'bg-yellow-500' },
  { key: 'ups', label: 'UPS', color: 'bg-amber-800' },
  { key: 'other', label: 'Inne', color: 'bg-gray-400' },
  { key: 'sent', label: 'Wysłane', color: 'bg-green-600' },
  { key: 'cancelled', label: 'Anulowane', color: 'bg-red-400' },
  { key: 'unpaid', label: 'Nieopłacone', color: 'bg-yellow-600' },
]

type OrderItem = {
  productName?: string
  productImageUrl?: string
  quantity?: number
  externalOfferId?: string
}

function groupItems(items: OrderItem[] = []) {
  const map = new Map<string, OrderItem & { quantity: number }>()

  for (const i of items) {
    const key = `${i.productName}|${i.productImageUrl}|${i.externalOfferId}`
    const existing = map.get(key)

    if (existing) {
      existing.quantity += Number(i.quantity || 1)
    } else {
      map.set(key, {
        productName: i.productName,
        productImageUrl: i.productImageUrl,
        externalOfferId: i.externalOfferId,
        quantity: Number(i.quantity || 1),
      })
    }
  }

  return Array.from(map.values())
}

function OrderImages({ items }: { items: OrderItem[] }) {
  const grouped = useMemo(() => groupItems(items), [items])
  const first = grouped[0]

  if (!first) {
    return (
      <div className="w-16 h-16 shrink-0 rounded-md border border-gray-200 bg-gray-100 flex items-center justify-center text-gray-400">
        📦
      </div>
    )
  }

  return (
    <div className="w-20 h-20 shrink-0 relative rounded-md overflow-hidden border border-gray-200 bg-gray-100">
      {first.productImageUrl ? (
        <img src={first.productImageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400">📦</div>
      )}

      {first.quantity > 1 && (
        <div className="absolute bottom-0 right-0 text-[10px] bg-white/80 text-black px-1 rounded-tl">
          x{first.quantity}
        </div>
      )}
    </div>
  )
}

function getStatusBadge(order: any) {
  const fulfillment = order.externalFulfillmentStatus || order.status || '—'

  if (['READY_FOR_SHIPMENT', 'SENT', 'PICKED_UP', 'READY_FOR_PICKUP'].includes(fulfillment)) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">{fulfillment}</span>
  }

  if (String(order.externalOrderStatus || '').includes('CANCELLED')) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">{order.externalOrderStatus}</span>
  }

  if (order.externalOrderStatus === 'BOUGHT') {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">BOUGHT</span>
  }

  return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{fulfillment}</span>
}

function OrderRow({ order }: { order: any }) {
  const router = useRouter()

  const name =
    order.deliveryFirstName && order.deliveryLastName
      ? `${order.deliveryFirstName} ${order.deliveryLastName}`
      : order.buyerFirstName || order.buyerLogin || 'Nieznany kupujący'

  const date = order.orderCreatedAt
    ? new Date(order.orderCreatedAt).toLocaleDateString('pl-PL')
    : '—'

  const items = order.items || []
  const grouped = groupItems(items)

  return (
    <div
      onClick={() => router.push(`/orders/${order.id}`)}
      className="flex items-start gap-4 px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors"
    >
      <OrderImages items={items} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-medium text-sm truncate">{name}</div>
          {getStatusBadge(order)}
        </div>

        <div className="text-xs text-gray-400">
          {order.marketplaceAccount?.accountName || '—'} · #{String(order.externalOrderId || '').slice(0, 12)}
        </div>

        <div className="mt-1 text-xs text-gray-500 space-y-0.5">
          {grouped.map((i, idx) => (
            <div key={idx}>
              <span className="font-medium">{i.quantity}x</span> {i.productName}
            </div>
          ))}
        </div>
      </div>

      <div className="text-right shrink-0 max-w-xs">
        <div className="text-sm font-semibold">
          {order.totalAmount ? `${Number(order.totalAmount).toFixed(2)} ${order.currency}` : '—'}
        </div>
        <div className="text-xs text-gray-400 mt-0.5 truncate">
          {order.deliveryMethodName || '—'}
        </div>
        <div className="text-xs text-gray-400">{date}</div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState<any>(null)
  const [tab, setTab] = useState('inpost')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  async function loadSegments() {
    const d = await api('/orders/segments?limit=100')
    setData(d)
  }

  useEffect(() => {
    loadSegments().finally(() => setLoading(false))
  }, [])

  async function sync() {
    setSyncing(true)
    setSyncMsg('')

    try {
      const r = await api('/integrations/allegro/orders/sync-all', {
        method: 'POST',
      })

      setSyncMsg(`Zsynchronizowano konta: ${r.accountsSynced}`)
      await loadSegments()
    } catch {
      setSyncMsg('Błąd synchronizacji')
    } finally {
      setSyncing(false)
    }
  }

  const summary = data?.summary || {}
  const lists = data?.lists || {}
  const orders: any[] = lists[tab] || []

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold">Zamówienia</h1>

        <div className="flex items-center gap-3">
          {syncMsg && <span className="text-xs text-gray-500">{syncMsg}</span>}

          <button
            onClick={sync}
            disabled={syncing}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {syncing ? 'Synchronizuję...' : '↻ Synchronizuj Allegro'}
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'bg-white shadow border border-gray-200 text-gray-900'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${t.color}`} />
            {t.label}
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${
                tab === t.key
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {summary[t.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
            Brak zamówień
          </div>
        ) : (
          orders.map((o) => <OrderRow key={o.id} order={o} />)
        )}
      </div>
    </div>
  )
} 