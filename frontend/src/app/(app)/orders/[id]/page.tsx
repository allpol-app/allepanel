'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { API_BASE, api, fetchTextFile } from '@/lib/api'
import { printZplWithQz } from '@/lib/qzPrint'

type ShipmentTabKey = 'ALLEGRO' | 'INPOST_COURIER' | 'INPOST_LOCKER' | 'TEMU_SHIPPING' | 'OTHER'

type ParcelRow = {
  weightKg: string
  lengthCm: string
  widthCm: string
  heightCm: string
  template: string
}

const TAB_LABELS: Record<ShipmentTabKey, string> = {
  ALLEGRO: 'Allegro.pl',
  INPOST_COURIER: 'InPost Kurier',
  INPOST_LOCKER: 'InPost Paczkomaty',
  TEMU_SHIPPING: 'Temu Shipping',
  OTHER: 'Inne',
}

const TAB_ORDER: ShipmentTabKey[] = [
  'ALLEGRO',
  'INPOST_COURIER',
  'INPOST_LOCKER',
  'TEMU_SHIPPING',
  'OTHER',
]

const LOCKER_SIZE_DIMENSIONS: Record<
  string,
  { weightKg: string; lengthCm: string; widthCm: string; heightCm: string }
> = {
  A: { weightKg: '1', lengthCm: '64', widthCm: '38', heightCm: '8' },
  B: { weightKg: '1', lengthCm: '64', widthCm: '38', heightCm: '19' },
  C: { weightKg: '1', lengthCm: '64', widthCm: '38', heightCm: '41' },
}

const INPOST_LOCKER_SIZES = [
  { key: 'A', label: 'Gabaryt A', hint: '8 × 38 × 64 cm' },
  { key: 'B', label: 'Gabaryt B', hint: '19 × 38 × 64 cm' },
  { key: 'C', label: 'Gabaryt C', hint: '41 × 38 × 64 cm' },
]

const PACKAGE_TEMPLATES = [
  { key: '', label: '— wybierz —', values: null },
  {
    key: 'small',
    label: 'Mała 30 × 20 × 10 / 1 kg',
    values: { weightKg: '1', lengthCm: '30', widthCm: '20', heightCm: '10' },
  },
  {
    key: 'medium',
    label: 'Średnia 40 × 30 × 20 / 2 kg',
    values: { weightKg: '2', lengthCm: '40', widthCm: '30', heightCm: '20' },
  },
  {
    key: 'large',
    label: 'Duża 65 × 45 × 45 / 16 kg',
    values: { weightKg: '16', lengthCm: '65', widthCm: '45', heightCm: '45' },
  },
]

function inputClass(extra = '') {
  return `h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100 disabled:text-gray-400 ${extra}`
}

function selectClass(extra = '') {
  return `h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100 disabled:text-gray-400 ${extra}`
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

function money(value: any, currency = 'PLN') {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(2)} ${currency || 'PLN'}`
}

function datePL(value?: string | null) {
  if (!value) return '—'

  try {
    return new Date(value).toLocaleString('pl-PL')
  } catch {
    return '—'
  }
}

function compactId(value?: string | null) {
  if (!value) return '—'
  return value.length > 18 ? `${value.slice(0, 18)}…` : value
}

function toText(value: any) {
  if (value === null || value === undefined) return ''
  return String(value)
}

function getInitialParcels(options: any): ParcelRow[] {
  return [
    {
      weightKg: toText(options?.defaults?.package?.weightKg || ''),
      lengthCm: toText(options?.defaults?.package?.lengthCm || ''),
      widthCm: toText(options?.defaults?.package?.widthCm || ''),
      heightCm: toText(options?.defaults?.package?.heightCm || ''),
      template: '',
    },
  ]
}

function calculateVolumetricWeight(row: ParcelRow) {
  const length = Number(row.lengthCm)
  const width = Number(row.widthCm)
  const height = Number(row.heightCm)

  if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(height)) return null
  if (length <= 0 || width <= 0 || height <= 0) return null

  return (length * width * height) / 6000
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-gray-200 bg-white shadow-sm ${className}`}>{children}</div>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-gray-900">{children}</h2>
}

function MoneyInput({
  value,
  onChange,
  placeholder = '0.00',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex">
      <input
        className={`${inputClass()} rounded-r-none`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <span className="inline-flex h-9 items-center rounded-r-md border border-l-0 border-gray-300 bg-gray-50 px-3 text-xs text-gray-500">
        PLN
      </span>
    </div>
  )
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const router = useRouter()

  const [order, setOrder] = useState<any>(null)
  const [options, setOptions] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [activeTab, setActiveTab] = useState<ShipmentTabKey>('OTHER')
  const [form, setForm] = useState<any>({})
  const [parcels, setParcels] = useState<ParcelRow[]>([
    { weightKg: '', lengthCm: '', widthCm: '', heightCm: '', template: '' },
  ])
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [printingShipmentId, setPrintingShipmentId] = useState<number | null>(null)
  const [printMsg, setPrintMsg] = useState('')

  useEffect(() => {
    let alive = true

    async function load() {
      setLoading(true)
      setError('')
      setResult(null)
      setPrintMsg('')

      try {
        const [orderData, optionsData] = await Promise.all([
          api(`/orders/${id}`),
          api(`/shipments/orders/${id}/options`),
        ])

        if (!alive) return

        const defaultTab = (optionsData?.defaultTab || 'OTHER') as ShipmentTabKey
        const defaultParcelSize = toText(optionsData?.defaults?.package?.parcelSize || 'B')

        setOrder(orderData)
        setOptions(optionsData)
        setActiveTab(defaultTab)
        setParcels(getInitialParcels(optionsData))
        setForm({
          shippingAccountId: toText(optionsData?.defaults?.account?.inpostShippingAccountId || ''),
          marketplaceAccountId: toText(optionsData?.defaults?.account?.allegroMarketplaceAccountId || ''),
          deliveryMethodId: toText(optionsData?.defaults?.allegro?.selectedDeliveryMethodId || ''),
          credentialsId: toText(optionsData?.defaults?.allegro?.selectedCredentialsId || ''),
          parcelSize: LOCKER_SIZE_DIMENSIONS[defaultParcelSize] ? defaultParcelSize : 'B',
          packageType: 'Paczka',
          codAmount: '',
          insuranceAmount: '0.00',
          description: toText(optionsData?.defaults?.package?.description || ''),
          reference: toText(optionsData?.order?.id || optionsData?.defaults?.package?.reference || ''),
          returnLabel: false,
          weekendDelivery: false,
          smsNotification: false,
          emailNotification: false,
          saturdayDelivery: false,
          documentReturn: false,
          nonStandard: false,
          labelFormat: 'PDF',
        })
      } catch (e: any) {
        if (!alive) return
        setError(e?.message || 'Nie udało się załadować zamówienia.')
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()

    return () => {
      alive = false
    }
  }, [id])

  const o = order?.order || order
  const items = order?.items || o?.items || options?.items || []
  const receiver = options?.receiver || {}
  const tabs = options?.tabs || []
  const allegroServices = options?.providers?.allegro?.services || []
  const inpostAccounts = options?.providers?.inpostShipx?.accounts || []
  const existingShipments = options?.existingShipments || o?.shipments || []

  const activeTabInfo = useMemo(() => tabs.find((t: any) => t.key === activeTab), [tabs, activeTab])

  const firstParcel = parcels[0] || {
    weightKg: '',
    lengthCm: '',
    widthCm: '',
    heightCm: '',
    template: '',
  }
  const volumetricWeight = calculateVolumetricWeight(firstParcel)

  function setF(key: string, value: any) {
    setForm((prev: any) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => ({ ...prev, [key]: '' }))
  }

  function updateParcel(index: number, key: keyof ParcelRow, value: string) {
    setParcels((prev) => {
      const next = [...prev]
      const current = next[index] || {
        weightKg: '',
        lengthCm: '',
        widthCm: '',
        heightCm: '',
        template: '',
      }
      next[index] = { ...current, [key]: value }
      return next
    })

    setFieldErrors((prev) => ({ ...prev, [key]: '' }))
  }

  function applyTemplate(index: number, templateKey: string) {
    const template = PACKAGE_TEMPLATES.find((t) => t.key === templateKey)

    setParcels((prev) => {
      const next = [...prev]
      const current = next[index] || {
        weightKg: '',
        lengthCm: '',
        widthCm: '',
        heightCm: '',
        template: '',
      }

      if (!template?.values) {
        next[index] = { ...current, template: templateKey }
        return next
      }

      next[index] = { ...current, template: templateKey, ...template.values }
      return next
    })
  }

  function addParcel() {
    setParcels((prev) => [...prev, { weightKg: '', lengthCm: '', widthCm: '', heightCm: '', template: '' }])
  }

  function removeParcel(index: number) {
    setParcels((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  function getEffectiveParcel() {
    if (activeTab === 'INPOST_LOCKER') {
      const size = LOCKER_SIZE_DIMENSIONS[form.parcelSize || 'B'] || LOCKER_SIZE_DIMENSIONS.B
      return {
        weightKg: size.weightKg,
        lengthCm: size.lengthCm,
        widthCm: size.widthCm,
        heightCm: size.heightCm,
      }
    }

    return parcels[0]
  }

  function validate() {
    const errs: Record<string, string> = {}
    const p = getEffectiveParcel()

    if (activeTab === 'ALLEGRO' && !form.deliveryMethodId) {
      errs.deliveryMethodId = 'Wybierz kuriera / metodę dostawy.'
    }

    if ((activeTab === 'INPOST_LOCKER' || activeTab === 'INPOST_COURIER') && !form.shippingAccountId) {
      errs.shippingAccountId = 'Wybierz konto ShipX.'
    }

    if (activeTab === 'INPOST_LOCKER' && !form.parcelSize) {
      errs.parcelSize = 'Wybierz gabaryt paczki.'
    }

    if (activeTab !== 'INPOST_LOCKER') {
      if (!p?.weightKg || Number(p.weightKg) <= 0) errs.weightKg = 'Podaj wagę większą niż 0.'
      if (!p?.lengthCm || Number(p.lengthCm) <= 0) errs.lengthCm = 'Podaj długość większą niż 0.'
      if (!p?.widthCm || Number(p.widthCm) <= 0) errs.widthCm = 'Podaj szerokość większą niż 0.'
      if (!p?.heightCm || Number(p.heightCm) <= 0) errs.heightCm = 'Podaj wysokość większą niż 0.'
    }

    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function submitShipment() {
    setResult(null)
    setPrintMsg('')

    if (!validate()) return

    setSending(true)

    try {
      const p = getEffectiveParcel()
      const payload = {
        mode: activeTab,
        shippingAccountId: form.shippingAccountId ? Number(form.shippingAccountId) : undefined,
        parcelSize: form.parcelSize,
        weightKg: Number(p.weightKg),
        lengthCm: Number(p.lengthCm),
        widthCm: Number(p.widthCm),
        heightCm: Number(p.heightCm),
        labelFormat: form.labelFormat || 'PDF',
        deliveryMethodId: form.deliveryMethodId || undefined,
        credentialsId: form.credentialsId || undefined,
        description: form.description,
        reference: form.reference,
        insuranceAmount: form.insuranceAmount ? Number(form.insuranceAmount) : 0,
        codAmount: form.codAmount ? Number(form.codAmount) : undefined,
        returnLabel: Boolean(form.returnLabel),
      }

      const response = await api(`/shipments/orders/${id}/create`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      setResult(response)
    } catch (e: any) {
      if (e?.fieldErrors) setFieldErrors(e.fieldErrors)
      setResult({ ok: false, message: e?.message || 'Nie udało się nadać przesyłki.', details: e })
    } finally {
      setSending(false)
    }
  }

  function labelUrl(shipmentId: number, format: 'pdf-a6' | 'pdf-a4' | 'zpl' = 'pdf-a6') {
    return `${API_BASE}/shipments/${shipmentId}/label?format=${format}`
  }

  async function printShipmentLabel(shipmentId: number) {
    setPrintMsg('')
    setPrintingShipmentId(shipmentId)

    try {
      const printerData = await api('/users/me/printer')
      const printer = printerData?.printer

      if (!printer?.labelPrinterName) {
        throw new Error('Brak zapisanej drukarki etykiet w profilu użytkownika.')
      }

      const zpl = await fetchTextFile(`/shipments/${shipmentId}/label?format=zpl`)
      await printZplWithQz(zpl, printer)

      setPrintMsg(`✓ Etykieta wysłana do drukarki: ${printer.labelPrinterName}`)
    } catch (e: any) {
      setPrintMsg(e?.message || 'Nie udało się wydrukować etykiety.')
    } finally {
      setPrintingShipmentId(null)
    }
  }

  function renderInpostLabelButtons(shipmentId: number, size: 'normal' | 'small' = 'normal') {
    const base =
      size === 'small'
        ? 'rounded px-2 py-1 text-[11px] text-white'
        : 'rounded px-2 py-1 text-xs text-white'

    return (
      <>
        <a
          href={labelUrl(shipmentId, 'pdf-a6')}
          target="_blank"
          rel="noopener noreferrer"
          className={`${base} bg-green-600 hover:bg-green-700`}
        >
          {size === 'small' ? 'PDF A6' : 'Pobierz PDF A6'}
        </a>

        <a
          href={labelUrl(shipmentId, 'zpl')}
          target="_blank"
          rel="noopener noreferrer"
          className={`${base} bg-gray-800 hover:bg-gray-900`}
        >
          {size === 'small' ? 'ZPL' : 'Pobierz ZPL'}
        </a>

        <button
          type="button"
          onClick={() => printShipmentLabel(shipmentId)}
          disabled={printingShipmentId === shipmentId}
          className={`${base} bg-blue-600 hover:bg-blue-700 disabled:opacity-50`}
        >
          {printingShipmentId === shipmentId ? 'Drukuję...' : size === 'small' ? 'Drukuj' : 'Drukuj etykietę'}
        </button>
      </>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (error || !o) {
    return (
      <div className="p-6">
        <button onClick={() => router.back()} className="mb-4 text-sm text-gray-500 hover:text-gray-800">
          ← Wróć
        </button>
        <Card className="p-6 text-sm text-red-600">{error || 'Nie znaleziono zamówienia.'}</Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-5">
      <div className="mx-auto max-w-[1660px]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <button onClick={() => router.back()} className="mb-2 text-sm text-gray-500 hover:text-gray-800">
              ← Wróć
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">Zamówienie #{compactId(o.externalOrderId)}</h1>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                {o.externalFulfillmentStatus || o.status || '—'}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {o.deliveryMethodName || 'Brak metody dostawy'} · {datePL(o.orderCreatedAt)}
            </p>
          </div>

          <button
            onClick={() => router.push('/dashboard')}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Powrót do listy
          </button>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 space-y-4 xl:col-span-9">
            <Card>
              <div className="border-b border-gray-100 px-4 py-3">
                <SectionTitle>Produkty</SectionTitle>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="w-14 px-4 py-3 text-left">Foto</th>
                      <th className="px-4 py-3 text-left">Nazwa produktu</th>
                      <th className="px-4 py-3 text-right">Ilość</th>
                      <th className="px-4 py-3 text-right">Cena</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                          Brak produktów
                        </td>
                      </tr>
                    ) : (
                      items.map((item: any) => (
                        <tr key={item.id || item.externalOfferId || item.productName} className="border-t border-gray-100">
                          <td className="px-4 py-3">
                            <div className="h-12 w-12 overflow-hidden rounded-md border border-gray-200 bg-gray-100">
                              {item.productImageUrl ? (
                                <img src={item.productImageUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-gray-300">📦</div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{item.productName || 'Produkt bez nazwy'}</p>
                            {item.externalOfferId && (
                              <a
                                href={`https://allegro.pl/oferta/${item.externalOfferId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Oferta #{item.externalOfferId}
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">x{item.quantity || 1}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            {money(item.price, item.currency || o.currency)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end border-t border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
                Razem: {money(o.totalAmount || o.totalToPay || o.paymentAmount, o.currency || o.paymentCurrency)}
              </div>
            </Card>

            <Card>
              <div className="border-b border-gray-100 px-4 py-3">
                <SectionTitle>Przesyłki</SectionTitle>
                <p className="mt-1 text-xs text-gray-500">
                  Metoda jest dobrana automatycznie z zamówienia. Możesz ręcznie zmienić operatora albo parametry paczki.
                </p>
              </div>

              {options?.warnings?.length > 0 && (
                <div className="mx-4 mt-4 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                  {options.warnings.map((w: string, i: number) => (
                    <div key={i}>⚠ {w}</div>
                  ))}
                </div>
              )}

              <div className="border-b border-gray-200 px-4 pt-4">
                <div className="flex flex-wrap gap-2">
                  {TAB_ORDER.map((key) => {
                    const tab = tabs.find((t: any) => t.key === key)
                    const disabled = tab ? !tab.enabled : key === 'TEMU_SHIPPING'
                    const isActive = activeTab === key
                    const isRecommended = tab?.recommended

                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={disabled}
                        onClick={() => setActiveTab(key)}
                        title={tab?.reason || ''}
                        className={`rounded-t-md border px-4 py-2 text-sm font-medium transition ${
                          isActive
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : disabled
                              ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {TAB_LABELS[key]}
                        {isRecommended && !disabled && (
                          <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${isActive ? 'bg-white/20 text-white' : 'bg-green-50 text-green-700'}`}>
                            auto
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-12 gap-4 p-4">
                <div className="col-span-12 space-y-4 lg:col-span-7">
                  {activeTab === 'ALLEGRO' && (
                    <>
                      <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                        Wysyłam z Allegro. Jeśli lista usług nie zawiera metody z zamówienia, trzeba sprawdzić ustawienia usług w panelu Allegro.
                      </div>

                      <div className="grid grid-cols-[160px_1fr] items-center gap-3">
                        <label className="text-right text-sm text-gray-600">Nazwa konta</label>
                        <select className={selectClass()} value={form.marketplaceAccountId || ''} onChange={(e) => setF('marketplaceAccountId', e.target.value)}>
                          <option value={options?.order?.marketplaceAccountId || ''}>{options?.order?.marketplaceAccountName || 'Konto Allegro'}</option>
                        </select>

                        <label className="text-right text-sm text-gray-600">Kurier</label>
                        <div>
                          <select
                            className={selectClass()}
                            value={form.deliveryMethodId || ''}
                            onChange={(e) => {
                              const service = allegroServices.find((s: any) => s.deliveryMethodId === e.target.value)
                              setF('deliveryMethodId', e.target.value)
                              setF('credentialsId', service?.credentialsId || '')
                            }}
                          >
                            <option value="">— wybierz usługę Allegro —</option>
                            {allegroServices.map((service: any, index: number) => (
                              <option key={`${service.deliveryMethodId}-${service.credentialsId}-${index}`} value={service.deliveryMethodId || ''}>
                                {service.name || service.deliveryMethodId || `Usługa ${index + 1}`}
                              </option>
                            ))}
                          </select>
                          {fieldErrors.deliveryMethodId && <p className="mt-1 text-xs text-red-600">{fieldErrors.deliveryMethodId}</p>}
                        </div>

                        <label className="text-right text-sm text-gray-600">Sposób nadania</label>
                        <select className={selectClass()} value="pickup_by_courier" disabled>
                          <option value="pickup_by_courier">Zamówię podjazd kuriera (domyślnie)</option>
                        </select>

                        <label className="text-right text-sm text-gray-600">Rodzaj</label>
                        <select className={selectClass('max-w-xs')} value={form.packageType || 'Paczka'} onChange={(e) => setF('packageType', e.target.value)}>
                          <option>Paczka</option>
                        </select>

                        <label className="text-right text-sm text-gray-600">Pobranie</label>
                        <MoneyInput value={form.codAmount || ''} onChange={(value) => setF('codAmount', value)} />

                        <label className="text-right text-sm text-gray-600">Ubezpieczenie</label>
                        <MoneyInput value={form.insuranceAmount || '0.00'} onChange={(value) => setF('insuranceAmount', value)} />

                        <label className="text-right text-sm text-gray-600">Etykieta zwrotna</label>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={Boolean(form.returnLabel)} onChange={(e) => setF('returnLabel', e.target.checked)} />
                          Zamiana danych odbiorcy z nadawcą
                        </label>
                      </div>
                    </>
                  )}

                  {activeTab === 'INPOST_LOCKER' && (
                    <div className="grid grid-cols-[160px_1fr] items-start gap-3">
                      <label className="pt-2 text-right text-sm text-gray-600">Konto ShipX</label>
                      <div>
                        <select className={selectClass()} value={form.shippingAccountId || ''} onChange={(e) => setF('shippingAccountId', e.target.value)}>
                          <option value="">— wybierz konto ShipX —</option>
                          {inpostAccounts.map((acc: any) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.accountName || acc.organizationName || `ShipX #${acc.id}`}
                            </option>
                          ))}
                        </select>
                        {fieldErrors.shippingAccountId && <p className="mt-1 text-xs text-red-600">{fieldErrors.shippingAccountId}</p>}
                      </div>

                      <label className="pt-2 text-right text-sm text-gray-600">Usługa</label>
                      <select className={selectClass('max-w-xl')} value="inpost_locker_standard" disabled>
                        <option value="inpost_locker_standard">Allegro Paczkomaty 24/7 InPost</option>
                      </select>

                      <div />
                      <div className="space-y-2">
                        {INPOST_LOCKER_SIZES.map((size) => (
                          <label key={size.key} className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="radio"
                              name="parcelSize"
                              checked={form.parcelSize === size.key}
                              onChange={() => setF('parcelSize', size.key)}
                              className="h-4 w-4"
                            />
                            <span>
                              {size.label} <span className="text-gray-500">({size.hint})</span>
                            </span>
                          </label>
                        ))}
                        {fieldErrors.parcelSize && <p className="text-xs text-red-600">{fieldErrors.parcelSize}</p>}
                      </div>

                      <label className="pt-2 text-right text-sm text-gray-600">Pobranie</label>
                      <MoneyInput value={form.codAmount || ''} onChange={(value) => setF('codAmount', value)} />

                      <label className="pt-2 text-right text-sm text-gray-600">Ubezpieczenie</label>
                      <MoneyInput value={form.insuranceAmount || '0.00'} onChange={(value) => setF('insuranceAmount', value)} />

                      <label className="pt-1 text-right text-sm text-gray-600">Usługi dodatkowe</label>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={Boolean(form.weekendDelivery)} onChange={(e) => setF('weekendDelivery', e.target.checked)} />
                          Paczka w Weekend
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={Boolean(form.returnLabel)} onChange={(e) => setF('returnLabel', e.target.checked)} />
                          Etykieta zwrotna
                        </label>
                      </div>
                    </div>
                  )}

                  {activeTab === 'INPOST_COURIER' && (
                    <div className="grid grid-cols-[160px_1fr] items-start gap-3">
                      <label className="pt-2 text-right text-sm text-gray-600">Konto ShipX</label>
                      <div>
                        <select className={selectClass()} value={form.shippingAccountId || ''} onChange={(e) => setF('shippingAccountId', e.target.value)}>
                          <option value="">— wybierz konto ShipX —</option>
                          {inpostAccounts.map((acc: any) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.accountName || acc.organizationName || `ShipX #${acc.id}`}
                            </option>
                          ))}
                        </select>
                        {fieldErrors.shippingAccountId && <p className="mt-1 text-xs text-red-600">{fieldErrors.shippingAccountId}</p>}
                      </div>

                      <label className="pt-2 text-right text-sm text-gray-600">Usługa</label>
                      <select className={selectClass()} value="inpost_courier_standard" disabled>
                        <option>Przesyłka kurierska standardowa</option>
                      </select>

                      <label className="pt-2 text-right text-sm text-gray-600">Pobranie</label>
                      <MoneyInput value={form.codAmount || ''} onChange={(value) => setF('codAmount', value)} />

                      <label className="pt-2 text-right text-sm text-gray-600">Ubezpieczenie</label>
                      <MoneyInput value={form.insuranceAmount || '0.00'} onChange={(value) => setF('insuranceAmount', value)} />

                      <label className="pt-1 text-right text-sm text-gray-600">Usługi dodatkowe</label>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={Boolean(form.smsNotification)} onChange={(e) => setF('smsNotification', e.target.checked)} />
                          Powiadomienie SMS
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={Boolean(form.emailNotification)} onChange={(e) => setF('emailNotification', e.target.checked)} />
                          Powiadomienie E-mail
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={Boolean(form.saturdayDelivery)} onChange={(e) => setF('saturdayDelivery', e.target.checked)} />
                          Doręczenie w sobotę
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={Boolean(form.documentReturn)} onChange={(e) => setF('documentReturn', e.target.checked)} />
                          Zwrot dokumentów
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={Boolean(form.returnLabel)} onChange={(e) => setF('returnLabel', e.target.checked)} />
                          Etykieta zwrotna
                        </label>
                      </div>
                    </div>
                  )}

                  {(activeTab === 'TEMU_SHIPPING' || activeTab === 'OTHER') && (
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                      Ta sekcja jest przygotowana wizualnie, ale nadawanie nie jest jeszcze obsługiwane w backendzie.
                    </div>
                  )}

                  <div className="border-t border-gray-100 pt-3">
                    <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs font-medium text-blue-600 hover:underline">
                      {showAdvanced ? 'Ukryj pola techniczne' : 'Pokaż pola techniczne'}
                    </button>
                    {showAdvanced && (
                      <div className="mt-3 grid grid-cols-[160px_1fr] items-center gap-3 rounded-md bg-gray-50 p-3">
                        <label className="text-right text-sm text-gray-600">Opis zawartości</label>
                        <input className={inputClass()} value={form.description || ''} onChange={(e) => setF('description', e.target.value)} />
                        <label className="text-right text-sm text-gray-600">Nr referencyjny</label>
                        <input className={inputClass()} value={form.reference || ''} onChange={(e) => setF('reference', e.target.value)} />
                      </div>
                    )}
                  </div>
                </div>

                <div className="col-span-12 lg:col-span-5">
                  {activeTab === 'INPOST_LOCKER' ? (
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                      <h3 className="mb-2 text-sm font-semibold text-gray-900">Parametry paczki</h3>
                      Dla Paczkomatów InPost nie wpisujesz ręcznie wymiarów. Backend dostanie automatyczne wymiary wynikające z wybranego gabarytu.
                      <div className="mt-3 rounded-md bg-white p-3 text-xs text-gray-600">
                        Wybrany gabaryt: <b>{form.parcelSize || 'B'}</b>
                        {LOCKER_SIZE_DIMENSIONS[form.parcelSize] && (
                          <span>
                            {' '}
                            · {LOCKER_SIZE_DIMENSIONS[form.parcelSize].lengthCm} × {LOCKER_SIZE_DIMENSIONS[form.parcelSize].widthCm} ×{' '}
                            {LOCKER_SIZE_DIMENSIONS[form.parcelSize].heightCm} cm
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900">Parametry paczki</h3>
                        {volumetricWeight !== null && <span className="text-xs text-gray-500">Waga gabarytowa: {volumetricWeight.toFixed(2)} kg</span>}
                      </div>

                      <div className="space-y-3">
                        {parcels.map((parcel, index) => (
                          <div key={index} className="rounded-md border border-gray-200 bg-white p-3">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-500">Podpaczka {index + 1}</span>
                              {parcels.length > 1 && (
                                <button onClick={() => removeParcel(index)} className="text-xs text-red-500 hover:text-red-700">
                                  usuń
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-5 gap-2">
                              <Field label="Waga" error={index === 0 ? fieldErrors.weightKg : undefined}>
                                <input className={inputClass()} value={parcel.weightKg} onChange={(e) => updateParcel(index, 'weightKg', e.target.value)} placeholder="kg" />
                              </Field>
                              <Field label="Długość" error={index === 0 ? fieldErrors.lengthCm : undefined}>
                                <input className={inputClass()} value={parcel.lengthCm} onChange={(e) => updateParcel(index, 'lengthCm', e.target.value)} placeholder="cm" />
                              </Field>
                              <Field label="Szerokość" error={index === 0 ? fieldErrors.widthCm : undefined}>
                                <input className={inputClass()} value={parcel.widthCm} onChange={(e) => updateParcel(index, 'widthCm', e.target.value)} placeholder="cm" />
                              </Field>
                              <Field label="Wysokość" error={index === 0 ? fieldErrors.heightCm : undefined}>
                                <input className={inputClass()} value={parcel.heightCm} onChange={(e) => updateParcel(index, 'heightCm', e.target.value)} placeholder="cm" />
                              </Field>
                              <Field label="Szablon">
                                <select className={selectClass('px-1')} value={parcel.template} onChange={(e) => applyTemplate(index, e.target.value)}>
                                  {PACKAGE_TEMPLATES.map((t) => (
                                    <option key={t.key} value={t.key}>
                                      {t.label}
                                    </option>
                                  ))}
                                </select>
                              </Field>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button onClick={addParcel} className="mt-3 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
                        + Kolejna podpaczka
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 px-4 py-4">
                <div className="text-xs text-gray-500">
                  Aktywna metoda: <span className="font-semibold text-gray-800">{TAB_LABELS[activeTab]}</span>
                  {activeTabInfo?.reason && <span className="ml-2 text-red-500">{activeTabInfo.reason}</span>}
                </div>

                <button
                  onClick={submitShipment}
                  disabled={sending || activeTab === 'TEMU_SHIPPING' || activeTab === 'OTHER'}
                  className="rounded-full border border-blue-600 bg-white px-5 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending
                    ? 'Nadaję przesyłkę...'
                    : activeTab === 'ALLEGRO'
                      ? 'Nadaj paczkę Allegro'
                      : activeTab === 'INPOST_LOCKER'
                        ? 'Nadaj paczkę InPost Paczkomaty'
                        : activeTab === 'INPOST_COURIER'
                          ? 'Nadaj paczkę InPost Kurier'
                          : 'Nadaj przesyłkę'}
                </button>
              </div>

              {result && (
                <div className={`mx-4 mb-4 rounded-md border px-3 py-3 text-sm ${result.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                  <p className="font-medium">{result.ok ? '✓ Operacja wykonana' : '✗ Błąd nadania'}</p>
                  <p className="mt-1 text-xs">{result.message || result.error || result.nextStep || 'Brak dodatkowej wiadomości.'}</p>
                  {result.shipment?.id && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="rounded bg-white px-2 py-1 text-xs">ID przesyłki: {result.shipment.id}</span>
                      {result.shipment.trackingNumber && <span className="rounded bg-white px-2 py-1 text-xs">Tracking: {result.shipment.trackingNumber}</span>}
                      {result.provider === 'INPOST_SHIPX' && renderInpostLabelButtons(result.shipment.id, 'normal')}
                    </div>
                  )}
                </div>
              )}

              {printMsg && (
                <div className={`mx-4 mb-4 rounded-md border px-3 py-2 text-xs ${printMsg.startsWith('✓') ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                  {printMsg}
                </div>
              )}
            </Card>
          </div>

          <div className="col-span-12 space-y-4 xl:col-span-3">
            <Card className="p-4">
              <SectionTitle>Kupujący</SectionTitle>
              <div className="mt-3 space-y-1 text-sm text-gray-700">
                <p className="font-medium text-gray-900">
                  {o.buyerFirstName || ''} {o.buyerLastName || ''}
                </p>
                {o.buyerLogin && <p>Login: {o.buyerLogin}</p>}
                {o.buyerEmail && <p>Email: {o.buyerEmail}</p>}
                {o.buyerPhone && <p>Telefon: {o.buyerPhone}</p>}
              </div>
            </Card>

            <Card className="p-4">
              <SectionTitle>Dostawa</SectionTitle>
              <div className="mt-3 space-y-1 text-sm text-gray-700">
                <p className="font-medium text-gray-900">{receiver.name || `${o.deliveryFirstName || ''} ${o.deliveryLastName || ''}`}</p>
                {receiver.street && <p>{receiver.street}</p>}
                {(receiver.zipCode || receiver.city) && (
                  <p>
                    {receiver.zipCode} {receiver.city}
                  </p>
                )}
                {receiver.countryCode && <p>{receiver.countryCode}</p>}
                {receiver.phone && <p>Tel: {receiver.phone}</p>}
                {receiver.pickupPointId && (
                  <div className="mt-2 rounded-md bg-gray-50 p-2 text-xs text-gray-600">
                    <p className="font-medium text-gray-800">Odbiór w punkcie</p>
                    <p>{receiver.pickupPointName || 'Punkt odbioru'}</p>
                    <p>ID: {receiver.pickupPointId}</p>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-4">
              <SectionTitle>Informacje</SectionTitle>
              <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-gray-500">Platforma</span>
                <span className="text-right text-gray-800">{o.marketplace || '—'}</span>
                <span className="text-gray-500">Konto</span>
                <span className="text-right text-gray-800">{options?.order?.marketplaceAccountName || o.marketplaceAccount?.accountName || '—'}</span>
                <span className="text-gray-500">Status</span>
                <span className="text-right text-gray-800">{o.externalOrderStatus || '—'}</span>
                <span className="text-gray-500">Fulfillment</span>
                <span className="text-right text-gray-800">{o.externalFulfillmentStatus || '—'}</span>
                <span className="text-gray-500">Faktura</span>
                <span className="text-right text-gray-800">{o.invoiceRequired ? 'Wymagana' : 'Nie'}</span>
              </div>
            </Card>

            {existingShipments.length > 0 && (
              <Card className="p-4">
                <SectionTitle>Utworzone przesyłki</SectionTitle>
                <div className="mt-3 space-y-2">
                  {existingShipments.map((shipment: any) => (
                    <div key={shipment.id} className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">
                          #{shipment.id} · {shipment.provider}
                        </span>
                        <span>{shipment.status}</span>
                      </div>
                      {shipment.trackingNumber && <p className="mt-1">Tracking: {shipment.trackingNumber}</p>}
                      {shipment.errorMessage && <p className="mt-1 text-red-600">{shipment.errorMessage}</p>}
                      {shipment.provider === 'INPOST_SHIPX' && shipment.status !== 'ERROR' && (
                        <div className="mt-2 flex flex-wrap gap-1">{renderInpostLabelButtons(shipment.id, 'small')}</div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
