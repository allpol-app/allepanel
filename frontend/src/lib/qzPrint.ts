type QzPrinterSettings = {
  labelPrinterName?: string | null
  labelPrinterDpi?: number | string | null
  labelPrinterWidthMm?: number | string | null
  labelPrinterHeightMm?: number | string | null
}

declare global {
  interface Window {
    qz?: any
  }
}

const QZ_CDN_URL = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.6/qz-tray.js'

function mmToInches(value: number) {
  return value / 25.4
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('QZ Tray działa tylko w przeglądarce.'))
      return
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)

    if (existing) {
      if ((existing as any).dataset.loaded === 'true') {
        resolve()
        return
      }

      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Nie udało się załadować QZ Tray JS.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.dataset.loaded = 'false'

    script.onload = () => {
      script.dataset.loaded = 'true'
      resolve()
    }

    script.onerror = () => {
      reject(new Error('Nie udało się załadować QZ Tray JS. Sprawdź internet albo dodaj plik lokalnie do /public.'))
    }

    document.head.appendChild(script)
  })
}

async function getQz() {
  if (typeof window === 'undefined') {
    throw new Error('QZ Tray działa tylko w przeglądarce.')
  }

  if (!window.qz) {
    await loadScript(QZ_CDN_URL)
  }

  if (!window.qz) {
    throw new Error('QZ Tray JS nie został załadowany.')
  }

  const qz = window.qz

  if (qz.api?.setPromiseType) {
    qz.api.setPromiseType((resolver: any) => new Promise(resolver))
  }

  return qz
}

export async function printZplWithQz(zpl: string, settings: QzPrinterSettings) {
  const printerName = String(settings.labelPrinterName || '').trim()

  if (!printerName) {
    throw new Error('Brak zapisanej drukarki etykiet w profilu użytkownika.')
  }

  if (!zpl || !zpl.trim()) {
    throw new Error('Brak danych ZPL etykiety do druku.')
  }

  const qz = await getQz()

  if (!qz.websocket.isActive()) {
    await qz.websocket.connect()
  }

  const resolvedPrinterName = await qz.printers.find(printerName)

  if (!resolvedPrinterName) {
    throw new Error(`Nie znaleziono drukarki: ${printerName}`)
  }

  const widthMm = Number(settings.labelPrinterWidthMm || 100)
  const heightMm = Number(settings.labelPrinterHeightMm || 150)

  const config = qz.configs.create(resolvedPrinterName, {
    size: {
      width: mmToInches(widthMm),
      height: mmToInches(heightMm),
    },
    jobName: 'AllePanel label',
  })

  await qz.print(config, [zpl])

  return {
    ok: true,
    printerName: resolvedPrinterName,
  }
}
