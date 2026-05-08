# AllePanel — ostateczna instrukcja zmian: przesyłki, statusy, drukarka Zebra/QZ, dashboard i synchronizacja

Ten dokument opisuje wszystkie zmiany, które zostały zaprojektowane i wdrożone krok po kroku w tej rozmowie. Opisuje funkcje, typy, stałe `const`, flow działania oraz to, po co dana część kodu istnieje.

Projekt składa się z backendu NestJS + Prisma + PostgreSQL oraz frontendu Next.js. Główne obszary zmian:

1. Uporządkowanie zamówień i segmentów dashboardu.
2. Dodanie endpointu opcji przesyłki.
3. Dodanie wspólnego endpointu do realnego nadawania przesyłek.
4. Przebudowa strony szczegółów zamówienia.
5. Dodanie ustawień drukarki etykiet do profilu użytkownika.
6. Dodanie pobierania etykiet PDF A6 / ZPL.
7. Dodanie drukowania przez QZ Tray na drukarce Zebra GC420d.
8. Po udanym nadaniu paczki zmiana statusu Allegro na `READY_FOR_SHIPMENT`.
9. Dodanie kategorii `Wysłane` i zmiana logiki synchronizacji Allegro.

---

# 1. Ogólne flow aplikacji po zmianach

## 1.1. Logowanie

Użytkownik loguje się przez backend `/auth/login`. Backend ustawia cookie `session`. Frontend zawsze wysyła requesty z `credentials: 'include'`, więc nie trzyma tokenów w `localStorage`.

## 1.2. Synchronizacja Allegro

Frontend na dashboardzie wywołuje:

```txt
POST /integrations/allegro/orders/sync-all
```

Backend synchronizuje aktywne konta Allegro użytkownika. Po zmianach jako nowe pobieramy tylko:

```txt
externalOrderStatus = READY_FOR_PROCESSING
externalFulfillmentStatus = NEW albo PROCESSING
```

oraz osobno:

```txt
externalOrderStatus = BOUGHT
```

jako nieopłacone.

Nie pobieramy jako nowe:

```txt
FILLED_IN
READY_FOR_SHIPMENT
SENT
PICKED_UP
READY_FOR_PICKUP
CANCELLED
BUYER_CANCELLED
AUTO_CANCELLED
```

Ale backend odświeża zamówienia już istniejące w bazie, żeby mogły przejść do `Wysłane` albo `Anulowane`.

## 1.3. Dashboard

Dashboard pokazuje zakładki:

```txt
InPost
DPD
DHL
UPS
Inne
Wysłane
Anulowane
Nieopłacone
```

Aktywne zakładki kurierskie pokazują tylko zamówienia gotowe do obsługi, czyli `READY_FOR_PROCESSING + NEW/PROCESSING`.

`Wysłane` pokazuje:

```txt
READY_FOR_SHIPMENT
SENT
PICKED_UP
READY_FOR_PICKUP
```

## 1.4. Strona zamówienia

Strona zamówienia pobiera:

```txt
GET /orders/:id
GET /shipments/orders/:id/options
```

Pierwszy endpoint daje dane zamówienia. Drugi endpoint daje dane potrzebne do formularza przesyłki: dostępne usługi Allegro, konto InPost, domyślne wartości, istniejące przesyłki i rekomendowaną zakładkę.

## 1.5. Nadawanie paczki

Kliknięcie przycisku `Nadaj paczkę...` wysyła:

```txt
POST /shipments/orders/:orderId/create
```

W body frontend wysyła `mode`, np.:

```txt
ALLEGRO
INPOST_LOCKER
INPOST_COURIER
```

Backend na tej podstawie wybiera odpowiednią integrację.

## 1.6. Po udanym nadaniu

Po udanym utworzeniu przesyłki backend próbuje zmienić status realizacji zamówienia w Allegro na:

```txt
READY_FOR_SHIPMENT
```

Lokalnie w bazie też ustawia:

```txt
externalFulfillmentStatus = READY_FOR_SHIPMENT
externalLineItemsSentStatus = ALL
```

Dzięki temu zamówienie powinno zniknąć z aktywnej zakładki kuriera i trafić do `Wysłane`.

## 1.7. Etykieta i drukowanie

Dla InPost ShipX po utworzeniu przesyłki frontend pokazuje:

```txt
Pobierz PDF A6
Pobierz ZPL
Drukuj etykietę
```

`Drukuj etykietę`:

1. pobiera ustawienia drukarki z `/users/me/printer`,
2. pobiera ZPL z `/shipments/:shipmentId/label?format=zpl`,
3. wysyła ZPL do QZ Tray,
4. QZ Tray wysyła ZPL na drukarkę zapisaną w profilu użytkownika.

---

# 2. Backend — `orders.service.ts`

Plik:

```txt
backend/src/orders/orders.service.ts
```

Ten plik odpowiada za czytanie zamówień z bazy i segmentowanie ich do dashboardu.

## 2.1. Typ `OrderListKey`

```ts
type OrderListKey =
  | 'inpost'
  | 'dpd'
  | 'ups'
  | 'dhl'
  | 'sent'
  | 'unpaid'
  | 'cancelled'
  | 'other';
```

Opis:

To lista możliwych kategorii zamówień na dashboardzie. Po zmianach dodano `sent`, czyli `Wysłane`.

Znaczenie poszczególnych wartości:

- `inpost` — aktywne zamówienia InPost.
- `dpd` — aktywne zamówienia DPD.
- `ups` — aktywne zamówienia UPS.
- `dhl` — aktywne zamówienia DHL.
- `sent` — wysłane / gotowe do wysyłki / odebrane.
- `unpaid` — nieopłacone, obecnie tylko `BOUGHT`.
- `cancelled` — anulowane.
- `other` — aktywne zamówienia, których metoda dostawy nie pasuje do InPost/DPD/UPS/DHL.

## 2.2. Typ `GetOrdersQuery`

```ts
type GetOrdersQuery = {
  page?: string;
  limit?: string;
  list?: string;
  marketplace?: string;
  marketplaceAccountId?: string;
  search?: string;
};
```

Opis:

Typ query params dla endpointów `/orders` i `/orders/segments`.

Pola:

- `page` — numer strony listy.
- `limit` — limit rekordów.
- `list` — wybrana zakładka, np. `inpost`, `sent`, `unpaid`.
- `marketplace` — filtr marketplace, np. `ALLEGRO`.
- `marketplaceAccountId` — filtr konkretnego konta marketplace.
- `search` — tekst wyszukiwania po zamówieniu, kupującym, emailu, metodzie dostawy.

## 2.3. Stała `ACTIVE_ORDER_STATUS`

```ts
const ACTIVE_ORDER_STATUS = 'READY_FOR_PROCESSING';
```

Opis:

Oznacza, że zamówienie Allegro jest gotowe do obsługi. To status, w którym Allegro ma już finalne dane dostawy.

Używane przy aktywnych zakładkach kurierskich.

## 2.4. Stała `ACTIVE_FULFILLMENT_STATUSES`

```ts
const ACTIVE_FULFILLMENT_STATUSES = ['NEW', 'PROCESSING'];
```

Opis:

To statusy fulfillment traktowane jako aktywne do obsługi.

Po zmianach usunięto `READY_FOR_SHIPMENT`, bo to nie jest już zamówienie do nadania, tylko ma trafiać do `Wysłane`.

## 2.5. Stała `UNPAID_ORDER_STATUSES`

```ts
const UNPAID_ORDER_STATUSES = ['BOUGHT'];
```

Opis:

Lista statusów traktowanych jako nieopłacone. Zostawiono tylko `BOUGHT`.

`FILLED_IN` pominięto, bo może pojawiać się kilka razy i dane FOD mogą jeszcze ulegać zmianie.

## 2.6. Stała `SHIPPED_FULFILLMENT_STATUSES`

```ts
const SHIPPED_FULFILLMENT_STATUSES = [
  'READY_FOR_SHIPMENT',
  'SENT',
  'PICKED_UP',
  'READY_FOR_PICKUP',
];
```

Opis:

Lista statusów, które mają trafiać do kategorii `Wysłane`.

Znaczenie:

- `READY_FOR_SHIPMENT` — paczka przygotowana do wysyłki.
- `SENT` — wysłana.
- `PICKED_UP` — odebrana.
- `READY_FOR_PICKUP` — gotowa do odbioru.

## 2.7. Stała `CANCELLED_ORDER_STATUSES`

```ts
const CANCELLED_ORDER_STATUSES = ['CANCELLED', 'BUYER_CANCELLED', 'AUTO_CANCELLED'];
```

Opis:

Statusy zamówienia, które trafiają do `Anulowane`.

## 2.8. Stała `CARRIER_KEYS`

```ts
const CARRIER_KEYS = ['inpost', 'dpd', 'ups', 'dhl'] as const;
```

Opis:

Lista słów używanych do rozpoznawania przewoźnika po `deliveryMethodName`.

Używana szczególnie przy kategorii `other`, żeby wykluczyć znanych przewoźników.

## 2.9. Funkcja `getOrdersForUser`

```ts
async getOrdersForUser(userId: number, query: GetOrdersQuery)
```

Do czego służy:

Zwraca listę zamówień dla użytkownika z paginacją i filtrami.

Co robi:

1. Odczytuje `page`, `limit`.
2. Buduje `where` przez `buildWhere`.
3. Pobiera zamówienia z bazy.
4. Pobiera count.
5. Do każdego zamówienia dodaje `carrier`, czyli rozpoznanego przewoźnika.
6. Zwraca:
   - `page`,
   - `limit`,
   - `total`,
   - `totalPages`,
   - `orders`.

Dodatkowo pobiera:

- konto marketplace,
- produkty,
- lokalne przesyłki.

## 2.10. Funkcja `getOrderByIdForUser`

```ts
async getOrderByIdForUser(userId: number, orderId: number)
```

Do czego służy:

Zwraca szczegóły jednego zamówienia.

Co robi:

1. Waliduje `orderId`.
2. Szuka zamówienia po `id`, `userId`, `deletedAt: null`.
3. Pobiera marketplace account, items i shipments.
4. Jeśli nie ma zamówienia, zwraca `NotFoundException`.
5. Zwraca zamówienie z dodatkowym `carrier`.

## 2.11. Funkcja `getOrderSegmentsForUser`

```ts
async getOrderSegmentsForUser(userId: number, query: GetOrdersQuery)
```

Do czego służy:

To główny endpoint dashboardu. Zwraca wszystkie zakładki naraz.

Co robi:

1. Tworzy puste listy:
   - `inpost`,
   - `dpd`,
   - `ups`,
   - `dhl`,
   - `sent`,
   - `unpaid`,
   - `cancelled`,
   - `other`.
2. Dla każdej listy buduje osobny filtr `where`.
3. Pobiera zamówienia i count dla każdej zakładki.
4. Zwraca:

```ts
{
  summary,
  lists,
}
```

`summary` zawiera liczniki, `lists` zawiera konkretne zamówienia.

## 2.12. Funkcja `buildWhere`

```ts
private buildWhere(userId: number, query: GetOrdersQuery)
```

Do czego służy:

Buduje warunek Prisma `where` na podstawie query params.

Co obsługuje:

- filtrowanie po userze,
- ignorowanie soft-delete,
- marketplace,
- marketplaceAccountId,
- search,
- list / zakładka dashboardu.

## 2.13. Funkcja `buildListWhere`

```ts
private buildListWhere(list: OrderListKey)
```

Do czego służy:

Buduje konkretny filtr dla danej zakładki dashboardu.

Logika:

- `unpaid` → `externalOrderStatus IN ['BOUGHT']`.
- `sent` → `externalFulfillmentStatus IN READY_FOR_SHIPMENT/SENT/PICKED_UP/READY_FOR_PICKUP`.
- `cancelled` → external status anulowany albo fulfillment zawiera cancelled.
- `other` → aktywne zamówienia, ale bez znanego przewoźnika.
- `inpost/dpd/ups/dhl` → aktywne zamówienia z nazwą przewoźnika w `deliveryMethodName`.

## 2.14. Funkcja `detectCarrier`

```ts
private detectCarrier(deliveryMethodName?: string | null)
```

Do czego służy:

Rozpoznaje przewoźnika z nazwy metody dostawy.

Zwraca:

- `inpost`, jeśli nazwa zawiera `inpost`, `paczkomat`, `paczko`, `one box`.
- `dpd`, jeśli zawiera `dpd`.
- `ups`, jeśli zawiera `ups`.
- `dhl`, jeśli zawiera `dhl`.
- `other`, jeśli nic nie pasuje.

## 2.15. Funkcja `toPositiveInt`

```ts
private toPositiveInt(value: unknown, fallback: number, max: number)
```

Do czego służy:

Bezpiecznie zamienia query param na dodatnią liczbę całkowitą.

Jeśli wartość jest niepoprawna, zwraca `fallback`.

Jeśli jest większa niż `max`, przycina do `max`.

---

# 3. Backend — `allegro-orders.service.ts`

Plik:

```txt
backend/src/integrations/allegro/services/allegro-orders/allegro-orders.service.ts
```

Ten plik odpowiada za pobieranie i synchronizację zamówień z Allegro.

## 3.1. Stała `ACTIVE_SYNC_FULFILLMENT_STATUSES`

```ts
const ACTIVE_SYNC_FULFILLMENT_STATUSES = ['NEW', 'PROCESSING'];
```

Opis:

Fulfillment statusy, które pobieramy jako nowe/aktywne.

Nie pobieramy już `READY_FOR_SHIPMENT`, bo ono ma trafić do `Wysłane`.

## 3.2. Stała `UNPAID_SYNC_ORDER_STATUSES`

```ts
const UNPAID_SYNC_ORDER_STATUSES = ['BOUGHT'];
```

Opis:

Statusy zamówienia pobierane jako nieopłacone.

Tylko `BOUGHT`. `FILLED_IN` celowo pominięte.

## 3.3. Stała `SHIPPED_FULFILLMENT_STATUSES`

```ts
const SHIPPED_FULFILLMENT_STATUSES = [
  'READY_FOR_SHIPMENT',
  'SENT',
  'PICKED_UP',
  'READY_FOR_PICKUP',
];
```

Opis:

Statusy fulfillment traktowane jako wysłane/po nadaniu.

## 3.4. Stała `CANCELLED_EXTERNAL_ORDER_STATUSES`

```ts
const CANCELLED_EXTERNAL_ORDER_STATUSES = [
  'CANCELLED',
  'BUYER_CANCELLED',
  'AUTO_CANCELLED',
];
```

Opis:

Statusy zamówienia traktowane jako anulowane.

## 3.5. Funkcja `fetchOrdersForAccount`

```ts
async fetchOrdersForAccount(userId: number, marketplaceAccountId: number)
```

Do czego służy:

Pobiera z Allegro zamówienia dla jednego konta marketplace.

Nowa logika:

1. Pobiera `READY_FOR_PROCESSING + fulfillment NEW/PROCESSING`.
2. Pobiera `BOUGHT` jako nieopłacone.
3. Łączy wyniki po `order.id`, żeby nie było duplikatów.
4. Zwraca `checkoutForms`, `count`, `totalCount`.

## 3.6. Funkcja `fetchCheckoutFormsByFilters`

```ts
private async fetchCheckoutFormsByFilters(accessToken: string, filters: { status: string[]; fulfillmentStatus: string[] })
```

Do czego służy:

Uniwersalny helper do pobierania zamówień z Allegro z wybranymi filtrami.

Co robi:

1. Ustawia `limit = 100`.
2. Robi paginację przez `offset`.
3. Dokleja query params:
   - `status`,
   - `fulfillment.status`.
4. Pobiera kolejne strony z Allegro.
5. Kończy, gdy liczba wyników jest mniejsza niż limit albo offset przekroczy total.

## 3.7. Funkcja `refreshPreviouslyActiveOrders`

```ts
private async refreshPreviouslyActiveOrders(userId, marketplaceAccountId, activeExternalOrderIds, accessToken)
```

Do czego służy:

Odświeża zamówienia, które już są w lokalnej bazie, ale nie przyszły w nowej synchronizacji aktywnych zamówień.

Po co:

Żeby zamówienia nie znikały bez aktualizacji. Jeśli zamówienie zostało wysłane, anulowane albo zmieniło fulfillment status, backend aktualizuje lokalną bazę.

Co robi:

1. Bierze lokalne zamówienia Allegro użytkownika.
2. Wyklucza zamówienia, które właśnie zostały pobrane jako aktywne.
3. Dla każdego lokalnego zamówienia pobiera świeżą wersję z Allegro.
4. Jeśli status się zmienił, aktualizuje lokalną bazę.
5. Liczy:
   - `checked`,
   - `updated`,
   - `movedToArchive`,
   - `movedToSent`,
   - `movedToCancelled`.

## 3.8. Funkcja `isShippedFulfillmentStatus`

```ts
private isShippedFulfillmentStatus(status?: string | null)
```

Do czego służy:

Sprawdza, czy fulfillment status należy do statusów wysłanych.

Zwraca `true`, jeśli status jest jednym z:

```txt
READY_FOR_SHIPMENT
SENT
PICKED_UP
READY_FOR_PICKUP
```

## 3.9. Funkcja `isCancelledExternalOrderStatus`

```ts
private isCancelledExternalOrderStatus(status?: string | null)
```

Do czego służy:

Sprawdza, czy external order status jest anulowany.

Zwraca `true` dla:

```txt
CANCELLED
BUYER_CANCELLED
AUTO_CANCELLED
```

## 3.10. Funkcja `mapToLocalOrderStatus`

```ts
private mapToLocalOrderStatus(externalOrderStatus?: string | null, externalFulfillmentStatus?: string | null): OrderStatus
```

Do czego służy:

Mapuje statusy Allegro na lokalny enum `OrderStatus`.

Logika:

- Jeśli anulowane → `OrderStatus.CANCELLED`.
- Jeśli fulfillment jest wysłany → `OrderStatus.SENT`.
- Jeśli fulfillment to `PROCESSING` → `OrderStatus.PROCESSING`.
- W innym przypadku → `OrderStatus.NEW`.

---

# 4. Backend — `shipments.controller.ts`

Plik:

```txt
backend/src/shipments/shipments.controller.ts
```

Ten plik wystawia endpointy przesyłek.

## 4.1. Funkcja `getShipmentOptions`

```ts
@Get('orders/:orderId/options')
async getShipmentOptions(req, orderId)
```

Endpoint:

```txt
GET /shipments/orders/:orderId/options
```

Do czego służy:

Zwraca dane potrzebne do formularza przesyłki. Niczego nie nadaje.

Zwraca m.in.:

- dane zamówienia,
- receiver,
- produkty,
- istniejące przesyłki,
- dostępne usługi Allegro,
- aktywne konta InPost ShipX,
- domyślną zakładkę,
- domyślne wartości formularza.

## 4.2. Funkcja `createShipment`

```ts
@Post('orders/:orderId/create')
async createShipment(req, orderId, body)
```

Endpoint:

```txt
POST /shipments/orders/:orderId/create
```

Do czego służy:

Wspólny endpoint do realnego nadawania paczki.

Body zawiera `mode`, np.:

```txt
ALLEGRO
INPOST_LOCKER
INPOST_COURIER
```

Backend przekazuje to do `ShipmentsService.createShipmentForOrder`.

## 4.3. Funkcja `prepareInpostShipment`

Stary endpoint preview:

```txt
POST /shipments/orders/:orderId/prepare-inpost
```

Zostawiony pomocniczo. Buduje payload InPost, ale nie tworzy przesyłki.

## 4.4. Funkcja `createInpostShipment`

Stary endpoint:

```txt
POST /shipments/orders/:orderId/create-inpost
```

Tworzy realną przesyłkę InPost. Nowy frontend korzysta jednak z `/shipments/orders/:orderId/create`.

## 4.5. Funkcja `getInpostShipmentLabel`

Endpoint:

```txt
GET /shipments/:shipmentId/label?format=pdf-a6
GET /shipments/:shipmentId/label?format=zpl
```

Do czego służy:

Pobiera etykietę przesyłki InPost.

Obsługiwane formaty:

- `pdf-a6`,
- `pdf-a4`,
- `zpl`,
- `epl`.

---

# 5. Backend — `shipments.service.ts`

Plik:

```txt
backend/src/shipments/shipments.service.ts
```

Ten plik jest centralnym orkiestratorem przesyłek.

## 5.1. Typ `PrepareInpostShipmentBody`

```ts
type PrepareInpostShipmentBody = {
  shippingAccountId?: number;
  parcelSize?: string;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  labelFormat?: string;
};
```

Opis:

Dane potrzebne do przygotowania lub utworzenia przesyłki InPost.

## 5.2. Typ `CreateShipmentBody`

```ts
type CreateShipmentBody = PrepareInpostShipmentBody & {
  mode?: string;
  deliveryMethodId?: string;
  credentialsId?: string;
  description?: string;
  reference?: string;
  insuranceAmount?: number;
  codAmount?: number;
  returnLabel?: boolean;
};
```

Opis:

Rozszerzony body dla wspólnego endpointu `/shipments/orders/:orderId/create`.

Pola:

- `mode` — określa ścieżkę nadania.
- `deliveryMethodId` — Allegro delivery method.
- `credentialsId` — Allegro credentials ID dla umowy/usługi.
- `description` — opis zawartości.
- `reference` — numer referencyjny.
- `insuranceAmount` — ubezpieczenie.
- `codAmount` — pobranie.
- `returnLabel` — etykieta zwrotna.

## 5.3. Typ `InpostParcelSize`

```ts
type InpostParcelSize = 'A' | 'B' | 'C';
```

Opis:

Dopuszczalne gabaryty InPost Paczkomaty w obecnym flow.

## 5.4. Typ `ParcelDimensions`

```ts
type ParcelDimensions = {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};
```

Opis:

Wymiary paczki w cm.

## 5.5. Typ `ShipmentOptionsTabKey`

```ts
type ShipmentOptionsTabKey =
  | 'ALLEGRO'
  | 'INPOST_COURIER'
  | 'INPOST_LOCKER'
  | 'TEMU_SHIPPING'
  | 'OTHER';
```

Opis:

Zakładki formularza przesyłki.

## 5.6. Stała `INPOST_PARCEL_LIMITS`

```ts
const INPOST_PARCEL_LIMITS: Record<InpostParcelSize, ParcelDimensions> = {
  A: { lengthCm: 64, widthCm: 38, heightCm: 8 },
  B: { lengthCm: 64, widthCm: 38, heightCm: 19 },
  C: { lengthCm: 64, widthCm: 38, heightCm: 41 },
};
```

Opis:

Limity gabarytów InPost. Backend używa ich do walidacji.

## 5.7. Funkcja `getShipmentOptionsForOrder`

```ts
async getShipmentOptionsForOrder(userId: number, orderId: number)
```

Do czego służy:

Zwraca dane potrzebne do zbudowania formularza przesyłki na froncie.

Nie tworzy paczki.

Co robi:

1. Pobiera zamówienie z bazy.
2. Pobiera produkty i istniejące przesyłki.
3. Pobiera aktywne konta InPost ShipX.
4. Próbuje pobrać usługi Wysyłam z Allegro.
5. Próbuje automatycznie dopasować usługę Allegro do zamówienia.
6. Wylicza domyślną zakładkę.
7. Buduje domyślne pola formularza.
8. Zwraca `providers`, `tabs`, `defaults`, `requirements`, `warnings`.

## 5.8. Funkcja `createShipmentForOrder`

```ts
async createShipmentForOrder(userId: number, orderId: number, body: CreateShipmentBody)
```

Do czego służy:

Wspólny endpoint nadawania paczki.

Logika:

- `INPOST_LOCKER`, `INPOST_COURIER`, `INPOST`, `INPOST_SHIPX` → używa `createInpostShipmentForOrder`.
- `ALLEGRO`, `ALLEGRO_SHIPMENT_MANAGEMENT` → używa `createAllegroShipmentCommandForOrder`.
- `TEMU_SHIPPING` → zwraca błąd, bo nieobsługiwane.
- `OTHER` → zwraca błąd, bo nieobsługiwane.

Po sukcesie zwraca też `provider` i `nextStep`.

## 5.9. Funkcja `prepareInpostShipmentForOrder`

Do czego służy:

Buduje payload InPost bez tworzenia przesyłki.

Co sprawdza:

- czy zamówienie istnieje,
- czy user ma konto InPost,
- czy metoda dostawy wygląda na InPost,
- czy order status to `READY_FOR_PROCESSING`,
- czy fulfillment jest obsługiwany,
- czy są dane odbiorcy,
- czy jest pickup point dla locker,
- czy wymiary/gabaryt są poprawne,
- czy są produkty.

Zwraca `payloadPreview`, `missing`, `fieldErrors`.

## 5.10. Funkcja `getInpostShippingAccount`

Do czego służy:

Znajduje aktywne konto InPost ShipX użytkownika.

Jeśli `shippingAccountId` jest podane, szuka konkretnego konta.
Jeśli nie jest podane, bierze najnowsze aktywne konto użytkownika.

## 5.11. Funkcja `isInpostDeliveryMethod`

Sprawdza, czy nazwa metody dostawy wygląda na InPost.

Szukane słowa:

```txt
inpost
paczkomat
paczko
one box
```

## 5.12. Funkcja `isLockerDelivery`

Sprawdza, czy zamówienie jest do Paczkomatu / punktu.

Zwraca `true`, jeśli:

- jest `pickupPointId`,
- nazwa zawiera `paczkomat`, `paczko`, `one box`.

## 5.13. Funkcja `getShipxServiceForOrder`

Wybiera usługę ShipX:

- locker → `inpost_locker_standard`,
- adres → `inpost_courier_standard`.

## 5.14. Funkcja `buildReceiverName`

Buduje nazwę odbiorcy z:

- `deliveryFirstName`,
- `deliveryLastName`,
- fallback: `buyerLogin`,
- fallback: `buyerEmail`.

## 5.15. Funkcja `normalizePhone`

Czyści telefon:

- usuwa spacje,
- usuwa prefix `+48`.

## 5.16. Funkcja `normalizeParcelSize`

Normalizuje gabaryt do `A`, `B`, `C`.

Jeśli wartość jest błędna, zwraca `null`.

## 5.17. Funkcja `validateInpostParcelInput`

Waliduje dane paczki InPost.

Sprawdza:

- gabaryt,
- wagę,
- długość,
- szerokość,
- wysokość,
- limity gabarytu.

Zwraca:

```ts
{
  fieldErrors,
  parcelSize,
  weightKg,
  dimensions,
}
```

## 5.18. Funkcja `buildShipxParcel`

Buduje obiekt paczki dla ShipX.

Konwertuje cm na mm:

```txt
lengthCm * 10
widthCm * 10
heightCm * 10
```

Dodaje template:

- A → small,
- B → medium,
- C → large.

## 5.19. Funkcja `getShipxTemplate`

Mapuje gabaryt na template InPost:

```txt
A -> small
B -> medium
C -> large
```

## 5.20. Funkcja `createInpostShipmentForOrder`

Do czego służy:

Realnie tworzy przesyłkę przez InPost ShipX.

Co robi:

1. Woła `prepareInpostShipmentForOrder`.
2. Jeśli są błędy, rzuca `BadRequestException`.
3. Sprawdza, czy nie ma już aktywnej przesyłki InPost dla tego zamówienia.
4. Pobiera pełne konto InPost z tokenem.
5. Tworzy przesyłkę przez `InpostShipxService.createShipmentByCredentials`.
6. Zapisuje `shipment` w bazie.
7. Próbuje ustawić status Allegro na `READY_FOR_SHIPMENT` przez `markOrderReadyForShipment`.
8. Zwraca dane przesyłki i `fulfillmentUpdate`.

Ważne:

Jeśli status Allegro nie zmieni się poprawnie, przesyłka nadal zostaje utworzona, a `fulfillmentUpdate.ok` może być `false`.

## 5.21. Funkcja `getInpostShipmentLabelForUser`

Do czego służy:

Pobiera etykietę InPost dla konkretnej przesyłki.

Obsługiwane formaty:

- `pdf-a6`,
- `pdf-a4`,
- `zpl`,
- `epl`.

Sprawdza:

- czy shipment istnieje,
- czy należy do usera,
- czy jest InPost,
- czy ma `externalShipmentId`,
- czy ma konto ShipX.

Po pobraniu etykiety może ustawić status lokalnej przesyłki na `LABEL_READY`.

## 5.22. Funkcja `getFullInpostShippingAccount`

Pobiera pełne konto InPost razem z tokenem API.

Używane do realnego tworzenia przesyłki i pobierania etykiety.

## 5.23. Funkcja `extractExternalShipmentId`

Wyciąga ID przesyłki z odpowiedzi InPost.

Obsługuje różne możliwe pola:

- `id`,
- `shipment_id`,
- `shipmentId`.

## 5.24. Funkcja `extractTrackingNumber`

Wyciąga tracking number z odpowiedzi InPost.

Sprawdza m.in.:

- `tracking_number`,
- `trackingNumber`,
- `tracking_details.number`,
- `parcels[0].tracking_number`.

## 5.25. Funkcja `getLabelContentType`

Zwraca MIME type dla etykiety:

- `zpl` → `text/plain; charset=utf-8`,
- `epl` → `text/plain; charset=utf-8`,
- reszta → `application/pdf`.

## 5.26. Funkcja `getLabelExtension`

Zwraca rozszerzenie pliku:

- `zpl` → `.zpl`,
- `epl` → `.epl`,
- reszta → `.pdf`.

## 5.27. Funkcja `toJsonSafe`

Robi bezpieczną kopię JSON:

```ts
JSON.parse(JSON.stringify(value))
```

Używane do zapisu `rawRequest` i `rawResponse` w Prisma.

## 5.28. Funkcja `buildShipmentTabs`

Buduje listę zakładek formularza przesyłki.

Zwraca każdą zakładkę z polami:

- `key`,
- `label`,
- `enabled`,
- `recommended`,
- `reason`.

## 5.29. Funkcja `detectDefaultShipmentTab`

Automatycznie wybiera domyślną zakładkę przesyłki.

Logika:

1. Jeśli Allegro pasuje do delivery service → `ALLEGRO`.
2. Jeśli rekomendacja to ShipX → `INPOST_LOCKER` lub `INPOST_COURIER`.
3. Jeśli nazwa metody wygląda na InPost → locker/courier.
4. Jeśli są usługi Allegro → `ALLEGRO`.
5. Jeśli jest konto InPost → `INPOST_COURIER`.
6. W innym przypadku → `OTHER`.

## 5.30. Funkcja `getDefaultInpostParcelSize`

Próbuje odczytać gabaryt z nazwy dostawy.

Jeśli nie znajduje, domyślnie zwraca `B`.

## 5.31. Funkcja `buildContentsDescription`

Buduje opis zawartości z nazw produktów.

Maksymalnie 100 znaków.

Fallback:

```txt
Towar ze sprzedaży internetowej
```

## 5.32. Funkcja `toNumberOrNull`

Bezpiecznie konwertuje wartość na number albo `null`.

## 5.33. Funkcja `extractErrorMessage`

Wyciąga czytelny komunikat z błędu API.

Sprawdza:

- `error.response.data`,
- `responseData.message`,
- `responseData.errors`,
- `error.message`.

---

# 6. Backend — `allegro-shipments.service.ts`

Plik:

```txt
backend/src/integrations/allegro/services/allegro-shipments/allegro-shipments.service.ts
```

Ten plik obsługuje Wysyłam z Allegro i zmianę fulfillment status.

## 6.1. Funkcja `markOrderReadyForShipment`

```ts
async markOrderReadyForShipment(userId: number, orderId: number)
```

Do czego służy:

Po udanym nadaniu paczki ustawia w Allegro fulfillment status:

```txt
READY_FOR_SHIPMENT
```

Co robi:

1. Sprawdza `orderId`.
2. Pobiera lokalne zamówienie Allegro.
3. Jeśli to nie Allegro albo nie należy do usera, zwraca `skipped`.
4. Jeśli status już jest `READY_FOR_SHIPMENT`, zwraca sukces bez requestu.
5. Pobiera access token konta Allegro.
6. Buduje query z `checkoutForm.revision`, jeśli jest zapisane.
7. Wysyła do Allegro:

```txt
PUT /order/checkout-forms/{externalOrderId}/fulfillment
```

z body:

```json
{
  "status": "READY_FOR_SHIPMENT",
  "shipmentSummary": {
    "lineItemsSent": "ALL"
  },
  "provider": {
    "id": "SELLER"
  }
}
```

8. Aktualizuje lokalną bazę:

```txt
externalFulfillmentStatus = READY_FOR_SHIPMENT
externalLineItemsSentStatus = ALL
```

9. Zwraca:

```ts
{
  ok: true,
  status: 'READY_FOR_SHIPMENT',
  externalOrderId,
}
```

## 6.2. Zmiana w `createAllegroShipmentCommandForOrder`

Po utworzeniu komendy Wysyłam z Allegro backend wywołuje:

```ts
this.markOrderReadyForShipment(userId, orderId)
```

W odpowiedzi pojawia się:

```ts
fulfillmentUpdate
```

Czyli response pokazuje, czy status Allegro został zmieniony.

---

# 7. Backend — `inpost-shipx.service.ts`

Plik:

```txt
backend/src/integrations/inpost/services/inpost-shipx/inpost-shipx.service.ts
```

Ten plik komunikuje się z API InPost ShipX.

## 7.1. Typ `InpostOrganizationResponse`

Opisuje odpowiedź organizacji InPost.

Zawiera pola:

- `id`,
- `name`,
- `email`,
- `status`,
- `tax_id`,
- oraz dowolne inne.

## 7.2. Typ `LabelRequestSettings`

```ts
type LabelRequestSettings = {
  queryFormat: 'pdf' | 'zpl' | 'epl';
  accept: string;
};
```

Opis:

Określa, jaki query format i jaki `Accept` header wysłać do InPost przy pobieraniu etykiety.

## 7.3. Stała klasowa `shipxBaseUrl`

```ts
private readonly shipxBaseUrl = 'https://api-shipx-pl.easypack24.net';
```

Opis:

Bazowy URL API ShipX.

## 7.4. Funkcja `getOrganizationByCredentials`

Sprawdza dane konta ShipX:

```txt
organizationId
apiToken
```

Używane przy testowaniu i podłączaniu konta InPost.

## 7.5. Funkcja `createShipmentByCredentials`

Tworzy przesyłkę w InPost ShipX dla danej organizacji.

Endpoint:

```txt
POST /v1/organizations/:organizationId/shipments
```

## 7.6. Funkcja `getShipmentLabelByCredentials`

Pobiera etykietę przesyłki.

Endpoint:

```txt
GET /v1/shipments/:externalShipmentId/label?format=...
```

Obsługuje formaty:

- `pdf-a6`,
- `pdf-a4`,
- `zpl`,
- `epl`.

## 7.7. Funkcja `getLabelRequestSettings`

Mapuje format z aplikacji na query/Accept dla InPost.

Logika:

- `zpl` → `format=zpl`, `Accept: text/zpl;dpi=203`.
- `epl` / `epl2` → `format=epl`, `Accept: text/epl2;dpi=203`.
- `pdf-a4` / `a4` → `format=pdf`, `Accept: application/pdf;format=A4`.
- domyślnie → `format=pdf`, `Accept: application/pdf;format=A6`.

## 7.8. Funkcja `getShipxHeaders`

Buduje nagłówki do ShipX:

```ts
Authorization: Bearer apiToken
Content-Type: application/json
Accept: application/json
```

---

# 8. Backend — ustawienia drukarki użytkownika

## 8.1. Prisma — nowe pola w modelu `User`

Dodane pola:

```prisma
labelPrinterName     String?
labelPrinterFormat   String? @default("zpl")
labelPrinterDpi      Int?    @default(203)
labelPrinterWidthMm  Int?    @default(100)
labelPrinterHeightMm Int?    @default(150)
```

Znaczenie:

- `labelPrinterName` — nazwa drukarki w systemie/QZ Tray, np. `ZDesigner GC420d`.
- `labelPrinterFormat` — format etykiety, domyślnie `zpl`.
- `labelPrinterDpi` — DPI, dla Zebra GC420d zwykle `203`.
- `labelPrinterWidthMm` — szerokość etykiety w mm, np. `100`.
- `labelPrinterHeightMm` — wysokość etykiety w mm, np. `150`.

## 8.2. `auth.service.ts` — funkcja `safeUser`

Zmieniona, żeby `/auth/me` zwracał także ustawienia drukarki.

Zwraca m.in.:

```ts
labelPrinterName
labelPrinterFormat
labelPrinterDpi
labelPrinterWidthMm
labelPrinterHeightMm
```

## 8.3. `users.controller.ts`

Nowy plik:

```txt
backend/src/users/users.controller.ts
```

## 8.4. Funkcja `getMyPrinter`

Endpoint:

```txt
GET /users/me/printer
```

Do czego służy:

Zwraca ustawienia drukarki aktualnie zalogowanego użytkownika.

## 8.5. Funkcja `updateMyPrinter`

Endpoint:

```txt
PATCH /users/me/printer
```

Do czego służy:

Zapisuje ustawienia drukarki dla aktualnie zalogowanego użytkownika.

## 8.6. `users.service.ts` — typ `UpdatePrinterSettingsBody`

Opisuje body do zapisu ustawień drukarki.

Pola:

- `labelPrinterName`,
- `labelPrinterFormat`,
- `labelPrinterDpi`,
- `labelPrinterWidthMm`,
- `labelPrinterHeightMm`.

## 8.7. Funkcja `getPrinterSettings`

Pobiera z bazy ustawienia drukarki usera.

Zwraca domyślne wartości, jeśli część pól jest pusta:

- format: `zpl`,
- dpi: `203`,
- width: `100`,
- height: `150`.

## 8.8. Funkcja `updatePrinterSettings`

Zapisuje ustawienia drukarki.

Jeśli `labelPrinterName` jest puste/null, traktuje to jako usunięcie drukarki z profilu.

## 8.9. Funkcja `normalizeNullableString`

Czyści string.

Jeśli pusty, zwraca `null`.

## 8.10. Funkcja `normalizePrinterFormat`

Waliduje format drukarki.

Dozwolone:

```txt
zpl
pdf-a6
pdf-a4
epl
```

## 8.11. Funkcja `normalizePositiveInt`

Waliduje dodatnie liczby całkowite, np. DPI i rozmiar etykiety.

---

# 9. Frontend — `api.ts`

Plik:

```txt
frontend/src/lib/api.ts
```

## 9.1. Stała `API`

```ts
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
```

Opis:

Bazowy adres backendu.

## 9.2. Stała `API_BASE`

```ts
export const API_BASE = API
```

Opis:

Eksport bazowego adresu API. Używany m.in. do linków do etykiet PDF/ZPL.

## 9.3. Funkcja `api`

```ts
export async function api(path: string, opts: RequestInit = {}): Promise<any>
```

Do czego służy:

Główny helper do requestów JSON.

Co robi:

- dokleja `API` do ścieżki,
- ustawia `credentials: 'include'`,
- ustawia `Content-Type: application/json`,
- obsługuje 401,
- parsuje JSON,
- rzuca błędy.

## 9.4. Funkcja `fetchTextFile`

```ts
export async function fetchTextFile(path: string): Promise<string>
```

Do czego służy:

Pobiera plik tekstowy z backendu. Używane do pobierania ZPL.

Różni się od `api`, bo nie próbuje parsować JSON.

## 9.5. Stała `ALLEGRO_START`

```ts
export const ALLEGRO_START = `${API}/integrations/allegro/start`
```

Opis:

Adres startu OAuth Allegro.

---

# 10. Frontend — QZ Tray

## 10.1. Plik `qz-tray.d.ts`

Plik:

```txt
frontend/src/types/qz-tray.d.ts
```

Kod:

```ts
declare module 'qz-tray' {
  const qz: any
  export default qz
}
```

Do czego służy:

Daje TypeScriptowi informację, że moduł `qz-tray` istnieje.

## 10.2. Plik `qzPrint.ts`

Plik:

```txt
frontend/src/lib/qzPrint.ts
```

## 10.3. Typ `QzPrinterSettings`

```ts
type QzPrinterSettings = {
  labelPrinterName?: string | null
  labelPrinterDpi?: number | string | null
  labelPrinterWidthMm?: number | string | null
  labelPrinterHeightMm?: number | string | null
}
```

Opis:

Ustawienia drukarki pobrane z backendu.

## 10.4. Funkcja `mmToInches`

```ts
function mmToInches(value: number)
```

Do czego służy:

QZ Tray przy `size` używa cali, więc funkcja konwertuje mm na cale.

## 10.5. Funkcja `getQz`

```ts
async function getQz()
```

Do czego służy:

Dynamicznie importuje `qz-tray` tylko po stronie klienta.

## 10.6. Funkcja `printZplWithQz`

```ts
export async function printZplWithQz(zpl: string, settings: QzPrinterSettings)
```

Do czego służy:

Wysyła ZPL do lokalnej drukarki przez QZ Tray.

Co robi:

1. Sprawdza, czy user ma zapisaną nazwę drukarki.
2. Sprawdza, czy jest ZPL.
3. Importuje QZ.
4. Łączy się z QZ websocket, jeśli nie jest aktywny.
5. Szuka drukarki po nazwie.
6. Tworzy config z rozmiarem etykiety.
7. Wysyła raw ZPL do drukarki.
8. Zwraca `{ ok: true, printerName }`.

Możliwe błędy:

- brak drukarki w profilu,
- brak danych ZPL,
- QZ Tray nie działa,
- nazwa drukarki jest zła.

---

# 11. Frontend — `account/page.tsx`

Plik:

```txt
frontend/src/app/(app)/account/page.tsx
```

Ten plik dostał sekcję `Drukarka etykiet`.

## 11.1. Typ `PrinterSettings`

```ts
type PrinterSettings = {
  labelPrinterName: string
  labelPrinterFormat: 'zpl' | 'pdf-a6' | 'pdf-a4' | 'epl'
  labelPrinterDpi: string
  labelPrinterWidthMm: string
  labelPrinterHeightMm: string
}
```

Opis:

Stan formularza drukarki w React.

## 11.2. Funkcja `inp`

Zwraca klasy CSS Tailwind dla inputów.

## 11.3. Funkcja `btn`

Zwraca klasy CSS Tailwind dla przycisków.

## 11.4. Funkcja `normalizePrinter`

Normalizuje odpowiedź backendu do formatu używanego przez formularz.

Przydaje się, bo backend zwraca liczby, a inputy w React trzymają stringi.

## 11.5. Komponent `AccountPage`

Główna strona konta.

Zawiera:

- dane konta,
- sekcję drukarki,
- integracje Allegro/InPost.

## 11.6. Funkcja `loadPrinter`

Wywołuje:

```txt
GET /users/me/printer
```

Ustawia stan formularza drukarki.

## 11.7. Funkcja `savePrinter`

Wywołuje:

```txt
PATCH /users/me/printer
```

Zapisuje:

- nazwę drukarki,
- format,
- DPI,
- rozmiar etykiety.

## 11.8. Funkcja `removePrinter`

Wysyła `labelPrinterName: null`, czyli usuwa drukarkę z profilu.

## 11.9. Funkcja `testInpost`

Testuje dane ShipX.

## 11.10. Funkcja `connectInpost`

Łączy konto InPost ShipX.

## 11.11. Funkcja `setIP`

Ustawia pole formularza InPost.

## 11.12. Funkcja `setPrinterField`

Ustawia pole formularza drukarki i czyści komunikat.

## 11.13. Stała `printerConfigured`

```ts
const printerConfigured = Boolean(printer.labelPrinterName.trim())
```

Opis:

Określa, czy user ma zapisaną drukarkę.

---

# 12. Frontend — `orders/[id]/page.tsx`

Plik:

```txt
frontend/src/app/(app)/orders/[id]/page.tsx
```

Ten plik jest stroną szczegółów zamówienia i przesyłki.

## 12.1. Typ `ShipmentTabKey`

```ts
type ShipmentTabKey = 'ALLEGRO' | 'INPOST_COURIER' | 'INPOST_LOCKER' | 'TEMU_SHIPPING' | 'OTHER'
```

Opis:

Możliwe zakładki formularza przesyłki.

## 12.2. Typ `ParcelRow`

```ts
type ParcelRow = {
  weightKg: string
  lengthCm: string
  widthCm: string
  heightCm: string
  template: string
}
```

Opis:

Stan jednej podpaczki w formularzu.

## 12.3. Stała `TAB_LABELS`

Mapuje techniczne klucze zakładek na etykiety widoczne w UI.

## 12.4. Stała `TAB_ORDER`

Określa kolejność zakładek:

```txt
Allegro.pl
InPost Kurier
InPost Paczkomaty
Temu Shipping
Inne
```

## 12.5. Stała `LOCKER_SIZE_DIMENSIONS`

Mapuje gabaryt Paczkomatu na techniczne wymiary wysyłane do backendu.

```txt
A -> 64 x 38 x 8
B -> 64 x 38 x 19
C -> 64 x 38 x 41
```

Dzięki temu dla InPost Paczkomaty operator nie wpisuje wymiarów ręcznie.

## 12.6. Stała `INPOST_LOCKER_SIZES`

Lista gabarytów pokazywana w UI jako radio buttony.

## 12.7. Stała `PACKAGE_TEMPLATES`

Szablony paczek dla Allegro / InPost Kurier.

Pozwalają szybko ustawić wagę i wymiary.

## 12.8. Funkcja `inputClass`

Zwraca klasy CSS dla inputów.

## 12.9. Funkcja `selectClass`

Zwraca klasy CSS dla selectów.

## 12.10. Komponent `Field`

Mały komponent pola formularza z labelką i błędem.

## 12.11. Funkcja `money`

Formatuje kwotę jako `0.00 PLN`.

## 12.12. Funkcja `datePL`

Formatuje datę do polskiego formatu.

## 12.13. Funkcja `compactId`

Skraca długi externalOrderId do krótszego widoku.

## 12.14. Funkcja `toText`

Bezpiecznie zamienia wartość na string.

## 12.15. Funkcja `getInitialParcels`

Buduje początkową listę paczek z defaultów backendu.

## 12.16. Funkcja `calculateVolumetricWeight`

Liczy wagę gabarytową:

```txt
length * width * height / 6000
```

## 12.17. Komponent `Card`

Wrapper UI dla białych kart z borderem.

## 12.18. Komponent `SectionTitle`

Nagłówek sekcji.

## 12.19. Komponent `MoneyInput`

Input z dopiskiem `PLN` po prawej stronie.

## 12.20. Komponent `OrderDetailPage`

Główna strona szczegółów zamówienia.

Co robi:

1. Pobiera `id` z URL.
2. Pobiera `/orders/:id`.
3. Pobiera `/shipments/orders/:id/options`.
4. Ustawia domyślną zakładkę z backendu.
5. Pokazuje produkty, dane kupującego, dostawę, informacje o zamówieniu.
6. Pokazuje formularz przesyłki.
7. Obsługuje nadawanie paczki.
8. Obsługuje pobieranie i druk etykiety.

## 12.21. Funkcja `setF`

Ustawia pole formularza i czyści błąd tego pola.

## 12.22. Funkcja `updateParcel`

Aktualizuje wybrane pole wybranej podpaczki.

## 12.23. Funkcja `applyTemplate`

Po wybraniu szablonu paczki wpisuje wagę i wymiary do formularza.

## 12.24. Funkcja `addParcel`

Dodaje kolejną podpaczę w UI.

Uwaga: backend aktualnie używa tylko pierwszej paczki. UI jest przygotowane pod przyszłą wielopaczkowość.

## 12.25. Funkcja `removeParcel`

Usuwa podpaczę z UI, ale nie pozwala usunąć ostatniej.

## 12.26. Funkcja `getEffectiveParcel`

Zwraca paczkę, która faktycznie pójdzie do backendu.

Dla `INPOST_LOCKER` bierze wymiary z gabarytu.

Dla innych trybów bierze pierwszą paczkę z formularza.

## 12.27. Funkcja `validate`

Waliduje formularz przed nadaniem.

Dla Allegro wymaga `deliveryMethodId`.

Dla InPost wymaga `shippingAccountId`.

Dla Paczkomatów wymaga `parcelSize`, ale nie wymaga ręcznych wymiarów.

Dla Allegro/InPost Kurier wymaga wagi i wymiarów.

## 12.28. Funkcja `submitShipment`

Wywoływana po kliknięciu `Nadaj...`.

Co robi:

1. Waliduje formularz.
2. Buduje payload.
3. Wysyła:

```txt
POST /shipments/orders/:id/create
```

4. Zapisuje wynik w `result`.

## 12.29. Funkcja `labelUrl`

Buduje URL do pobrania etykiety:

```txt
/shipments/:shipmentId/label?format=pdf-a6
/shipments/:shipmentId/label?format=zpl
```

## 12.30. Funkcja `printShipmentLabel`

Wywoływana po kliknięciu `Drukuj etykietę`.

Co robi:

1. Pobiera ustawienia drukarki:

```txt
GET /users/me/printer
```

2. Jeśli nie ma drukarki, pokazuje błąd.
3. Pobiera ZPL:

```txt
GET /shipments/:shipmentId/label?format=zpl
```

4. Wywołuje `printZplWithQz(zpl, printer)`.
5. Pokazuje komunikat sukcesu albo błędu.

## 12.31. Funkcja `renderInpostLabelButtons`

Renderuje przyciski:

```txt
Pobierz PDF A6
Pobierz ZPL
Drukuj etykietę
```

W wersji `small` pokazuje krótsze etykiety przy istniejących przesyłkach w panelu bocznym.

---

# 13. Frontend — `dashboard/page.tsx`

Plik:

```txt
frontend/src/app/(app)/dashboard/page.tsx
```

## 13.1. Stała `TABS`

Lista zakładek dashboardu:

```ts
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
```

Opis:

Steruje kolejnością, nazwą i kolorem zakładek dashboardu.

## 13.2. Typ `OrderItem`

Opisuje produkt zamówienia w dashboardzie.

## 13.3. Funkcja `groupItems`

Grupuje identyczne produkty po:

- nazwie,
- obrazku,
- externalOfferId.

Sumuje quantity.

## 13.4. Komponent `OrderImages`

Pokazuje obrazek pierwszego produktu. Jeśli quantity > 1, dodaje badge `xN`.

## 13.5. Funkcja `getStatusBadge`

Pokazuje badge statusu.

- Wysłane → zielony badge.
- Anulowane → czerwony badge.
- BOUGHT → żółty badge.
- inne → niebieski badge.

## 13.6. Komponent `OrderRow`

Pojedynczy wiersz zamówienia na dashboardzie.

Po kliknięciu prowadzi do:

```txt
/orders/:id
```

## 13.7. Komponent `DashboardPage`

Główna strona dashboardu.

## 13.8. Funkcja `loadSegments`

Pobiera:

```txt
GET /orders/segments?limit=100
```

## 13.9. Funkcja `sync`

Wywołuje:

```txt
POST /integrations/allegro/orders/sync-all
```

Po sukcesie odświeża segmenty.

---

# 14. Ostateczne testy działania

## 14.1. Test ustawień drukarki

1. Wejdź w `/account`.
2. Wpisz dokładną nazwę drukarki z systemu/QZ Tray, np.:

```txt
ZDesigner GC420d
```

3. Format: `ZPL`.
4. DPI: `203`.
5. Rozmiar: `100 x 150`.
6. Kliknij `Zapisz drukarkę`.
7. Odśwież stronę.
8. Dane powinny zostać.

## 14.2. Test etykiety ZPL

Wejdź w:

```txt
GET /shipments/:id/label?format=zpl
```

Powinieneś zobaczyć tekst zaczynający się od:

```txt
^XA
```

To jest poprawny ZPL.

## 14.3. Test drukowania

1. Uruchom QZ Tray.
2. Wejdź w zamówienie z przesyłką InPost.
3. Kliknij `Drukuj etykietę`.

Możliwe wyniki:

- `✓ Etykieta wysłana do drukarki` — działa.
- `Brak zapisanej drukarki` — trzeba zapisać drukarkę w profilu.
- `Nie znaleziono drukarki` — nazwa w profilu nie zgadza się z QZ/Windows.
- błąd websocket/QZ — QZ Tray nie działa.

## 14.4. Test nadania paczki

Po kliknięciu `Nadaj paczkę...` i sukcesie powinno pojawić się:

```txt
✓ Operacja wykonana
Przesyłka InPost została utworzona.
```

oraz przyciski:

```txt
Pobierz PDF A6
Pobierz ZPL
Drukuj etykietę
```

## 14.5. Test statusu Allegro po nadaniu

Po udanym nadaniu response powinien zawierać:

```json
"fulfillmentUpdate": {
  "ok": true,
  "status": "READY_FOR_SHIPMENT"
}
```

Jeśli jest `ok: false`, paczka została utworzona, ale Allegro odrzuciło zmianę statusu.

## 14.6. Test kategorii `Wysłane`

Po udanej zmianie statusu:

```txt
GET /orders/segments?limit=100
```

zamówienie powinno trafić do:

```txt
lists.sent
```

Dashboard powinien pokazać licznik w zakładce `Wysłane`.

---

# 15. Ważne ograniczenia obecnej wersji

## 15.1. Allegro labels

Przyciski pobierania/drukowania etykiety są gotowe dla InPost ShipX.

Allegro ma osobny flow:

```txt
create command -> check command -> get shipment details -> get label
```

To trzeba dopiąć osobnym etapem.

## 15.2. Wielopaczkowość

Frontend ma UI `+ Kolejna podpaczka`, ale backend obecnie wysyła tylko pierwszą paczkę.

To jest przygotowane pod przyszły etap.

## 15.3. PDF A6

PDF A6 może wyglądać jak etykieta w części strony w podglądzie PDF. Dla Zebra GC420d głównym formatem powinien być ZPL.

## 15.4. QZ Tray i popupy

W dev QZ Tray może pytać o zgodę / certyfikat.

Docelowe całkowicie ciche drukowanie wymaga poprawnej konfiguracji QZ Tray i certyfikatu.

---

# 16. Najkrótsze podsumowanie logiki biznesowej

1. Synchronizacja pobiera tylko zamówienia, które naprawdę są nowe do obsługi: `READY_FOR_PROCESSING + NEW/PROCESSING`.
2. `BOUGHT` trafia do `Nieopłacone`.
3. `FILLED_IN` jest pomijane.
4. Po nadaniu paczki backend próbuje zmienić status Allegro na `READY_FOR_SHIPMENT`.
5. `READY_FOR_SHIPMENT`, `SENT`, `PICKED_UP`, `READY_FOR_PICKUP` trafiają do `Wysłane`.
6. Etykiety InPost można pobrać jako `PDF A6` lub `ZPL`.
7. Zebra GC420d powinna drukować przez `ZPL` i QZ Tray.
8. Drukarka jest przypisana do profilu użytkownika.
9. Jeśli drukarki nie ma w profilu, przycisk `Drukuj etykietę` pokazuje błąd.
10. Jeśli QZ działa i nazwa drukarki jest poprawna, kliknięcie `Drukuj etykietę` wysyła ZPL bezpośrednio do drukarki.

