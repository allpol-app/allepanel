'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { api, ALLEGRO_START } from '@/lib/api'
import { useUser } from '@/lib/context'

type PrinterSettings = {
  labelPrinterName: string
  labelPrinterFormat: 'zpl' | 'pdf-a6' | 'pdf-a4' | 'epl'
  labelPrinterDpi: string
  labelPrinterWidthMm: string
  labelPrinterHeightMm: string
}

function inp(extra = '') {
  return `border border-gray-200 rounded-lg px-3 py-2 text-sm w-full outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400 ${extra}`
}

function btn(extra = '') {
  return `text-sm px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${extra}`
}

function normalizePrinter(data: any): PrinterSettings {
  const printer = data?.printer || data || {}

  return {
    labelPrinterName: printer.labelPrinterName || '',
    labelPrinterFormat: printer.labelPrinterFormat || 'zpl',
    labelPrinterDpi: String(printer.labelPrinterDpi || 203),
    labelPrinterWidthMm: String(printer.labelPrinterWidthMm || 100),
    labelPrinterHeightMm: String(printer.labelPrinterHeightMm || 150),
  }
}

export default function AccountPage() {
  const user = useUser()
  const params = useSearchParams()

  const [allegroAccounts, setAllegroAccounts] = useState<any[]>([])
  const [inpostAccounts, setInpostAccounts] = useState<any[]>([])

  const [showAddPanel, setShowAddPanel] = useState(false)
  const [showInpostForm, setShowInpostForm] = useState(false)
  const [inpostForm, setInpostForm] = useState({ accountName: '', organizationId: '', apiToken: '' })
  const [inpostMsg, setInpostMsg] = useState('')
  const [inpostTesting, setInpostTesting] = useState(false)
  const [inpostConnecting, setInpostConnecting] = useState(false)

  const [printer, setPrinter] = useState<PrinterSettings>({
    labelPrinterName: '',
    labelPrinterFormat: 'zpl',
    labelPrinterDpi: '203',
    labelPrinterWidthMm: '100',
    labelPrinterHeightMm: '150',
  })
  const [printerLoading, setPrinterLoading] = useState(true)
  const [printerSaving, setPrinterSaving] = useState(false)
  const [printerMsg, setPrinterMsg] = useState('')

  const [profileMsg] = useState('')

  const connectedOk = params.get('connected')
  const connectedError = params.get('error')

  useEffect(() => {
    api('/integrations/allegro/accounts')
      .then((d) => setAllegroAccounts(d.accounts || []))
      .catch(() => {})

    api('/integrations/inpost/shipx/accounts')
      .then((d) => setInpostAccounts(d.accounts || []))
      .catch(() => {})

    loadPrinter()
  }, [])

  async function loadPrinter() {
    setPrinterLoading(true)
    setPrinterMsg('')

    try {
      const data = await api('/users/me/printer')
      setPrinter(normalizePrinter(data))
    } catch (e: any) {
      setPrinterMsg(e?.message || 'Nie udało się pobrać ustawień drukarki.')
    } finally {
      setPrinterLoading(false)
    }
  }

  async function savePrinter() {
    setPrinterSaving(true)
    setPrinterMsg('')

    try {
      const data = await api('/users/me/printer', {
        method: 'PATCH',
        body: JSON.stringify({
          labelPrinterName: printer.labelPrinterName.trim() || null,
          labelPrinterFormat: printer.labelPrinterFormat,
          labelPrinterDpi: Number(printer.labelPrinterDpi || 203),
          labelPrinterWidthMm: Number(printer.labelPrinterWidthMm || 100),
          labelPrinterHeightMm: Number(printer.labelPrinterHeightMm || 150),
        }),
      })

      setPrinter(normalizePrinter(data))
      setPrinterMsg(data.message || 'Ustawienia drukarki zostały zapisane.')
    } catch (e: any) {
      setPrinterMsg(e?.message || 'Nie udało się zapisać drukarki.')
    } finally {
      setPrinterSaving(false)
    }
  }

  async function removePrinter() {
    setPrinterSaving(true)
    setPrinterMsg('')

    try {
      const data = await api('/users/me/printer', {
        method: 'PATCH',
        body: JSON.stringify({
          labelPrinterName: null,
          labelPrinterFormat: 'zpl',
          labelPrinterDpi: 203,
          labelPrinterWidthMm: 100,
          labelPrinterHeightMm: 150,
        }),
      })

      setPrinter(normalizePrinter(data))
      setPrinterMsg('Drukarka została usunięta z profilu.')
    } catch (e: any) {
      setPrinterMsg(e?.message || 'Nie udało się usunąć drukarki.')
    } finally {
      setPrinterSaving(false)
    }
  }

  async function testInpost() {
    setInpostTesting(true)
    setInpostMsg('')

    try {
      const r = await api('/integrations/inpost/shipx/test-credentials', {
        method: 'POST',
        body: JSON.stringify({
          organizationId: inpostForm.organizationId,
          apiToken: inpostForm.apiToken,
        }),
      })

      setInpostMsg(`✓ OK — ${r.organization?.name || 'Organizacja zweryfikowana'}`)
    } catch {
      setInpostMsg('✗ Nieprawidłowe dane')
    } finally {
      setInpostTesting(false)
    }
  }

  async function connectInpost() {
    setInpostConnecting(true)
    setInpostMsg('')

    try {
      await api('/integrations/inpost/shipx/connect', {
        method: 'POST',
        body: JSON.stringify(inpostForm),
      })

      setInpostMsg('✓ Konto InPost połączone')
      setInpostForm({ accountName: '', organizationId: '', apiToken: '' })
      setShowInpostForm(false)

      api('/integrations/inpost/shipx/accounts')
        .then((d) => setInpostAccounts(d.accounts || []))
        .catch(() => {})
    } catch (e: any) {
      setInpostMsg(e?.message || '✗ Błąd połączenia')
    } finally {
      setInpostConnecting(false)
    }
  }

  const setIP = (k: string, v: string) => setInpostForm((f) => ({ ...f, [k]: v }))
  const setPrinterField = (k: keyof PrinterSettings, v: string) => {
    setPrinter((p) => ({ ...p, [k]: v }))
    setPrinterMsg('')
  }

  const printerConfigured = Boolean(printer.labelPrinterName.trim())

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-lg font-semibold mb-6">Konto</h1>

      {connectedOk && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          ✓ Konto Allegro połączone pomyślnie
        </div>
      )}

      {connectedError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          ✗ Błąd połączenia: {decodeURIComponent(connectedError)}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h2 className="text-sm font-medium mb-4">Dane konta</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Email</label>
              <input className={inp('bg-gray-50')} value={user?.email || ''} readOnly />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Imię</label>
              <input className={inp()} placeholder="Imię" defaultValue={user?.firstName || ''} />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nazwisko</label>
              <input className={inp()} placeholder="Nazwisko" />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Firma</label>
              <input className={inp()} placeholder="Nazwa firmy" />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">NIP</label>
              <input className={inp()} placeholder="NIP" />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Telefon</label>
              <input className={inp()} placeholder="Telefon" />
            </div>
          </div>

          <div className="mt-4 border-t border-gray-50 pt-4">
            <h3 className="text-xs text-gray-500 mb-2">Zmień hasło</h3>
            <div className="grid grid-cols-2 gap-3">
              <input className={inp()} type="password" placeholder="Nowe hasło" />
              <input className={inp()} type="password" placeholder="Potwierdź hasło" />
            </div>
          </div>

          {profileMsg && <p className="text-sm text-green-600 mt-2">{profileMsg}</p>}

          <button className="mt-4 bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            Zapisz zmiany
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-medium">Drukarka etykiet</h2>
              <p className="text-xs text-gray-500 mt-1">
                Ta drukarka będzie używana później przez przycisk „Drukuj etykietę”.
              </p>
            </div>

            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                printerConfigured
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {printerConfigured ? 'Skonfigurowana' : 'Brak drukarki'}
            </span>
          </div>

          {printerLoading ? (
            <div className="flex items-center justify-center h-28">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Nazwa drukarki w systemie / QZ Tray</label>
                <input
                  className={inp()}
                  placeholder="np. ZDesigner GC420d"
                  value={printer.labelPrinterName}
                  onChange={(e) => setPrinterField('labelPrinterName', e.target.value)}
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Nazwa musi być taka sama jak nazwa drukarki widoczna w Windows albo QZ Tray.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Format etykiety</label>
                  <select
                    className={inp()}
                    value={printer.labelPrinterFormat}
                    onChange={(e) => setPrinterField('labelPrinterFormat', e.target.value as PrinterSettings['labelPrinterFormat'])}
                  >
                    <option value="zpl">ZPL — Zebra 203 dpi</option>
                    <option value="pdf-a6">PDF A6</option>
                    <option value="pdf-a4">PDF A4</option>
                    <option value="epl">EPL</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">DPI</label>
                  <input
                    className={inp()}
                    type="number"
                    value={printer.labelPrinterDpi}
                    onChange={(e) => setPrinterField('labelPrinterDpi', e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Szerokość etykiety mm</label>
                  <input
                    className={inp()}
                    type="number"
                    value={printer.labelPrinterWidthMm}
                    onChange={(e) => setPrinterField('labelPrinterWidthMm', e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Wysokość etykiety mm</label>
                  <input
                    className={inp()}
                    type="number"
                    value={printer.labelPrinterHeightMm}
                    onChange={(e) => setPrinterField('labelPrinterHeightMm', e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 text-xs text-gray-600">
                <p className="font-medium text-gray-700 mb-1">Rekomendacja dla Zebra GC420d</p>
                <p>Nazwa: dokładna nazwa z Windows/QZ Tray, format: ZPL, DPI: 203, rozmiar: 100 × 150 mm.</p>
              </div>

              {printerMsg && (
                <p className={`text-xs ${printerMsg.startsWith('Nie') || printerMsg.startsWith('Błąd') ? 'text-red-500' : 'text-green-600'}`}>
                  {printerMsg}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={savePrinter}
                  disabled={printerSaving}
                  className={btn('bg-blue-600 text-white hover:bg-blue-700')}
                >
                  {printerSaving ? 'Zapisuję...' : 'Zapisz drukarkę'}
                </button>

                <button
                  onClick={loadPrinter}
                  disabled={printerSaving}
                  className={btn('border border-gray-200 text-gray-700 hover:bg-gray-50')}
                >
                  Odśwież
                </button>

                <button
                  onClick={removePrinter}
                  disabled={printerSaving || !printerConfigured}
                  className={btn('border border-red-200 text-red-600 hover:bg-red-50')}
                >
                  Usuń drukarkę
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 mt-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium">Integracje</h2>

          <button
            onClick={() => {
              setShowAddPanel(!showAddPanel)
              setShowInpostForm(false)
            }}
            className="w-7 h-7 rounded-lg bg-blue-600 text-white text-lg flex items-center justify-center hover:bg-blue-700 transition-colors leading-none"
          >
            {showAddPanel ? '×' : '+'}
          </button>
        </div>

        {showAddPanel && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <p className="text-xs text-gray-500 mb-2">Wybierz platformę:</p>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  window.location.href = ALLEGRO_START
                }}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors"
              >
                🛒 Allegro
              </button>

              <button
                disabled
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-400 text-sm rounded-lg cursor-not-allowed"
                title="Wkrótce"
              >
                Erli (wkrótce)
              </button>

              <button
                onClick={() => setShowInpostForm(!showInpostForm)}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors"
              >
                📦 InPost ShipX
              </button>
            </div>

            {showInpostForm && (
              <div className="mt-3 border-t border-gray-200 pt-3 grid grid-cols-1 gap-2">
                <input
                  className={inp()}
                  placeholder="Nazwa konta (np. Mój InPost)"
                  value={inpostForm.accountName}
                  onChange={(e) => setIP('accountName', e.target.value)}
                />

                <input
                  className={inp()}
                  placeholder="Organization ID"
                  value={inpostForm.organizationId}
                  onChange={(e) => setIP('organizationId', e.target.value)}
                />

                <input
                  className={inp()}
                  type="password"
                  placeholder="API Token ShipX"
                  value={inpostForm.apiToken}
                  onChange={(e) => setIP('apiToken', e.target.value)}
                />

                {inpostMsg && (
                  <p className={`text-xs ${inpostMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>
                    {inpostMsg}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={testInpost}
                    disabled={inpostTesting}
                    className={btn('border border-gray-200 text-gray-700 hover:bg-gray-50')}
                  >
                    {inpostTesting ? 'Sprawdzam...' : 'Testuj'}
                  </button>

                  <button
                    onClick={connectInpost}
                    disabled={inpostConnecting}
                    className={btn('bg-orange-600 text-white hover:bg-orange-700')}
                  >
                    {inpostConnecting ? 'Łączę...' : 'Połącz'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-400 border-b border-gray-50">
              <th className="text-left pb-2">Platforma</th>
              <th className="text-left pb-2">Połączone konta</th>
              <th className="text-left pb-2">Status</th>
            </tr>
          </thead>

          <tbody>
            <tr className="border-b border-gray-50">
              <td className="py-3 font-medium">🛒 Allegro</td>
              <td className="py-3">
                {allegroAccounts.length === 0 ? (
                  <span className="text-gray-400">brak</span>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {allegroAccounts.map((a: any) => (
                      <span key={a.id} className="text-gray-600">
                        {a.accountName || a.externalAccountId}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td className="py-3">
                {allegroAccounts.length > 0 ? (
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Aktywne</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Brak</span>
                )}
              </td>
            </tr>

            <tr className="border-b border-gray-50">
              <td className="py-3 font-medium">📦 InPost ShipX</td>
              <td className="py-3">
                {inpostAccounts.length === 0 ? (
                  <span className="text-gray-400">brak</span>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {inpostAccounts.map((a: any) => (
                      <span key={a.id} className="text-gray-600">
                        {a.accountName || a.organizationId}
                      </span>
                    ))}
                  </div>
                )}
              </td>
              <td className="py-3">
                {inpostAccounts.length > 0 ? (
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Aktywne</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Brak</span>
                )}
              </td>
            </tr>

            <tr>
              <td className="py-3 font-medium text-gray-300">Erli</td>
              <td className="py-3 text-gray-300">—</td>
              <td className="py-3">
                <span className="text-xs px-2 py-0.5 bg-gray-50 text-gray-300 rounded-full">Wkrótce</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
