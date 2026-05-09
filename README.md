# Backend AllePanel — dokumentacja wybranych plików, funkcji, stałych i zmiennych

Dokument opisuje dokładnie pliki z tej struktury:

```txt
backend/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── auth/
│   │   ├── dto/
│   │   │   ├── login.dto.ts
│   │   │   └── register.dto.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.guard.ts
│   │   ├── auth.module.ts
│   │   └── auth.service.ts
│   ├── orders/
│   │   ├── orders.controller.ts
│   │   ├── orders.module.ts
│   │   └── orders.service.ts
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   ├── shipments/
│   │   ├── shipments.controller.ts
│   │   ├── shipments.module.ts
│   │   └── shipments.service.ts
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   └── users.service.ts
│   ├── app.controller.ts
│   ├── app.module.ts
│   ├── app.service.ts
│   └── main.ts
```

Opis uwzględnia pliki pierwotnie przesłane oraz późniejsze zmiany z rozmowy: ustawienia drukarki użytkownika, endpointy przesyłek, dashboard `Wysłane`, zmiany statusu Allegro na `READY_FOR_SHIPMENT`, formaty etykiet i druk ZPL/QZ Tray.

---

# 1. `backend/prisma/schema.prisma`

## 1.1. Rola pliku

`schema.prisma` definiuje strukturę bazy danych PostgreSQL oraz generowanie klienta Prisma. W tym projekcie baza przechowuje:

- użytkowników panelu,
- sesje logowania,
- konta marketplace, np. Allegro,
- zamówienia i produkty,
- konta kurierskie InPost ShipX,
- przesyłki,
- ustawienia drukarki etykiet użytkownika.

## 1.2. Blok `generator client`

- `provider = "prisma-client"`
  - Określa generator klienta Prisma.
- `output = "../src/generated/prisma"`
  - Wygenerowany klient Prisma trafia do `src/generated/prisma`.
- `moduleFormat = "cjs"`
  - Klient generowany jest w formacie CommonJS.

## 1.3. Blok `datasource db`

- `provider = "postgresql"`
  - Baza danych to PostgreSQL.
- URL bazy jest pobierany przez konfigurację Prisma z `DATABASE_URL`, ustawioną w `prisma.config.ts` i `.env`.

---

## 1.4. Enum `Marketplace`

```prisma
enum Marketplace {
  ALLEGRO
  ERLI
}
```

- `ALLEGRO`
  - Zamówienie albo konto pochodzi z Allegro.
- `ERLI`
  - Przyszła / planowana integracja z Erli.

---

## 1.5. Enum `MarketplaceAccountStatus`

```prisma
enum MarketplaceAccountStatus {
  ACTIVE
  DISCONNECTED
  ERROR
}
```

- `ACTIVE`
  - Konto marketplace jest połączone i może być używane.
- `DISCONNECTED`
  - Konto istnieje lokalnie, ale nie jest aktywnie połączone.
- `ERROR`
  - Konto ma błąd integracji, tokenów albo autoryzacji.

---

## 1.6. Enum `OrderStatus`

```prisma
enum OrderStatus {
  NEW
  PROCESSING
  SENT
  CANCELLED
}
```

- `NEW`
  - Zamówienie nowe, do obsługi.
- `PROCESSING`
  - Zamówienie w trakcie obsługi.
- `SENT`
  - Zamówienie wysłane / przygotowane do wysyłki.
- `CANCELLED`
  - Zamówienie anulowane.

Ten enum jest wewnętrznym uproszczeniem statusów Allegro.

---

## 1.7. Enum `ShippingProvider`

```prisma
enum ShippingProvider {
  INPOST_SHIPX
}
```

- `INPOST_SHIPX`
  - Konto kurierskie użytkownika obsługiwane przez InPost ShipX.

---

## 1.8. Enum `ShippingAccountStatus`

```prisma
enum ShippingAccountStatus {
  ACTIVE
  DISCONNECTED
  ERROR
}
```

- `ACTIVE`
  - Konto kurierskie działa.
- `DISCONNECTED`
  - Konto nieaktywne / niepołączone.
- `ERROR`
  - Konto ma błąd integracji.

---

## 1.9. Enum `ShipmentProvider`

```prisma
enum ShipmentProvider {
  INPOST_SHIPX
  ALLEGRO_SHIPMENT_MANAGEMENT
  DPD
  DHL
  UPS
  OTHER
}
```

- `INPOST_SHIPX`
  - Przesyłka utworzona bezpośrednio przez InPost ShipX.
- `ALLEGRO_SHIPMENT_MANAGEMENT`
  - Przesyłka / komenda nadania przez Wysyłam z Allegro.
- `DPD`, `DHL`, `UPS`
  - Przyszli / potencjalni przewoźnicy.
- `OTHER`
  - Inna metoda nadania.

---

## 1.10. Enum `ShipmentStatus`

```prisma
enum ShipmentStatus {
  DRAFT
  CREATED
  LABEL_READY
  SENT
  ERROR
  CANCELLED
}
```

- `DRAFT`
  - Przesyłka szkicowa, jeszcze nie utworzona u przewoźnika.
- `CREATED`
  - Przesyłka utworzona u operatora.
- `LABEL_READY`
  - Etykieta została pobrana / jest gotowa.
- `SENT`
  - Przesyłka wysłana.
- `ERROR`
  - Błąd utworzenia / obsługi przesyłki.
- `CANCELLED`
  - Przesyłka anulowana.

---

## 1.11. Enum `ShipmentParcelSize`

```prisma
enum ShipmentParcelSize {
  A
  B
  C
  CUSTOM
}
```

- `A`, `B`, `C`
  - Gabaryty InPost Paczkomaty.
- `CUSTOM`
  - Niestandardowe wymiary paczki.

---

## 1.12. Model `User`

Tabela: `users`.

### Pola podstawowe

- `id Int @id @default(autoincrement())`
  - Główne ID użytkownika.
- `email String @unique`
  - Login użytkownika. Musi być unikalny.
- `passwordHash String`
  - Hash hasła, np. bcrypt.
- `firstName String?`
  - Imię użytkownika.
- `lastName String?`
  - Nazwisko użytkownika.
- `companyName String?`
  - Firma użytkownika.
- `taxId String?`
  - NIP / identyfikator podatkowy.
- `phone String?`
  - Telefon użytkownika.

### Pola drukarki etykiet dodane w zmianach

- `labelPrinterName String?`
  - Nazwa drukarki etykiet widoczna w Windows/QZ Tray, np. `ZDesigner GC420d`.
- `labelPrinterFormat String? @default("zpl")`
  - Domyślny format etykiety. Dla Zebra preferowany `zpl`.
- `labelPrinterDpi Int? @default(203)`
  - DPI drukarki. Zebra GC420d zwykle używa 203 dpi.
- `labelPrinterWidthMm Int? @default(100)`
  - Szerokość etykiety w milimetrach.
- `labelPrinterHeightMm Int? @default(150)`
  - Wysokość etykiety w milimetrach.

### Relacje

- `marketplaceAccounts MarketplaceAccount[]`
  - Konta marketplace tego użytkownika.
- `oauthStates OAuthState[]`
  - Stany OAuth.
- `orders Order[]`
  - Zamówienia użytkownika.
- `sessions Session[]`
  - Sesje logowania użytkownika.
- `shippingAccounts ShippingAccount[]`
  - Konta kurierskie użytkownika, np. InPost ShipX.
- `shipments Shipment[]`
  - Przesyłki użytkownika.

### Daty

- `createdAt DateTime @default(now())`
  - Data utworzenia użytkownika.
- `updatedAt DateTime @updatedAt`
  - Data ostatniej aktualizacji.
- `deletedAt DateTime?`
  - Soft delete użytkownika.

---

## 1.13. Model `MarketplaceAccount`

Tabela: `marketplace_accounts`.

- `id`
  - Lokalne ID konta marketplace.
- `userId`
  - ID właściciela konta.
- `user`
  - Relacja do `User`.
- `marketplace`
  - Platforma: `ALLEGRO` albo `ERLI`.
- `status`
  - Status konta: `ACTIVE`, `DISCONNECTED`, `ERROR`.
- `accountName`
  - Nazwa widoczna w panelu.
- `externalAccountId`
  - ID konta w zewnętrznym systemie.
- `accessToken`
  - Token API/OAuth.
- `refreshToken`
  - Refresh token.
- `tokenType`
  - Typ tokena.
- `tokenExpiresAt`
  - Data wygaśnięcia tokena.
- `errorMessage`
  - Ostatni błąd integracji.
- `oauthStates`
  - Relacja do OAuthState.
- `orders`
  - Zamówienia z tego konta.
- `createdAt`, `updatedAt`, `deletedAt`
  - Daty i soft delete.

### Indexy

- `@@index([userId])`
- `@@index([userId, marketplace])`
- `@@index([marketplace])`
- `@@index([externalAccountId])`

---

## 1.14. Model `OAuthState`

Tabela: `oauth_states`.

- `id`
  - ID rekordu.
- `stateToken String @unique`
  - Token OAuth state.
- `userId`
  - User, który rozpoczął OAuth.
- `user`
  - Relacja do `User`.
- `marketplaceAccountId`
  - Konto marketplace, którego dotyczy OAuth.
- `marketplaceAccount`
  - Relacja do `MarketplaceAccount`.
- `marketplace`
  - Platforma.
- `expiresAt`
  - Kiedy state wygasa.
- `usedAt`
  - Kiedy został użyty.
- `createdAt`
  - Data utworzenia.

### Indexy

- `userId`, `stateToken`, `marketplaceAccountId`, `marketplace`, `expiresAt`.

---

## 1.15. Model `Order`

Tabela: `orders`.

### Identyfikacja

- `id`
  - Lokalne ID zamówienia.
- `externalOrderId`
  - ID zamówienia z Allegro / innego marketplace.
- `marketplace`
  - Platforma.
- `userId`, `user`
  - Właściciel zamówienia.
- `marketplaceAccountId`, `marketplaceAccount`
  - Konto marketplace, z którego pobrano zamówienie.

### Statusy

- `status OrderStatus @default(NEW)`
  - Lokalny status uproszczony.
- `externalOrderStatus String?`
  - Status zamówienia z Allegro, np. `READY_FOR_PROCESSING`, `BOUGHT`.
- `externalFulfillmentStatus String?`
  - Status realizacji, np. `NEW`, `PROCESSING`, `READY_FOR_SHIPMENT`.
- `externalLineItemsSentStatus String?`
  - Status wysłania pozycji, np. `ALL`.

### Kwoty

- `totalAmount`
  - Suma produktów.
- `totalToPay`
  - Całość do zapłaty.
- `currency`
  - Waluta, domyślnie `PLN`.

### Daty

- `orderCreatedAt`
  - Data utworzenia zamówienia w marketplace.
- `externalUpdatedAt`
  - Data aktualizacji z platformy.
- `syncedAt`
  - Data lokalnej synchronizacji.

### Dostawa

- `deliveryMethodId`
  - ID metody dostawy z Allegro.
- `deliveryMethodName`
  - Nazwa metody dostawy.
- `deliveryFirstName`, `deliveryLastName`
  - Dane odbiorcy.
- `deliveryStreet`, `deliveryCity`, `deliveryZipCode`, `deliveryCountryCode`
  - Adres dostawy.
- `deliveryPhone`
  - Telefon dostawy.

### Punkt odbioru

- `pickupPointId`
  - ID paczkomatu / punktu odbioru.
- `pickupPointName`
  - Nazwa punktu.

### Koszt dostawy

- `deliveryCost`
  - Koszt dostawy.
- `deliveryCurrency`
  - Waluta dostawy.
- `deliverySmart`
  - Czy Allegro Smart.

### Kupujący

- `buyerId`, `buyerLogin`, `buyerEmail`, `buyerFirstName`, `buyerLastName`, `buyerCompanyName`, `buyerPhone`, `buyerGuest`.

### Inne

- `messageToSeller`
  - Wiadomość kupującego.
- `paymentId`, `paymentType`, `paymentProvider`, `paymentFinishedAt`, `paymentAmount`, `paymentCurrency`.
- `invoiceRequired`
  - Czy wymagana faktura.
- `externalRevision`
  - Revision Allegro checkoutForm, używany przy zmianie fulfillment status.
- `marketplaceSiteId`
  - Np. `allegro-pl`.
- `rawData Json?`
  - Surowe dane z API.

### Relacje

- `items OrderItem[]`
- `shipments Shipment[]`

### Unikalność

- `@@unique([marketplaceAccountId, externalOrderId])`
  - Jedno konto marketplace nie może mieć dwa razy tego samego zamówienia.

---

## 1.16. Model `OrderItem`

Tabela: `order_items`.

- `id`
  - Lokalne ID pozycji.
- `orderId`, `order`
  - Zamówienie, do którego należy pozycja.
- `externalLineItemId`
  - ID pozycji z platformy.
- `externalOfferId`
  - ID oferty Allegro.
- `productName`
  - Nazwa produktu.
- `productImageUrl`
  - Obrazek produktu.
- `quantity`
  - Ilość.
- `price`
  - Cena po rabacie.
- `originalPrice`
  - Cena przed rabatem.
- `currency`
  - Waluta.
- `boughtAt`
  - Kiedy pozycja została kupiona.
- `rawData`
  - Surowe dane pozycji.
- `createdAt`, `updatedAt`
  - Daty.

---

## 1.17. Model `Session`

Tabela: `sessions`.

- `id`
  - ID sesji.
- `userId`, `user`
  - Użytkownik sesji.
- `tokenHash String @unique`
  - Hash tokena sesji. Czysty token nie jest zapisywany.
- `expiresAt`
  - Data wygaśnięcia.
- `revokedAt`
  - Data unieważnienia.
- `userAgent`
  - User agent przeglądarki.
- `ipAddress`
  - Adres IP.
- `createdAt`, `updatedAt`.

---

## 1.18. Model `ShippingAccount`

Tabela: `shipping_accounts`.

- `id`
  - ID konta kurierskiego.
- `userId`, `user`
  - Właściciel konta.
- `provider`
  - Provider, obecnie `INPOST_SHIPX`.
- `accountName`
  - Nazwa widoczna w panelu.
- `organizationId`
  - ID organizacji InPost.
- `apiToken`
  - Token ShipX. Nie wolno go zwracać na frontend.
- `organizationName`, `organizationEmail`
  - Dane organizacji pobrane z InPost.
- `status`
  - Status konta.
- `errorMessage`
  - Ostatni błąd.
- `createdAt`, `updatedAt`, `deletedAt`.
- `shipments`
  - Przesyłki przypisane do konta.

### Unikalność

- `@@unique([provider, organizationId])`
  - Jedno konto ShipX nie może być podpięte kilka razy do różnych userów.

---

## 1.19. Model `Shipment`

Tabela: `shipments`.

- `id`
  - Lokalne ID przesyłki.
- `userId`, `user`
  - Właściciel.
- `orderId`, `order`
  - Zamówienie, którego dotyczy przesyłka.
- `shippingAccountId`, `shippingAccount`
  - Konto kurierskie, np. ShipX.
- `provider`
  - Provider przesyłki.
- `status`
  - Status lokalny przesyłki.
- `parcelSize`
  - Gabaryt A/B/C/CUSTOM.
- `weightKg`
  - Waga.
- `lengthCm`, `widthCm`, `heightCm`
  - Wymiary.
- `externalCommandId`
  - ID komendy Allegro Shipment Management.
- `externalShipmentId`
  - ID przesyłki u operatora.
- `trackingNumber`
  - Numer trackingowy.
- `labelFormat`
  - Format etykiety.
- `labelPath`
  - Ścieżka pliku, jeśli kiedyś etykiety będą zapisywane lokalnie.
- `errorMessage`
  - Błąd przesyłki.
- `rawRequest`
  - Payload wysłany do operatora.
- `rawResponse`
  - Odpowiedź operatora.
- `createdAt`, `updatedAt`, `deletedAt`.

---

# 2. `backend/src/auth/dto/login.dto.ts`

## Rola pliku

DTO danych wejściowych dla logowania.

## Klasa `LoginDto`

```ts
export class LoginDto {
  email: string;
  password: string;
}
```

### Pole `email`

- Email użytkownika.
- Używany jako login.

### Pole `password`

- Hasło wprowadzone przez użytkownika.
- Backend porównuje je z `passwordHash` przez bcrypt.

---

# 3. `backend/src/auth/dto/register.dto.ts`

## Rola pliku

DTO danych wejściowych dla rejestracji.

## Klasa `RegisterDto`

```ts
export class RegisterDto {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  taxId?: string;
  phone?: string;
}
```

### Pola

- `email`
  - Email nowego użytkownika.
- `password`
  - Hasło do zahashowania.
- `firstName`
  - Opcjonalne imię.
- `lastName`
  - Opcjonalne nazwisko.
- `companyName`
  - Opcjonalna firma.
- `taxId`
  - Opcjonalny NIP.
- `phone`
  - Opcjonalny telefon.

---

# 4. `backend/src/auth/auth.controller.ts`

## Rola pliku

Controller endpointów auth:

```txt
POST /auth/register
POST /auth/login
GET /auth/me
POST /auth/logout
```

## Stała `SESSION_COOKIE_NAME`

```ts
const SESSION_COOKIE_NAME = 'session';
```

- Nazwa cookie, w którym frontend trzyma token sesji.
- Cookie jest HttpOnly, więc JS frontendu nie widzi tokena bezpośrednio.

## Klasa `AuthController`

Controller z dekoratorem:

```ts
@Controller('auth')
```

Wszystkie endpointy są pod `/auth`.

## Konstruktor

```ts
constructor(private readonly authService: AuthService) {}
```

- Wstrzykuje `AuthService`.
- `private readonly authService`
  - Prywatna właściwość klasy.
  - Używana do rejestracji, logowania, logoutu i pobierania usera.

## Funkcja `register`

```ts
@Post('register')
async register(@Body() dto, @Req() req, @Res({ passthrough: true }) res)
```

Endpoint:

```txt
POST /auth/register
```

### Zmienne lokalne

- `dto`
  - Body requestu, typ `RegisterDto`.
- `req`
  - Request Express.
- `res`
  - Response Express.
- `result`
  - Wynik `authService.register`, zawiera `sessionToken` i `user`.

### Co robi

1. Wywołuje `authService.register`.
2. Przekazuje user agent i IP.
3. Ustawia cookie sesji przez `setSessionCookie`.
4. Zwraca tylko `user`, bez tokena sesji.

## Funkcja `login`

Endpoint:

```txt
POST /auth/login
```

### Zmienne lokalne

- `dto`
  - Body, typ `LoginDto`.
- `req`
  - Request.
- `res`
  - Response.
- `result`
  - Wynik logowania.

### Co robi

1. Wywołuje `authService.login`.
2. Jeśli login poprawny, ustawia cookie sesji.
3. Zwraca `user`.

## Funkcja `me`

Endpoint:

```txt
GET /auth/me
```

### Zmienne lokalne

- `sessionToken`
  - Token z cookie `session`.
- `user`
  - Aktualny użytkownik albo `null`.

### Co robi

1. Czyta cookie.
2. Pyta `authService.getCurrentUser`.
3. Zwraca `{ user }`.

## Funkcja `logout`

Endpoint:

```txt
POST /auth/logout
```

### Zmienne lokalne

- `sessionToken`
  - Token sesji z cookie.

### Co robi

1. Unieważnia sesję w bazie przez `authService.logout`.
2. Czyści cookie `session`.
3. Zwraca `{ success: true }`.

## Prywatna funkcja `setSessionCookie`

```ts
private setSessionCookie(res: Response, sessionToken: string)
```

### Parametry

- `res`
  - Response Express.
- `sessionToken`
  - Czysty token sesji, wysyłany tylko w cookie.

### Co ustawia

- `httpOnly: true`
  - JS nie może czytać cookie.
- `secure: process.env.NODE_ENV === 'production'`
  - Secure tylko na produkcji.
- `sameSite: 'lax'`
  - Ochrona CSRF w podstawowym zakresie.
- `maxAge: 30 dni`
  - Sesja ważna 30 dni.
- `path: '/'`
  - Cookie działa dla całej aplikacji.

---

# 5. `backend/src/auth/auth.guard.ts`

## Rola pliku

Guard zabezpieczający endpointy wymagające logowania.

## Stała `SESSION_COOKIE_NAME`

```ts
const SESSION_COOKIE_NAME = 'session';
```

Nazwa cookie sesji.

## Klasa `AuthGuard`

Implementuje `CanActivate`.

## Konstruktor

```ts
constructor(private readonly authService: AuthService) {}
```

Wstrzykuje `AuthService`.

## Funkcja `canActivate`

```ts
async canActivate(context: ExecutionContext): Promise<boolean>
```

### Zmienne lokalne

- `req`
  - Request Express pobrany z contextu.
- `sessionToken`
  - Token sesji z cookie.
- `user`
  - Użytkownik zwrócony przez `authService.getCurrentUser`.

### Co robi

1. Pobiera request.
2. Czyta cookie `session`.
3. Sprawdza użytkownika.
4. Jeśli nie ma usera, rzuca `UnauthorizedException`.
5. Jeśli user istnieje, dopisuje go do requestu:

```ts
(req as Request & { user: typeof user }).user = user;
```

6. Zwraca `true`.

---

# 6. `backend/src/auth/auth.module.ts`

## Rola pliku

Moduł NestJS dla auth.

## Klasa `AuthModule`

Po zmianach:

- `controllers: [AuthController]`
  - Rejestruje kontroler auth.
- `providers: [AuthService, AuthGuard]`
  - Rejestruje serwis i guard.
- `exports: [AuthService, AuthGuard]`
  - Pozwala innym modułom używać auth serwisu i guarda.

Uwaga:

W zmianach usunięto import `UsersModule`, bo `AuthService` używa bezpośrednio `PrismaService`. To zapobiega zapętleniu modułów, gdy `UsersModule` importuje `AuthModule`.

---

# 7. `backend/src/auth/auth.service.ts`

## Rola pliku

Obsługuje rejestrację, logowanie, sesje, logout i zwracanie bezpiecznego usera.

## Klasa `AuthService`

Oznaczona `@Injectable()`.

## Konstruktor

```ts
constructor(private readonly prisma: PrismaService) {}
```

- `prisma`
  - Dostęp do bazy danych.

## Funkcja `register`

```ts
async register(dto: RegisterDto, userAgent?: string, ipAddress?: string)
```

### Parametry

- `dto`
  - Dane rejestracji.
- `userAgent`
  - Przeglądarka / aplikacja użytkownika.
- `ipAddress`
  - IP użytkownika.

### Zmienne lokalne

- `email`
  - Znormalizowany email: lowercase + trim.
- `existingUser`
  - User z takim emailem, jeśli już istnieje.
- `passwordHash`
  - Hash hasła bcrypt.
- `user`
  - Nowo utworzony user.
- `sessionToken`
  - Nowy token sesji.

### Co robi

1. Normalizuje email.
2. Sprawdza, czy user istnieje.
3. Jeśli istnieje, rzuca `ConflictException`.
4. Hashuje hasło.
5. Tworzy usera.
6. Tworzy sesję.
7. Zwraca token sesji i bezpiecznego usera.

## Funkcja `login`

```ts
async login(dto: LoginDto, userAgent?: string, ipAddress?: string)
```

### Zmienne lokalne

- `email`
  - Znormalizowany email.
- `user`
  - User znaleziony po emailu.
- `passwordValid`
  - Wynik bcrypt.compare.
- `sessionToken`
  - Nowa sesja.

### Co robi

1. Normalizuje email.
2. Szuka usera.
3. Sprawdza, czy user istnieje i nie jest usunięty.
4. Porównuje hasło.
5. Tworzy sesję.
6. Zwraca token sesji i usera.

## Funkcja `logout`

```ts
async logout(sessionToken?: string)
```

### Zmienne lokalne

- `tokenHash`
  - SHA-256 z tokena sesji.

### Co robi

1. Jeśli nie ma tokena, zwraca sukces.
2. Hashuje token.
3. Ustawia `revokedAt` dla aktywnej sesji.
4. Zwraca `{ success: true }`.

## Funkcja `getCurrentUser`

```ts
async getCurrentUser(sessionToken?: string)
```

### Zmienne lokalne

- `tokenHash`
  - Hash tokena.
- `session`
  - Sesja z relacją `user`.

### Co robi

1. Jeśli nie ma tokena, zwraca `null`.
2. Szuka sesji po hash tokena.
3. Sprawdza, czy sesja istnieje.
4. Sprawdza, czy nie jest revoked.
5. Sprawdza, czy nie wygasła.
6. Sprawdza, czy user nie jest deleted.
7. Zwraca `safeUser`.

## Prywatna funkcja `createSession`

```ts
private async createSession(userId: number, userAgent?: string, ipAddress?: string)
```

### Zmienne lokalne

- `sessionToken`
  - Losowy token 32 bajty jako hex.
- `tokenHash`
  - Hash tokena.
- `expiresAt`
  - Data wygaśnięcia ustawiona na +30 dni.

### Co robi

1. Generuje token.
2. Hashuje token.
3. Ustawia expiresAt.
4. Zapisuje sesję w bazie.
5. Zwraca czysty token, który idzie tylko do cookie.

## Prywatna funkcja `hashToken`

```ts
private hashToken(token: string)
```

Zwraca:

```ts
sha256(token).hex
```

## Prywatna funkcja `safeUser`

Zwraca usera bez `passwordHash`.

Po zmianach zwraca także pola drukarki:

- `labelPrinterName`,
- `labelPrinterFormat`,
- `labelPrinterDpi`,
- `labelPrinterWidthMm`,
- `labelPrinterHeightMm`.

Domyślne wartości:

- format: `zpl`,
- DPI: `203`,
- szerokość: `100`,
- wysokość: `150`.

---

# 8. `backend/src/orders/orders.controller.ts`

## Rola pliku

Controller endpointów zamówień.

## Klasa `OrdersController`

Dekoratory:

```ts
@Controller('orders')
@UseGuards(AuthGuard)
```

Wszystkie endpointy wymagają logowania.

## Konstruktor

```ts
constructor(private readonly ordersService: OrdersService) {}
```

Wstrzykuje `OrdersService`.

## Funkcja `getOrders`

Endpoint:

```txt
GET /orders
```

### Zmienne lokalne

- `user`
  - User z requestu, dopisany przez `AuthGuard`.

### Co robi

Wywołuje:

```ts
ordersService.getOrdersForUser(user.id, query)
```

## Funkcja `getSegments`

Endpoint:

```txt
GET /orders/segments
```

### Zmienne lokalne

- `user`
  - Zalogowany user.

### Co robi

Wywołuje:

```ts
ordersService.getOrderSegmentsForUser(user.id, query)
```

## Funkcja `getOrderById`

Endpoint:

```txt
GET /orders/:id
```

### Zmienne lokalne

- `user`
  - Zalogowany user.
- `id`
  - Param z URL.

### Co robi

Konwertuje `id` na number i pobiera szczegóły zamówienia użytkownika.

---

# 9. `backend/src/orders/orders.module.ts`

## Rola pliku

Moduł zamówień.

## Klasa `OrdersModule`

- `imports: [AuthModule, PrismaModule]`
  - Używa auth i bazy.
- `controllers: [OrdersController]`
  - Rejestruje controller.
- `providers: [OrdersService]`
  - Rejestruje serwis.
- `exports: [OrdersService]`
  - Pozwala innym modułom używać orders service.

---

# 10. `backend/src/prisma/prisma.module.ts`

## Rola pliku

Globalny moduł Prisma.

## Dekorator `@Global()`

Oznacza, że `PrismaService` jest dostępny globalnie po zaimportowaniu modułu w aplikacji.

## Klasa `PrismaModule`

- `providers: [PrismaService]`
  - Rejestruje PrismaService.
- `exports: [PrismaService]`
  - Eksportuje go dla innych modułów.

---

# 11. `backend/src/prisma/prisma.service.ts`

## Rola pliku

Łączy aplikację z PostgreSQL przez Prisma Client + adapter PostgreSQL.

## Klasa `PrismaService`

Rozszerza:

```ts
PrismaClient
```

Implementuje:

- `OnModuleInit`,
- `OnModuleDestroy`.

## Konstruktor

```ts
constructor()
```

### Zmienne lokalne

- `connectionString`
  - Wartość `process.env.DATABASE_URL`.
- `adapter`
  - Instancja `PrismaPg`.

### Co robi

1. Pobiera `DATABASE_URL`.
2. Jeśli brak, rzuca `Error`.
3. Tworzy adapter PostgreSQL.
4. Wywołuje `super({ adapter })`.

## Funkcja `onModuleInit`

```ts
async onModuleInit()
```

Po starcie modułu wywołuje:

```ts
this.$connect()
```

## Funkcja `onModuleDestroy`

```ts
async onModuleDestroy()
```

Przy zamykaniu modułu wywołuje:

```ts
this.$disconnect()
```

---

# 12. `backend/src/shipments/shipments.controller.ts`

## Rola pliku

Controller endpointów przesyłek.

## Klasa `ShipmentsController`

Dekoratory:

```ts
@Controller('shipments')
@UseGuards(AuthGuard)
```

Wszystkie endpointy wymagają logowania.

## Konstruktor

```ts
constructor(private readonly shipmentsService: ShipmentsService) {}
```

Wstrzykuje `ShipmentsService`.

## Funkcja `getShipmentOptions`

Endpoint:

```txt
GET /shipments/orders/:orderId/options
```

### Zmienne lokalne

- `user`
  - User z requestu.
- `orderId`
  - Param URL.

### Co robi

Wywołuje:

```ts
shipmentsService.getShipmentOptionsForOrder(user.id, Number(orderId))
```

## Funkcja `createShipment`

Endpoint:

```txt
POST /shipments/orders/:orderId/create
```

### Body

- `mode`
- `shippingAccountId`
- `parcelSize`
- `weightKg`
- `lengthCm`
- `widthCm`
- `heightCm`
- `labelFormat`
- `deliveryMethodId`
- `credentialsId`
- `description`
- `reference`
- `insuranceAmount`
- `codAmount`
- `returnLabel`

### Co robi

Wywołuje:

```ts
shipmentsService.createShipmentForOrder(user.id, Number(orderId), body)
```

## Funkcja `prepareInpostShipment`

Endpoint:

```txt
POST /shipments/orders/:orderId/prepare-inpost
```

Stary preview endpoint. Buduje payload, ale nie tworzy przesyłki.

## Funkcja `createInpostShipment`

Endpoint:

```txt
POST /shipments/orders/:orderId/create-inpost
```

Stary endpoint realnego InPost. Nowe UI używa wspólnego `/create`.

## Funkcja `getInpostShipmentLabel`

Endpoint:

```txt
GET /shipments/:shipmentId/label?format=pdf-a6
GET /shipments/:shipmentId/label?format=zpl
```

### Zmienne lokalne

- `user`
  - Zalogowany user.
- `label`
  - Wynik `getInpostShipmentLabelForUser`, zawiera buffer, contentType, filename.

### Co robi

1. Pobiera etykietę.
2. Ustawia `Content-Type`.
3. Ustawia `Content-Disposition`.
4. Wysyła buffer.

---

# 13. `backend/src/shipments/shipments.module.ts`

## Rola pliku

Moduł przesyłek.

## Klasa `ShipmentsModule`

Po zmianach importuje:

- `AuthModule`,
- `PrismaModule`,
- `InpostModule`,
- `AllegroModule`.

Rejestruje:

- `ShipmentsController`,
- `ShipmentsService`.

Eksportuje:

- `ShipmentsService`.

Dzięki `AllegroModule` w `ShipmentsService` można wywołać `AllegroShipmentsService.markOrderReadyForShipment`.

---

# 14. `backend/src/shipments/shipments.service.ts`

Ten plik został szczegółowo opisany w sekcji 5. Dla kompletności poniżej lista wszystkich głównych typów, stałych i funkcji z pliku:

## Typy

- `PrepareInpostShipmentBody`
- `CreateShipmentBody`
- `InpostParcelSize`
- `ParcelDimensions`
- `ShipmentOptionsTabKey`

## Stałe

- `INPOST_PARCEL_LIMITS`

## Funkcje publiczne / async

- `getShipmentOptionsForOrder`
- `createShipmentForOrder`
- `prepareInpostShipmentForOrder`
- `createInpostShipmentForOrder`
- `getInpostShipmentLabelForUser`

## Funkcje prywatne

- `getInpostShippingAccount`
- `isInpostDeliveryMethod`
- `isLockerDelivery`
- `getShipxServiceForOrder`
- `buildReceiverName`
- `normalizePhone`
- `normalizeParcelSize`
- `validateInpostParcelInput`
- `buildShipxParcel`
- `getShipxTemplate`
- `getFullInpostShippingAccount`
- `extractExternalShipmentId`
- `extractTrackingNumber`
- `getLabelContentType`
- `getLabelExtension`
- `toJsonSafe`
- `buildShipmentTabs`
- `detectDefaultShipmentTab`
- `getDefaultInpostParcelSize`
- `buildContentsDescription`
- `toNumberOrNull`
- `extractErrorMessage`

Każda z tych funkcji została opisana w sekcji 5.

---

# 15. `backend/src/users/users.controller.ts`

## Rola pliku

Controller endpointów użytkownika, obecnie używany do ustawień drukarki etykiet.

## Klasa `UsersController`

Dekoratory:

```ts
@Controller('users')
@UseGuards(AuthGuard)
```

Wszystkie endpointy wymagają logowania.

## Konstruktor

```ts
constructor(private readonly usersService: UsersService) {}
```

Wstrzykuje `UsersService`.

## Funkcja `getMyPrinter`

Endpoint:

```txt
GET /users/me/printer
```

### Zmienne lokalne

- `user`
  - User z requestu.

### Co robi

Wywołuje:

```ts
usersService.getPrinterSettings(user.id)
```

## Funkcja `updateMyPrinter`

Endpoint:

```txt
PATCH /users/me/printer
```

### Body

- `labelPrinterName`
- `labelPrinterFormat`
- `labelPrinterDpi`
- `labelPrinterWidthMm`
- `labelPrinterHeightMm`

### Co robi

Wywołuje:

```ts
usersService.updatePrinterSettings(user.id, body)
```

---

# 16. `backend/src/users/users.service.ts`

## Rola pliku

Serwis użytkownika. Obsługuje szukanie usera i ustawienia drukarki etykiet.

## Typ `UpdatePrinterSettingsBody`

```ts
type UpdatePrinterSettingsBody = {
  labelPrinterName?: string | null;
  labelPrinterFormat?: string | null;
  labelPrinterDpi?: number | string | null;
  labelPrinterWidthMm?: number | string | null;
  labelPrinterHeightMm?: number | string | null;
};
```

Opis:

Body dla endpointu `PATCH /users/me/printer`.

## Konstruktor

```ts
constructor(private readonly prisma: PrismaService) {}
```

## Funkcja `findByEmail`

```ts
findByEmail(email: string)
```

Szuka użytkownika po emailu. Email jest normalizowany do lowercase.

## Funkcja `findById`

```ts
findById(id: number)
```

Szuka użytkownika po ID i zwraca bezpieczne pola, bez `passwordHash`.

Po zmianach zwraca też ustawienia drukarki.

## Funkcja `getPrinterSettings`

```ts
async getPrinterSettings(userId: number)
```

### Zmienne lokalne

- `user`
  - Użytkownik z ustawieniami drukarki.

### Co robi

1. Szuka usera po ID.
2. Jeśli nie ma, rzuca `NotFoundException`.
3. Zwraca:

```ts
{
  ok: true,
  printer: {...}
}
```

## Funkcja `updatePrinterSettings`

```ts
async updatePrinterSettings(userId: number, body: UpdatePrinterSettingsBody)
```

### Zmienne lokalne

- `labelPrinterName`
  - Znormalizowana nazwa drukarki lub null.
- `labelPrinterFormat`
  - Zweryfikowany format.
- `labelPrinterDpi`
  - Zweryfikowane DPI.
- `labelPrinterWidthMm`
  - Zweryfikowana szerokość.
- `labelPrinterHeightMm`
  - Zweryfikowana wysokość.
- `updatedUser`
  - User po aktualizacji.

### Co robi

1. Normalizuje i waliduje pola.
2. Aktualizuje usera w bazie.
3. Jeśli nazwa drukarki pusta, traktuje to jako usunięcie drukarki.
4. Zwraca `ok`, `message`, `printer`.

## Funkcja `normalizeNullableString`

```ts
private normalizeNullableString(value: unknown)
```

Opis:

- Jeśli value jest null/undefined, zwraca null.
- Jeśli po trim string jest pusty, zwraca null.
- W innym przypadku zwraca string.

## Funkcja `normalizePrinterFormat`

```ts
private normalizePrinterFormat(value: unknown)
```

Dozwolone formaty:

- `zpl`,
- `pdf-a6`,
- `pdf-a4`,
- `epl`.

Jeśli format niepoprawny, rzuca `BadRequestException`.

## Funkcja `normalizePositiveInt`

```ts
private normalizePositiveInt(value: unknown, fallback: number, fieldName: string)
```

Opis:

Waliduje liczbę całkowitą dodatnią.

- Jeśli wartość pusta, zwraca fallback.
- Jeśli nie jest dodatnią liczbą całkowitą, rzuca `BadRequestException`.

---

# 17. `backend/src/users/users.module.ts`

## Rola pliku

Moduł użytkowników.

## Klasa `UsersModule`

Po zmianach:

- `imports: [AuthModule]`
  - Potrzebne, bo `UsersController` używa `AuthGuard`.
- `controllers: [UsersController]`
  - Rejestruje controller users.
- `providers: [UsersService]`
  - Rejestruje serwis.
- `exports: [UsersService]`
  - Pozwala używać UsersService w innych modułach.

---

# 18. `backend/src/app.controller.ts`

## Rola pliku

Domyślny controller główny aplikacji.

## Klasa `AppController`

Dekorator:

```ts
@Controller()
```

Bez prefixu route.

## Konstruktor

```ts
constructor(private readonly appService: AppService) {}
```

Wstrzykuje `AppService`.

## Funkcja `getHello`

Endpoint:

```txt
GET /
```

Zwraca:

```ts
appService.getHello()
```

Domyślnie `Hello World!`.

---

# 19. `backend/src/app.service.ts`

## Rola pliku

Prosty serwis startowy NestJS.

## Klasa `AppService`

## Funkcja `getHello`

```ts
getHello(): string {
  return 'Hello World!';
}
```

Zwraca prosty tekst dla endpointu `/`.

---

# 20. `backend/src/app.module.ts`

## Rola pliku

Główny moduł aplikacji NestJS.

## Klasa `AppModule`

W `imports` znajdują się moduły:

- `OrdersModule`
  - Obsługa zamówień i dashboardu.
- `InpostModule`
  - Integracja z InPost ShipX.
- `ShipmentsModule`
  - Nadawanie paczek i etykiety.
- `ConfigModule.forRoot(...)`
  - Ładowanie `.env` globalnie.
- `AllegroModule`
  - Integracja Allegro.
- `PrismaModule`
  - Dostęp do bazy.
- `UsersModule`
  - Użytkownicy i drukarka.
- `AuthModule`
  - Logowanie i sesje.

## ConfigModule

```ts
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: '.env',
})
```

- `isGlobal: true`
  - Konfiguracja dostępna globalnie.
- `envFilePath: '.env'`
  - Ładuje zmienne z `.env`.

## Controllers

- `AppController`

## Providers

W pierwotnym pliku były też providery Allegro bezpośrednio w `AppModule`. Docelowo logika jest też w `AllegroModule`. W praktyce główne użycie powinno iść przez moduły, a nie dublowanie providerów.

---

# 21. `backend/src/main.ts`

## Rola pliku

Punkt startowy aplikacji NestJS.

## Funkcja `bootstrap`

```ts
async function bootstrap()
```

### Zmienne lokalne

- `app`
  - Instancja aplikacji NestJS.

### Co robi

1. Tworzy aplikację:

```ts
const app = await NestFactory.create(AppModule);
```

2. Dodaje cookie parser:

```ts
app.use(cookieParser());
```

3. Włącza CORS:

```ts
app.enableCors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
});
```

### Zmienne / ustawienia CORS

- `origin`
  - Frontend lokalnie albo z `.env`.
- `credentials: true`
  - Pozwala wysyłać cookie `session` między frontendem i backendem.

4. Uruchamia serwer:

```ts
await app.listen(process.env.PORT ?? 3000);
```

- Jeśli `PORT` jest w `.env`, używa go.
- Jeśli nie, startuje na `3000`.

5. Na końcu wywołuje:

```ts
bootstrap();
```

---

# 22. Najważniejsze zależności między plikami

## Auth

- `auth.controller.ts` używa `AuthService`.
- `auth.guard.ts` używa `AuthService`.
- `AuthService` używa `PrismaService`.
- `AuthGuard` dopisuje `user` do requestu.

## Orders

- `orders.controller.ts` używa `OrdersService`.
- `OrdersService` używa `PrismaService`.
- Dashboard frontendu korzysta z `/orders/segments`.

## Shipments

- `shipments.controller.ts` używa `ShipmentsService`.
- `ShipmentsService` używa:
  - `PrismaService`,
  - `InpostShipxService`,
  - `AllegroShipmentsService`.
- `ShipmentsService` tworzy przesyłki i pobiera etykiety.

## Users

- `users.controller.ts` używa `UsersService`.
- `UsersService` używa `PrismaService`.
- Frontend `/account` zapisuje drukarkę przez `/users/me/printer`.

## Prisma

- `PrismaModule` udostępnia `PrismaService`.
- `PrismaService` łączy się z PostgreSQL.

---

# 23. Najważniejsze endpointy po zmianach

## Auth

```txt
POST /auth/register
POST /auth/login
GET /auth/me
POST /auth/logout
```

## Users / drukarka

```txt
GET /users/me/printer
PATCH /users/me/printer
```

## Orders

```txt
GET /orders
GET /orders/segments
GET /orders/:id
```

## Shipments

```txt
GET /shipments/orders/:orderId/options
POST /shipments/orders/:orderId/create
POST /shipments/orders/:orderId/prepare-inpost
POST /shipments/orders/:orderId/create-inpost
GET /shipments/:shipmentId/label?format=pdf-a6
GET /shipments/:shipmentId/label?format=zpl
```

---

# 24. Finalna logika biznesowa

1. User loguje się i dostaje cookie `session`.
2. Dashboard pobiera segmenty zamówień.
3. Sync Allegro pobiera tylko zamówienia:
   - `READY_FOR_PROCESSING + NEW/PROCESSING`,
   - `BOUGHT`.
4. `FILLED_IN` nie jest pobierane jako nieopłacone.
5. `READY_FOR_SHIPMENT`, `SENT`, `PICKED_UP`, `READY_FOR_PICKUP` trafiają do `Wysłane`.
6. Użytkownik otwiera zamówienie.
7. Frontend pobiera opcje przesyłki.
8. Backend dobiera domyślną zakładkę przesyłki.
9. User nadaje paczkę.
10. Backend tworzy przesyłkę.
11. Backend próbuje ustawić Allegro status `READY_FOR_SHIPMENT`.
12. Po sukcesie zamówienie powinno trafić do `Wysłane`.
13. User może pobrać PDF A6, ZPL albo kliknąć `Drukuj etykietę`.
14. `Drukuj etykietę` używa drukarki zapisanej w profilu i QZ Tray.

---

# 25. Notatki techniczne na przyszłość

## 25.1. Drukowanie

- Dla Zebra GC420d najlepszy format to `ZPL`.
- PDF A6 zostaje jako backup / podgląd.
- Pełne drukowanie bez okien wymaga QZ Tray i poprawnej konfiguracji certyfikatu.

## 25.2. Allegro labels

Aktualne przyciski etykiet działają dla InPost ShipX. Allegro Shipment Management wymaga osobnego flow:

```txt
create command
check command status
get shipment details
get label
```

## 25.3. Wielopaczkowość

UI ma `+ Kolejna podpaczka`, ale backend aktualnie używa tylko pierwszej paczki. Wielopaczkowość trzeba dopiąć osobno.

## 25.4. Status po nadaniu

Po udanym nadaniu powinien pojawić się w response:

```json
"fulfillmentUpdate": {
  "ok": true,
  "status": "READY_FOR_SHIPMENT"
}
```

Jeśli `ok` jest false, paczka mogła zostać utworzona, ale Allegro odrzuciło zmianę statusu.

# Pełna dokumentacja folderu `backend/src/integrations`

Ten dokument opisuje **każdy plik widoczny w folderze `backend/src/integrations`** ze screena:

```txt
backend/src/integrations/
├── allegro/
│   ├── services/
│   │   ├── allegro-api/
│   │   │   └── allegro-api.service.ts
│   │   ├── allegro-auth/
│   │   │   └── allegro-auth.service.ts
│   │   ├── allegro-orders/
│   │   │   └── allegro-orders.service.ts
│   │   └── allegro-shipments/
│   │       └── allegro-shipments.service.ts
│   ├── allegro.controller.ts
│   └── allegro.module.ts
├── erli/
└── inpost/
    ├── services/
    │   └── inpost-shipx/
    │       └── inpost-shipx.service.ts
    ├── inpost.controller.ts
    └── inpost.module.ts
```

Opis uwzględnia finalną logikę po zmianach z rozmowy: przesyłki, Wysyłam z Allegro, InPost ShipX, drukowanie etykiet, zmiany statusów i synchronizację.

---

# 1. `backend/src/integrations/allegro/allegro.module.ts`

## Rola pliku

Ten plik definiuje moduł NestJS dla integracji Allegro. Moduł zbiera kontroler i serwisy Allegro w jedną całość, żeby reszta aplikacji mogła korzystać z integracji Allegro.

## Importy

### `Module`

Import z `@nestjs/common`. Służy do oznaczenia klasy jako modułu NestJS.

### `AuthModule`

Moduł autoryzacji. Potrzebny, bo endpointy Allegro są chronione przez `AuthGuard` i muszą znać aktualnego użytkownika.

### `PrismaModule`

Moduł bazy danych. Daje dostęp do `PrismaService`.

### `AllegroController`

Kontroler HTTP dla ścieżek `/integrations/allegro/...`.

### `AllegroAuthService`

Serwis OAuth Allegro: buduje link logowania, wymienia `code` na tokeny, odświeża token.

### `AllegroApiService`

Pusty serwis pomocniczy. Obecnie nie robi nic, ale może być miejscem na wspólne metody API Allegro.

### `AllegroOrdersService`

Serwis synchronizacji zamówień Allegro.

### `AllegroShipmentsService`

Serwis obsługi Wysyłam z Allegro i zmian statusów fulfillment.

## Dekorator `@Module`

```ts
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AllegroController],
  providers: [
    AllegroAuthService,
    AllegroApiService,
    AllegroOrdersService,
    AllegroShipmentsService,
  ],
  exports: [AllegroShipmentsService],
})
```

### `imports`

- `AuthModule` — daje auth guard i auth service.
- `PrismaModule` — daje dostęp do bazy.

### `controllers`

- `AllegroController` — wystawia endpointy Allegro.

### `providers`

- `AllegroAuthService`
- `AllegroApiService`
- `AllegroOrdersService`
- `AllegroShipmentsService`

To serwisy, które NestJS może wstrzykiwać przez constructor.

### `exports`

Finalnie powinno być:

```ts
exports: [AllegroShipmentsService]
```

Po co:

`ShipmentsService` w module `shipments` musi używać `AllegroShipmentsService`, żeby po nadaniu InPost zmienić status zamówienia Allegro na `READY_FOR_SHIPMENT`.

## Klasa `AllegroModule`

```ts
export class AllegroModule {}
```

Nie ma metod. To tylko definicja modułu.

## Zmienne `const` w tym pliku

Brak zwykłych `const`. Jedynym obiektem konfiguracyjnym jest obiekt przekazany do dekoratora `@Module`.

---

# 2. `backend/src/integrations/allegro/services/allegro-api/allegro-api.service.ts`

## Rola pliku

Pusty serwis techniczny dla Allegro.

Obecnie:

```ts
@Injectable()
export class AllegroApiService {}
```

## Importy

### `Injectable`

Import z `@nestjs/common`. Oznacza, że klasa może być providerem NestJS.

## Klasa `AllegroApiService`

Na ten moment nie ma żadnych metod, właściwości ani stałych.

## Po co istnieje

Może być użyta później do wspólnych helperów API Allegro, np.:

- wspólne nagłówki,
- retry requestów,
- obsługa rate limit,
- centralne logowanie błędów Allegro,
- wspólna metoda GET/POST do Allegro.

## Funkcje

Brak funkcji.

## Zmienne `const`

Brak.

---

# 3. `backend/src/integrations/allegro/services/allegro-auth/allegro-auth.service.ts`

## Rola pliku

Ten serwis obsługuje OAuth Allegro:

1. Tworzy URL do logowania Allegro.
2. Wymienia `code` z callbacku na `access_token` i `refresh_token`.
3. Odświeża access token.
4. Pobiera dane aktualnego użytkownika Allegro przez `/me`.

## Importy

### `Injectable`

Oznacza klasę jako provider NestJS.

### `axios`

Biblioteka HTTP używana do requestów do Allegro.

## Klasa `AllegroAuthService`

### Właściwość `allegroAuthUrl`

```ts
private readonly allegroAuthUrl = 'https://allegro.pl/auth/oauth/authorize';
```

Adres Allegro OAuth, gdzie użytkownik jest przekierowywany, żeby zalogować konto Allegro i zaakceptować dostęp aplikacji.

### Właściwość `allegroTokenUrl`

```ts
private readonly allegroTokenUrl = 'https://allegro.pl/auth/oauth/token';
```

Adres Allegro OAuth do wymiany `code` na tokeny oraz do odświeżania tokena.

---

## Funkcja `createAuthUrl(accountId: number): string`

### Rola

Buduje link OAuth do Allegro dla konkretnego lokalnego `MarketplaceAccount`.

### Parametry

- `accountId` — lokalne ID konta marketplace w bazie. Trafia do parametru OAuth `state`.

### Zmienne lokalne

#### `clientId`

```ts
const clientId = process.env.ALLEGRO_CLIENT_ID;
```

Client ID aplikacji Allegro z `.env`.

#### `appUrl`

```ts
const appUrl = process.env.APP_URL;
```

Publiczny adres backendu, używany do zbudowania callback URL.

#### `redirectUri`

```ts
const redirectUri = `${appUrl}/integrations/allegro/callback`;
```

Adres, na który Allegro wróci po autoryzacji.

#### `scopes`

Lista uprawnień OAuth Allegro połączona spacją.

Zakresy:

- `allegro:api:orders:read` — odczyt zamówień.
- `allegro:api:orders:write` — zmiana statusów fulfillment.
- `allegro:api:sale:offers:read` — odczyt ofert, m.in. do obrazków produktów.
- `allegro:api:shipments:read` — odczyt przesyłek.
- `allegro:api:shipments:write` — tworzenie przesyłek / komend.
- `allegro:api:profile:read` — odczyt profilu Allegro.
- `allegro:api:fulfillment:read` — odczyt fulfillment.
- `allegro:api:fulfillment:write` — zapis fulfillment, np. `READY_FOR_SHIPMENT`.

#### `params`

```ts
const params = new URLSearchParams();
```

Obiekt query string do URL OAuth.

Dodawane parametry:

- `response_type=code`
- `client_id`
- `redirect_uri`
- `scope`
- `state=accountId`
- `prompt=confirm`

### Zwraca

Pełny URL OAuth Allegro.

---

## Funkcja `exchangeCodeForTokens(code: string)`

### Rola

Po callbacku Allegro backend dostaje `code`. Ta funkcja wymienia go na tokeny.

### Parametry

- `code` — kod autoryzacyjny z Allegro.

### Zmienne lokalne

#### `clientId`

Client ID z `.env`.

#### `clientSecret`

Client Secret z `.env`.

#### `appUrl`

Adres aplikacji z `.env`.

#### `redirectUri`

Callback URL. Musi być identyczny jak przy `createAuthUrl`.

#### `basicAuth`

```ts
const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
```

Nagłówek Basic Auth wymagany przez OAuth token endpoint.

#### `body`

`URLSearchParams` z polami:

- `grant_type=authorization_code`
- `code`
- `redirect_uri`

#### `response`

Wynik `axios.post` do `allegroTokenUrl`.

### Zwraca

`response.data`, czyli tokeny Allegro:

- `access_token`
- `refresh_token`
- `token_type`
- `expires_in`

---

## Funkcja `refreshAccessToken(refreshToken: string)`

### Rola

Odświeża access token Allegro, gdy stary token wygasa.

### Parametry

- `refreshToken` — refresh token z bazy.

### Zmienne lokalne

#### `clientId`

Client ID z `.env`.

#### `clientSecret`

Client Secret z `.env`.

#### `basicAuth`

Basic Auth z `clientId:clientSecret` zakodowany base64.

#### `body`

`URLSearchParams` z polami:

- `grant_type=refresh_token`
- `refresh_token`

#### `response`

Odpowiedź Allegro z nowymi tokenami.

### Zwraca

`response.data`, czyli nowy access token i opcjonalnie nowy refresh token.

---

## Funkcja `getCurrentAllegroUser(accessToken: string)`

### Rola

Pobiera dane aktualnego konta Allegro przez endpoint:

```txt
GET https://api.allegro.pl/me
```

Używane po OAuth callback, żeby zapisać `externalAccountId` i nazwę konta Allegro.

### Parametry

- `accessToken` — access token Allegro.

### Zmienne lokalne

#### `response`

Odpowiedź z Allegro `/me`.

### Zwraca

Obiekt usera Allegro z polami m.in.:

- `id`
- `login`
- `email`
- `baseMarketplace`
- `company`
- `features`

---

# 4. `backend/src/integrations/allegro/allegro.controller.ts`

## Rola pliku

Kontroler HTTP dla integracji Allegro. Wszystkie endpointy są pod prefixem:

```txt
/integrations/allegro
```

Odpowiada za:

- start OAuth,
- callback OAuth,
- synchronizację zamówień,
- listę kont Allegro,
- usługi Wysyłam z Allegro,
- tworzenie przesyłek Allegro,
- status komend,
- szczegóły i etykiety Allegro.

## Wstrzykiwane serwisy w constructorze

### `allegroAuthService`

Obsługa OAuth Allegro.

### `allegroOrdersService`

Synchronizacja zamówień.

### `prisma`

Dostęp do bazy danych.

### `allegroShipmentsService`

Obsługa Wysyłam z Allegro.

---

## Funkcja `startAuth`

Endpoint:

```txt
GET /integrations/allegro/start
```

Chroniony przez `AuthGuard`.

### Rola

Startuje proces łączenia konta Allegro.

### Zmienne lokalne

#### `user`

Aktualnie zalogowany użytkownik z requestu.

#### `marketplaceAccount`

Najpierw szuka ostatniego nieaktywnego konta Allegro użytkownika ze statusem `DISCONNECTED` albo `ERROR`. Jeśli nie istnieje, tworzy nowe.

#### `authUrl`

URL OAuth wygenerowany przez `allegroAuthService.createAuthUrl(marketplaceAccount.id)`.

### Zwraca

Redirect 302 do Allegro OAuth.

---

## Funkcja `fetchOrdersTest`

Endpoint:

```txt
GET /integrations/allegro/orders/fetch-test/:marketplaceAccountId
```

### Rola

Testowo pobiera zamówienia z Allegro, ale ich nie zapisuje.

### Zmienne lokalne

- `user` — aktualny użytkownik.
- `parsedMarketplaceAccountId` — ID konta jako number.
- `data` — wynik `allegroOrdersService.fetchOrdersForAccount`.
- `checkoutForms` — lista zamówień z Allegro.

### Zwraca

Podsumowanie pobrania i pierwsze 5 zamówień.

---

## Funkcja `syncOrders`

Endpoint:

```txt
POST /integrations/allegro/orders/sync/:marketplaceAccountId
```

### Rola

Synchronizuje jedno konkretne konto Allegro.

### Zmienne lokalne

- `user`
- `parsedMarketplaceAccountId`
- `result` — wynik `syncOrdersForAccount`.

### Zwraca

Wynik synchronizacji.

---

## Funkcja `syncAllOrders`

Endpoint:

```txt
POST /integrations/allegro/orders/sync-all
```

### Rola

Synchronizuje wszystkie aktywne konta Allegro zalogowanego użytkownika.

### Zmienne lokalne

- `user`
- `result`

### Zwraca

Liczbę zsynchronizowanych kont i wyniki per konto.

---

## Funkcja `getAllegroDeliveryServices`

Endpoint:

```txt
GET /integrations/allegro/shipments/delivery-services/:marketplaceAccountId
```

### Rola

Pobiera usługi Wysyłam z Allegro dla konta Allegro.

### Zwraca

Lista delivery services Allegro.

---

## Funkcja `getAllegroServiceMatchForOrder`

Endpoint:

```txt
GET /integrations/allegro/shipments/orders/:orderId/service-match
```

### Rola

Sprawdza, jaka ścieżka nadania pasuje do zamówienia.

Możliwe wyniki:

- `INPOST_SHIPX`
- `ALLEGRO_SHIPMENT_MANAGEMENT`
- `UNKNOWN`

---

## Funkcja `prepareAllegroShipmentForOrder`

Endpoint:

```txt
POST /integrations/allegro/shipments/orders/:orderId/prepare
```

### Rola

Buduje payload do Wysyłam z Allegro, ale nie tworzy przesyłki.

### Body

- `weightKg`
- `lengthCm`
- `widthCm`
- `heightCm`
- `labelFormat`

---

## Funkcja `createAllegroShipmentCommand`

Endpoint:

```txt
POST /integrations/allegro/shipments/orders/:orderId/create-command
```

### Rola

Realnie tworzy komendę nadania w Wysyłam z Allegro.

### Zwraca

Lokalną przesyłkę i raw response Allegro.

---

## Funkcja `getAllegroShipmentCommand`

Endpoint:

```txt
GET /integrations/allegro/shipments/:shipmentId/command
```

### Rola

Sprawdza status komendy nadania Allegro.

Jeśli Allegro zwróci `externalShipmentId`, zapisuje go lokalnie.

---

## Funkcja `getAllegroShipmentDetails`

Endpoint:

```txt
GET /integrations/allegro/shipments/:shipmentId/details
```

### Rola

Pobiera szczegóły paczki Allegro po `externalShipmentId`.

---

## Funkcja `getAllegroShipmentLabel`

Endpoint:

```txt
GET /integrations/allegro/shipments/:shipmentId/label?pageSize=A4&cutLine=true
```

### Rola

Pobiera etykietę PDF z Wysyłam z Allegro.

### Zmienne lokalne

- `user`
- `label`

### Response

Zwraca PDF przez Express `res.send(label.buffer)`.

---

## Funkcja `getAllegroAccounts`

Endpoint:

```txt
GET /integrations/allegro/accounts
```

### Rola

Zwraca konta Allegro aktualnego użytkownika bez tokenów.

### Zmienne lokalne

- `user`
- `accounts`

### Zwraca

Lista kont z polami:

- `id`
- `marketplace`
- `status`
- `accountName`
- `externalAccountId`
- `tokenExpiresAt`
- `errorMessage`
- `createdAt`
- `updatedAt`

---

## Funkcja `callback`

Endpoint:

```txt
GET /integrations/allegro/callback
```

### Rola

Callback OAuth Allegro. Allegro wraca tutaj z `code` i `state`.

### Zmienne lokalne

#### `code`

Kod OAuth z Allegro.

#### `state`

Lokalne `marketplaceAccountId` zakodowane w OAuth state.

#### `marketplaceAccountId`

`Number(state)`.

#### `marketplaceAccount`

Lokalne konto marketplace znalezione w bazie.

#### `tokens`

Wynik `allegroAuthService.exchangeCodeForTokens(code)`.

#### `allegroUser`

Wynik `allegroAuthService.getCurrentAllegroUser(tokens.access_token)`.

#### `allegroExternalAccountId`

ID konta Allegro jako string.

#### `allegroAccountName`

Nazwa konta, zwykle login Allegro.

#### `accountAlreadyConnectedToAnotherUser`

Sprawdza, czy to samo konto Allegro nie jest podłączone do innego użytkownika AllePanel.

#### `tokenExpiresAt`

Data wygaśnięcia access tokena.

#### `updatedMarketplaceAccount`

Konto marketplace po zapisaniu tokenów i danych Allegro.

### Co robi

1. Waliduje `code` i `state`.
2. Znajduje lokalne konto marketplace.
3. Wymienia code na tokeny.
4. Pobiera `/me` z Allegro.
5. Sprawdza, czy konto nie jest połączone z innym userem.
6. Zapisuje tokeny i dane konta.
7. Zwraca potwierdzenie połączenia.

---

# 5. `backend/src/integrations/allegro/services/allegro-orders/allegro-orders.service.ts`

## Rola pliku

Serwis odpowiedzialny za pobieranie zamówień z Allegro i zapisywanie ich do lokalnych tabel `orders` oraz `order_items`.

## Typy

### `AllegroMoney`

Opis kwoty Allegro:

- `amount`
- `currency`

### `AllegroCheckoutForm`

Typ zamówienia Allegro. Zawiera m.in.:

- `id`
- `status`
- `messageToSeller`
- `updatedAt`
- `revision`
- `marketplace`
- `buyer`
- `fulfillment`
- `delivery`
- `payment`
- `summary`
- `invoice`
- `lineItems`

### `AllegroLineItem`

Typ produktu w zamówieniu Allegro.

Pola:

- `id`
- `offer`
- `quantity`
- `originalPrice`
- `price`
- `boughtAt`

### `AllegroCheckoutFormsResponse`

Typ odpowiedzi z `GET /order/checkout-forms`.

Pola:

- `checkoutForms`
- `count`
- `totalCount`

### `SyncOrdersResult`

Typ wyniku synchronizacji jednego konta.

Pola:

- `marketplaceAccountId`
- `fetched`
- `savedOrders`
- `savedItems`
- `totalCount`
- `statusRefresh`

## Stałe

### `ACTIVE_SYNC_FULFILLMENT_STATUSES`

Finalnie:

```ts
const ACTIVE_SYNC_FULFILLMENT_STATUSES = ['NEW', 'PROCESSING'];
```

Pobieramy jako nowe tylko zamówienia fulfillment `NEW` i `PROCESSING`.

### `UNPAID_SYNC_ORDER_STATUSES`

```ts
const UNPAID_SYNC_ORDER_STATUSES = ['BOUGHT'];
```

Pobieramy jako nieopłacone tylko `BOUGHT`.

### `SHIPPED_FULFILLMENT_STATUSES`

```ts
const SHIPPED_FULFILLMENT_STATUSES = [
  'READY_FOR_SHIPMENT',
  'SENT',
  'PICKED_UP',
  'READY_FOR_PICKUP',
];
```

Statusy wysłane.

### `CANCELLED_EXTERNAL_ORDER_STATUSES`

```ts
const CANCELLED_EXTERNAL_ORDER_STATUSES = [
  'CANCELLED',
  'BUYER_CANCELLED',
  'AUTO_CANCELLED',
];
```

Statusy anulowane.

### `allegroApiBaseUrl`

```ts
private readonly allegroApiBaseUrl = 'https://api.allegro.pl';
```

Bazowy URL API Allegro.

## Constructor

Wstrzykuje:

- `PrismaService`
- `AllegroAuthService`

---

## Funkcja `fetchOrdersForAccount`

### Rola

Pobiera zamówienia Allegro dla jednego konta.

### Finalna logika

1. Pobiera access token.
2. Pobiera `READY_FOR_PROCESSING + fulfillment NEW/PROCESSING`.
3. Pobiera `BOUGHT`.
4. Łączy wyniki po ID.
5. Zwraca listę.

### Zmienne lokalne

- `accessToken` — token Allegro.
- `readyForProcessing` — wynik aktywnych zamówień.
- `unpaid` — wynik zamówień BOUGHT.
- `byId` — mapa do usunięcia duplikatów.
- `checkoutForms` — finalna lista zamówień.

---

## Funkcja `fetchCheckoutFormsByFilters`

### Rola

Helper do pobierania zamówień z Allegro z filtrami.

### Zmienne lokalne

- `limit` — liczba rekordów na stronę, zwykle 100.
- `offset` — offset paginacji.
- `totalCount` — liczba rekordów po stronie Allegro.
- `allCheckoutForms` — akumulator zamówień.
- `params` — query params.
- `response` — odpowiedź Allegro.
- `checkoutForms` — aktualna strona wyników.

---

## Funkcja `syncOrdersForAccount`

### Rola

Pobiera zamówienia z Allegro i zapisuje/aktualizuje je w bazie.

### Zmienne lokalne

- `marketplaceAccount` — aktywne konto Allegro usera.
- `accessToken` — token Allegro.
- `data` — zamówienia z `fetchOrdersForAccount`.
- `checkoutForms` — lista zamówień.
- `imageByOfferId` — mapa offerId → URL obrazka.
- `savedOrders` — licznik zapisanych/zaktualizowanych zamówień.
- `savedItems` — licznik zapisanych produktów.
- `lineItems` — produkty konkretnego zamówienia.
- `totalToPay` — kwota do zapłaty.
- `totalCurrency` — waluta.
- `totalAmount` — suma produktów.
- `fulfillmentStatus` — status realizacji.
- `externalOrderStatus` — status zamówienia.
- `localStatus` — lokalny enum statusu.
- `orderCreatedAt` — data zakupu.
- `syncedAt` — data synchronizacji.
- `savedOrder` — wynik upsertu zamówienia.
- `activeExternalOrderIds` — set ID zamówień pobranych jako aktywne.
- `statusRefresh` — wynik odświeżenia lokalnych zamówień.

### Co robi

1. Waliduje konto Allegro.
2. Pobiera zamówienia.
3. Pobiera obrazki ofert.
4. Upsertuje zamówienia.
5. Czyści i tworzy `order_items`.
6. Odświeża wcześniej istniejące zamówienia, które nie przyszły w aktywnym fetchu.

---

## Funkcja `syncAllOrdersForUser`

### Rola

Synchronizuje wszystkie aktywne konta Allegro usera.

### Zmienne lokalne

- `accounts` — aktywne konta Allegro z tokenami.
- `results` — wyniki synchronizacji każdego konta.
- `result` — wynik jednej synchronizacji.

---

## Funkcja `getActiveAllegroAccountForUser`

### Rola

Pobiera aktywne konto Allegro usera.

### Waliduje

- czy `marketplaceAccountId` jest liczbą,
- czy konto istnieje,
- czy należy do usera,
- czy status jest `ACTIVE`,
- czy nie jest usunięte.

---

## Funkcja `getValidAccessTokenForAccount`

### Rola

Zwraca ważny access token Allegro.

### Zmienne lokalne

- `marketplaceAccount`
- `now`
- `tokenExpiresAt`
- `shouldRefresh`
- `refreshedTokens`
- `refreshedTokenExpiresAt`

### Co robi

Jeśli token wygasa w mniej niż 2 minuty, odświeża go przez `AllegroAuthService.refreshAccessToken` i zapisuje w bazie.

---

## Funkcja `fetchSingleOrderByExternalOrderId`

### Rola

Pobiera pojedyncze zamówienie z Allegro po externalOrderId.

Używane przy odświeżaniu zamówień już istniejących w bazie.

### Zmienne lokalne

- `response` — odpowiedź Allegro.

Jeśli Allegro zwróci błąd, funkcja loguje go i zwraca `null`.

---

## Funkcja `refreshPreviouslyActiveOrders`

### Rola

Odświeża statusy zamówień, które już są w bazie.

### Zmienne lokalne

- `where` — filtr Prisma.
- `localOrdersToRefresh` — zamówienia do sprawdzenia.
- `checked` — ile sprawdzono.
- `updated` — ile zaktualizowano.
- `movedToArchive` — ile przeszło do archiwum/statusu końcowego.
- `movedToSent` — ile przeszło do wysłanych.
- `movedToCancelled` — ile przeszło do anulowanych.
- `freshOrder` — świeże dane z Allegro.
- `freshExternalOrderStatus`
- `freshFulfillmentStatus`
- `statusChanged`

---

## Funkcja `fetchImagesForOrders`

### Rola

Pobiera obrazki ofert dla produktów z zamówień.

### Zmienne lokalne

- `uniqueOfferIds` — unikalne ID ofert.
- `imageByOfferId` — mapa offerId → image URL.

---

## Funkcja `fetchOfferImage`

### Rola

Pobiera obrazek jednej oferty Allegro.

### Zmienne lokalne

- `response`
- `images`
- `parsedImages`

Zwraca pierwszy obrazek albo `null`.

---

## Funkcja `getAllegroHeaders`

Buduje nagłówki Allegro:

- `Authorization: Bearer ...`
- `Accept: application/vnd.allegro.public.v1+json`
- `Content-Type: application/vnd.allegro.public.v1+json`

---

## Funkcja `calculateProductsTotal`

Liczy sumę produktów:

```txt
price * quantity
```

Zwraca string decimal z dwoma miejscami.

### Zmienne lokalne

- `total`
- `price`
- `quantity`

---

## Funkcja `getOrderCreatedAt`

Bierze najwcześniejszą datę `boughtAt` z line items.

### Zmienne lokalne

- `dates`

---

## Funkcja `toDateOrNull`

Konwertuje string na `Date` albo zwraca `null`.

### Zmienne lokalne

- `date`

---

## Funkcja `toDecimalString`

Konwertuje wartość liczbową na string z dwoma miejscami.

### Zmienne lokalne

- `numberValue`

---

## Funkcja `isShippedFulfillmentStatus`

Sprawdza, czy fulfillment status jest wysłany.

---

## Funkcja `isCancelledExternalOrderStatus`

Sprawdza, czy external order status jest anulowany.

---

## Funkcja `mapToLocalOrderStatus`

Mapuje statusy Allegro na lokalny `OrderStatus`.

Logika:

- anulowane → `CANCELLED`
- wysłane → `SENT`
- `PROCESSING` → `PROCESSING`
- reszta → `NEW`

---

# 6. `backend/src/integrations/allegro/services/allegro-shipments/allegro-shipments.service.ts`

## Rola pliku

Serwis Wysyłam z Allegro. Obsługuje:

- listę usług dostawy Allegro,
- dopasowanie usługi do zamówienia,
- przygotowanie payloadu,
- tworzenie komendy nadania,
- sprawdzanie komendy,
- pobieranie szczegółów paczki,
- pobieranie etykiety Allegro,
- zmianę fulfillment status na `READY_FOR_SHIPMENT`.

## Typy

### `AllegroDeliveryService`

Opisuje usługę dostawy Allegro. Może mieć:

- `id`,
- `deliveryMethodId`,
- `credentialsId`,
- `name`,
- `carrierId`,
- `additionalServices`,
- dowolne inne pola.

### `AllegroDeliveryServicesResponse`

Odpowiedź z Allegro delivery services.

Może mieć:

- `deliveryServices`,
- `services`,
- inne pola.

### `AllegroShipmentPackageInput`

Dane paczki do Allegro:

- `weightKg`,
- `lengthCm`,
- `widthCm`,
- `heightCm`,
- `labelFormat`.

## Stałe i właściwości

### `allegroApiBaseUrl`

```ts
private readonly allegroApiBaseUrl = 'https://api.allegro.pl';
```

Bazowy URL API Allegro.

---

## Funkcja `normalizePhone`

Czyści telefon:

- usuwa spacje,
- usuwa `+48`.

---

## Funkcja `markOrderReadyForShipment`

Dodana w finalnych zmianach.

### Rola

Ustawia fulfillment status zamówienia Allegro na `READY_FOR_SHIPMENT` po udanym nadaniu paczki.

### Zmienne lokalne

- `order` — zamówienie lokalne.
- `accessToken` — token Allegro.
- `params` — query params.
- `query` — string query z `checkoutForm.revision`.

### Co robi

Wysyła:

```txt
PUT /order/checkout-forms/:externalOrderId/fulfillment
```

z body:

```json
{
  "status": "READY_FOR_SHIPMENT",
  "shipmentSummary": { "lineItemsSent": "ALL" },
  "provider": { "id": "SELLER" }
}
```

Potem aktualizuje lokalny order.

---

## Funkcja `getDeliveryServicesForAccount`

### Rola

Pobiera usługi Wysyłam z Allegro dla konta.

### Zmienne lokalne

- `accessToken`
- `response`
- `services`

### Zwraca

- `ok`
- `marketplaceAccountId`
- `totalServices`
- uproszczone `services`
- `raw`

---

## Funkcja `findDeliveryServiceForOrder`

### Rola

Dopasowuje metodę wysyłki zamówienia do dostępnej usługi nadania.

### Zmienne lokalne

- `order`
- `isInpost`
- `activeInpostShipxAccount`
- `accessToken`
- `response`
- `services`
- `deliveryMethodId`
- `matches`
- `selected`

### Logika

Jeśli zamówienie wygląda na InPost i user ma aktywny ShipX, rekomenduje `INPOST_SHIPX`.

W przeciwnym razie pobiera delivery services Allegro i próbuje znaleźć usługę o tym samym `deliveryMethodId`.

---

## Funkcja `prepareAllegroShipmentForOrder`

### Rola

Buduje payload do Wysyłam z Allegro, ale nie tworzy przesyłki.

### Zmienne lokalne

- `order`
- `serviceMatch`
- `selectedService`
- `fieldErrors`
- `weightKg`
- `lengthCm`
- `widthCm`
- `heightCm`
- `receiverName`
- `receiverPhone`
- `missing`
- `labelFormat`
- `packageData`
- `payloadPreview`
- `uniqueMissing`

### Co sprawdza

- orderId,
- istnienie zamówienia,
- deliveryMethodId,
- dopasowanie usługi Allegro,
- wagę/wymiary,
- dane odbiorcy,
- status zamówienia,
- produkty.

---

## Funkcja `createAllegroShipmentCommandForOrder`

### Rola

Realnie tworzy komendę nadania w Wysyłam z Allegro.

### Zmienne lokalne

- `prepared`
- `existingShipment`
- `accessToken`
- `rawRequest`
- `response`
- `commandId`
- `savedShipment`
- `errorDetails`
- `fulfillmentUpdate` — po finalnych zmianach.

### Co robi

1. Przygotowuje payload.
2. Sprawdza, czy przesyłka już istnieje.
3. Wysyła POST do Allegro:

```txt
/shipment-management/shipments/create-commands
```

4. Zapisuje lokalny shipment.
5. Finalnie próbuje zmienić status Allegro na `READY_FOR_SHIPMENT`.

---

## Funkcja `getAllegroShipmentCommandForUser`

### Rola

Sprawdza status komendy nadania Allegro.

### Zmienne lokalne

- `shipment`
- `accessToken`
- `response`
- `externalShipmentId`
- `trackingNumber`
- `commandStatus`
- `updatedShipment`

### Co robi

Pobiera:

```txt
GET /shipment-management/shipments/create-commands/:commandId
```

Jeśli Allegro zwróci ID paczki lub tracking, zapisuje je lokalnie.

---

## Funkcja `getAllegroShipmentDetailsForUser`

### Rola

Pobiera szczegóły paczki Allegro po `externalShipmentId`.

### Zmienne lokalne

- `shipment`
- `accessToken`
- `response`
- `trackingNumber`
- `updatedShipment`

---

## Funkcja `getAllegroShipmentLabelForUser`

### Rola

Pobiera etykietę PDF dla paczki Allegro.

### Zmienne lokalne

- `shipment`
- `accessToken`
- `pageSize`
- `response`

Wysyła POST:

```txt
/shipment-management/label
```

z `shipmentIds` i `pageSize`.

---

## Funkcja `getActiveAllegroAccountForUser`

Pobiera aktywne konto Allegro usera.

---

## Funkcja `getValidAccessTokenForAccount`

Zwraca ważny token Allegro, odświeża go jeśli wygasa.

Zmienna `shouldRefresh` określa, czy token wygasa w mniej niż 2 minuty.

---

## Funkcja `normalizeDeliveryServices`

Normalizuje odpowiedź Allegro do tablicy services.

Obsługuje odpowiedzi:

- tablica,
- `{ deliveryServices: [] }`,
- `{ services: [] }`.

---

## Funkcja `deliveryServiceMatchesMethod`

Sprawdza, czy usługa Allegro pasuje do `deliveryMethodId` zamówienia.

---

## Funkcja `simplifyDeliveryService`

Upraszcza raw service Allegro do czytelnej struktury:

- `id`,
- `deliveryMethodId`,
- `credentialsId`,
- `name`,
- `carrierId`,
- `additionalServices`,
- `rawKeys`.

---

## Funkcja `isInpostDeliveryMethod`

Sprawdza po nazwie, czy metoda wygląda na InPost.

---

## Funkcja `getAllegroHeaders`

Buduje nagłówki Allegro.

---

## Funkcja `extractCommandId`

Wyciąga ID komendy z odpowiedzi Allegro.

Sprawdza m.in.:

- `commandId`,
- `id`,
- `data.commandId`.

---

## Funkcja `extractCommandStatus`

Wyciąga status komendy.

Sprawdza:

- `status`,
- `commandStatus`,
- `data.status`.

---

## Funkcja `extractExternalShipmentId`

Wyciąga ID paczki Allegro.

Sprawdza:

- `shipmentId`,
- `shipment.id`,
- `output.shipmentId`,
- `output.shipment.id`,
- `result.shipmentId`.

---

## Funkcja `extractTrackingNumber`

Wyciąga numer trackingowy.

Sprawdza:

- `trackingNumber`,
- `tracking_number`,
- `waybill`,
- `shipment.trackingNumber`,
- `trackingDetails.number`,
- `tracking_details.number`.

---

## Funkcja `toJsonSafe`

Robi bezpieczną kopię JSON do zapisu w Prisma.

---

# 7. `backend/src/integrations/erli/`

## Rola folderu

Folder istnieje jako placeholder dla przyszłej integracji Erli.

W przesłanej strukturze nie ma w nim plików kodu, więc:

- nie ma funkcji,
- nie ma klas,
- nie ma zmiennych,
- nie ma modułu,
- nie ma endpointów.

Docelowo można tu dodać strukturę analogiczną do Allegro:

```txt
erli.controller.ts
erli.module.ts
services/erli-auth
services/erli-orders
services/erli-shipments
```

---

# 8. `backend/src/integrations/inpost/inpost.module.ts`

## Rola pliku

Moduł NestJS dla integracji InPost ShipX.

## Importy

### `Module`

Dekorator NestJS.

### `AuthModule`

Endpointy InPost są chronione przez `AuthGuard`.

### `PrismaModule`

Dostęp do bazy.

### `InpostController`

Kontroler endpointów InPost.

### `InpostShipxService`

Serwis API ShipX.

## Dekorator `@Module`

```ts
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [InpostController],
  providers: [InpostShipxService],
  exports: [InpostShipxService],
})
```

### `exports`

Eksportuje `InpostShipxService`, żeby `ShipmentsModule` mógł go używać do tworzenia przesyłek i pobierania etykiet.

## Klasa `InpostModule`

Nie ma metod. To definicja modułu.

## Zmienne `const`

Brak.

---

# 9. `backend/src/integrations/inpost/inpost.controller.ts`

## Rola pliku

Kontroler HTTP dla InPost ShipX.

Prefix:

```txt
/integrations/inpost
```

Chroniony przez `AuthGuard`.

## Wstrzykiwane zależności

### `inpostShipxService`

Serwis komunikacji z API ShipX.

### `prisma`

Dostęp do bazy.

---

## Funkcja `testShipxCredentials`

Endpoint:

```txt
POST /integrations/inpost/shipx/test-credentials
```

### Rola

Sprawdza, czy podane `organizationId` i `apiToken` są poprawne. Niczego nie zapisuje.

### Body

- `organizationId`
- `apiToken`

### Zmienne lokalne

- `user` — aktualny user.
- `organizationId` — oczyszczony string.
- `apiToken` — oczyszczony string.
- `organization` — odpowiedź ShipX.

### Zwraca

Dane organizacji:

- `id`,
- `name`,
- `email`,
- `status`,
- `taxId`.

---

## Funkcja `connectShipxAccount`

Endpoint:

```txt
POST /integrations/inpost/shipx/connect
```

### Rola

Podłącza konto InPost ShipX do usera i zapisuje je w tabeli `shippingAccount`.

### Body

- `accountName`
- `organizationId`
- `apiToken`

### Zmienne lokalne

- `user`
- `accountName`
- `organizationId`
- `apiToken`
- `organization`
- `existingAccount`
- `savedAccount`

### Logika

1. Waliduje `organizationId` i `apiToken`.
2. Pobiera organizację z ShipX.
3. Sprawdza, czy ta organizacja nie jest już podłączona do innego usera.
4. Jeśli konto istnieje dla tego samego usera — aktualizuje je.
5. Jeśli nie istnieje — tworzy nowe.
6. Nie zwraca `apiToken` do frontendu.

---

## Funkcja `getShipxAccounts`

Endpoint:

```txt
GET /integrations/inpost/shipx/accounts
```

### Rola

Zwraca konta InPost ShipX zalogowanego usera.

### Zmienne lokalne

- `user`
- `accounts`

### Zwracane pola

- `id`
- `provider`
- `accountName`
- `organizationId`
- `organizationName`
- `organizationEmail`
- `status`
- `errorMessage`
- `createdAt`
- `updatedAt`

Nie zwraca `apiToken`.

---

# 10. `backend/src/integrations/inpost/services/inpost-shipx/inpost-shipx.service.ts`

## Rola pliku

Serwis niskopoziomowej komunikacji z InPost ShipX.

Odpowiada za:

- sprawdzenie organizacji,
- tworzenie przesyłki,
- pobranie etykiety.

## Typ `InpostOrganizationResponse`

Opis odpowiedzi organizacji ShipX.

Pola:

- `id`
- `name`
- `email`
- `status`
- `tax_id`
- inne dynamiczne pola.

## Typ `LabelRequestSettings`

W finalnej wersji warto mieć:

```ts
type LabelRequestSettings = {
  queryFormat: 'pdf' | 'zpl' | 'epl';
  accept: string;
};
```

Opis:

Określa, jaki `format` i jaki `Accept` wysłać do ShipX przy pobieraniu etykiety.

## Właściwość `shipxBaseUrl`

```ts
private readonly shipxBaseUrl = 'https://api-shipx-pl.easypack24.net';
```

Bazowy URL ShipX.

---

## Funkcja `getOrganizationByCredentials`

### Rola

Sprawdza dane ShipX.

### Parametry

- `organizationId`
- `apiToken`

### Zmienne lokalne

- `response` — odpowiedź z ShipX.

### Endpoint

```txt
GET /v1/organizations/:organizationId
```

---

## Funkcja `createShipmentByCredentials`

### Rola

Tworzy przesyłkę w ShipX.

### Parametry

- `organizationId`
- `apiToken`
- `payload`

### Zmienne lokalne

- `response`

### Endpoint

```txt
POST /v1/organizations/:organizationId/shipments
```

---

## Funkcja `getShipmentLabelByCredentials`

### Rola

Pobiera etykietę przesyłki.

### Parametry

- `organizationId`
- `apiToken`
- `externalShipmentId`
- `format`

### Zmienne lokalne

- `normalizedFormat` w starej wersji.
- `labelSettings` w finalnej wersji.
- `response` — odpowiedź z ShipX jako `arraybuffer`.

### Finalny endpoint

```txt
GET /v1/shipments/:externalShipmentId/label?format=pdf|zpl|epl
```

### Obsługiwane formaty

- `pdf-a6` → PDF A6.
- `pdf-a4` → PDF A4.
- `zpl` → ZPL 203 dpi.
- `epl` → EPL 203 dpi.

---

## Funkcja `getLabelRequestSettings`

Finalna funkcja pomocnicza.

### Rola

Mapuje format aplikacji na format ShipX i nagłówek Accept.

### Logika

- `zpl` → `format=zpl`, `Accept: text/zpl;dpi=203`.
- `epl` → `format=epl`, `Accept: text/epl2;dpi=203`.
- `pdf-a4` → `format=pdf`, `Accept: application/pdf;format=A4`.
- default → `format=pdf`, `Accept: application/pdf;format=A6`.

---

## Funkcja `getShipxHeaders`

### Rola

Buduje nagłówki ShipX.

### Zwraca

```ts
{
  Authorization: `Bearer ${apiToken}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
}
```

---

# 11. Najważniejsze zależności między plikami

## Allegro OAuth

```txt
allegro.controller.ts
→ allegro-auth.service.ts
→ Allegro API OAuth
→ Prisma marketplaceAccount
```

## Synchronizacja zamówień

```txt
allegro.controller.ts
→ allegro-orders.service.ts
→ Allegro /order/checkout-forms
→ Prisma orders + order_items
```

## Wysyłam z Allegro

```txt
allegro.controller.ts
→ allegro-shipments.service.ts
→ Allegro shipment-management
→ Prisma shipment
```

## InPost ShipX konto

```txt
inpost.controller.ts
→ inpost-shipx.service.ts
→ ShipX /organizations/:id
→ Prisma shippingAccount
```

## InPost ShipX przesyłka

```txt
shipments.service.ts
→ inpost-shipx.service.ts
→ ShipX /shipments
→ Prisma shipment
```

## Po nadaniu InPost zmiana statusu Allegro

```txt
shipments.service.ts
→ allegro-shipments.service.ts
→ markOrderReadyForShipment
→ Allegro /order/checkout-forms/:id/fulfillment
→ Prisma order.externalFulfillmentStatus = READY_FOR_SHIPMENT
```

---

# 12. Najważniejsze statusy biznesowe

## Aktywne do obsługi

```txt
externalOrderStatus = READY_FOR_PROCESSING
externalFulfillmentStatus = NEW albo PROCESSING
```

## Nieopłacone

```txt
externalOrderStatus = BOUGHT
```

## Pomijane jako nowe

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

## Wysłane

```txt
externalFulfillmentStatus = READY_FOR_SHIPMENT
externalFulfillmentStatus = SENT
externalFulfillmentStatus = PICKED_UP
externalFulfillmentStatus = READY_FOR_PICKUP
```

## Anulowane

```txt
externalOrderStatus = CANCELLED
externalOrderStatus = BUYER_CANCELLED
externalOrderStatus = AUTO_CANCELLED
```

---

# 13. Odpowiedź na pytanie: czy po udanym nadaniu status powinien zmienić się na `READY_FOR_SHIPMENT`?

Tak.

Po udanym nadaniu paczki backend powinien wykonać:

```txt
PUT /order/checkout-forms/:externalOrderId/fulfillment
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

Jeśli Allegro zaakceptuje request, lokalna baza powinna dostać:

```txt
externalFulfillmentStatus = READY_FOR_SHIPMENT
externalLineItemsSentStatus = ALL
```

Wtedy zamówienie trafia do dashboardowej kategorii:

```txt
Wysłane
```

Jeśli `fulfillmentUpdate.ok = false`, oznacza to, że paczka została utworzona, ale Allegro odrzuciło zmianę statusu. Wtedy trzeba sprawdzić szczegóły błędu z response.


# Dokumentacja plików: `database/` + `frontend/`

Ten dokument opisuje pliki z podanej struktury:

```txt
.
├── database/
│   └── docker-compose.yml
└── frontend/
    └── src/
        ├── app/
        │   ├── (app)/
        │   │   ├── account/
        │   │   │   └── page.tsx
        │   │   ├── dashboard/
        │   │   │   └── page.tsx
        │   │   ├── orders/
        │   │   │   └── [id]/
        │   │   │       └── page.tsx
        │   │   └── layout.tsx
        │   ├── login/
        │   │   └── page.tsx
        │   ├── globals.css
        │   ├── layout.tsx
        │   └── page.tsx
        ├── components/
        │   └── Sidebar.tsx
        ├── lib/
        │   ├── api.ts
        │   ├── context.ts
        │   └── qzPrint.ts
        └── types/
            └── qz-tray.d.ts
```

Dokument opisuje funkcje, stałe, typy, zmienne stanu React i logikę działania plików. Opis bazuje na plikach przesłanych w rozmowie oraz na zmianach, które zostały wykonane później krok po kroku.

Uwaga: nie dostałem treści pliku `database/docker-compose.yml`, więc opisuję jego rolę w projekcie ogólnie i zaznaczam, że nie mogę opisać konkretnych pól tego pliku bez jego zawartości.

---

# 1. `database/docker-compose.yml`

## Rola pliku

Plik `docker-compose.yml` w folderze `database/` zwykle służy do uruchamiania lokalnej bazy danych przez Dockera. W tym projekcie backend używa PostgreSQL przez Prisma, więc ten plik prawdopodobnie uruchamia kontener PostgreSQL.

## Co zwykle znajduje się w tym pliku

Ponieważ nie mam faktycznej treści tego pliku, nie mogę potwierdzić dokładnych nazw zmiennych, portów ani wolumenów. Standardowo taki plik może zawierać:

- `services` — lista usług Docker Compose.
- `postgres` albo `db` — nazwa usługi bazy danych.
- `image` — obraz Dockera, np. `postgres`.
- `container_name` — nazwa kontenera.
- `environment` — zmienne środowiskowe bazy:
  - `POSTGRES_USER`,
  - `POSTGRES_PASSWORD`,
  - `POSTGRES_DB`.
- `ports` — mapowanie portów, np. `5432:5432`.
- `volumes` — trwałe dane bazy.

## Zależność z backendem

Backend używa `DATABASE_URL`. Ten URL musi pasować do danych z `docker-compose.yml`, np. nazwy bazy, użytkownika, hasła i portu.

---

# 2. `frontend/src/lib/context.ts`

## Rola pliku

Ten plik definiuje globalny kontekst zalogowanego użytkownika dla frontendu. Dzięki niemu komponenty takie jak `Sidebar` albo strony w `app/(app)` mogą odczytać dane usera bez przekazywania ich ręcznie przez propsy.

## Dyrektywa `'use client'`

```ts
'use client'
```

Oznacza, że plik działa po stronie klienta. Jest potrzebne, bo używa React Context i hooka `useContext`.

## Importy

```ts
import { createContext, useContext } from 'react'
```

- `createContext` — tworzy kontekst React.
- `useContext` — pozwala odczytać wartość z kontekstu.

## Typ `User`

```ts
export type User = { id: number; email: string; firstName?: string }
```

Opis:

Typ podstawowego użytkownika dostępnego we frontendzie.

Pola:

- `id` — ID użytkownika z backendu.
- `email` — email użytkownika.
- `firstName?` — opcjonalne imię.

Po późniejszych zmianach backend zwraca też ustawienia drukarki w `/auth/me`, ale pierwotny frontendowy typ `User` ma tylko podstawowe pola. Jeżeli chcesz mieć pełną zgodność typów, można później rozszerzyć `User` o:

- `labelPrinterName`,
- `labelPrinterFormat`,
- `labelPrinterDpi`,
- `labelPrinterWidthMm`,
- `labelPrinterHeightMm`.

## Stała `UserContext`

```ts
export const UserContext = createContext<User | null>(null)
```

Opis:

Tworzy globalny kontekst użytkownika.

Wartość może być:

- `User` — jeśli użytkownik jest zalogowany,
- `null` — jeśli nie ma użytkownika.

Wartość domyślna to `null`.

## Funkcja `useUser`

```ts
export const useUser = () => useContext(UserContext)
```

Opis:

Krótki helper do używania kontekstu użytkownika.

Zamiast pisać:

```ts
useContext(UserContext)
```

w komponentach można pisać:

```ts
useUser()
```

Używane m.in. w:

- `Sidebar.tsx`,
- `account/page.tsx`.

---

# 3. `frontend/src/lib/api.ts`

## Rola pliku

Ten plik zawiera helpery do komunikacji frontendu z backendem.

Po zmianach zawiera:

- bazowy adres API,
- helper do JSON requestów,
- helper do pobierania tekstowych plików, np. ZPL,
- link startowy do OAuth Allegro.

## Stała `API`

```ts
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
```

Opis:

Bazowy adres backendu.

Logika:

- jeśli istnieje zmienna środowiskowa `NEXT_PUBLIC_API_URL`, używa jej,
- jeśli nie, używa `http://localhost:3000`.

Znaczenie:

Frontend może działać lokalnie albo produkcyjnie bez zmiany kodu. Wystarczy ustawić zmienną środowiskową.

## Stała `API_BASE`

```ts
export const API_BASE = API
```

Opis:

Eksportuje bazowy adres API do użycia w innych plikach.

Używane w `orders/[id]/page.tsx` do budowania linków do etykiet:

```txt
/shipments/:shipmentId/label?format=pdf-a6
/shipments/:shipmentId/label?format=zpl
```

## Funkcja `api`

```ts
export async function api(path: string, opts: RequestInit = {}): Promise<any>
```

Opis:

Główny helper do requestów JSON do backendu.

Parametry:

- `path` — ścieżka endpointu, np. `/auth/me`.
- `opts` — opcjonalne ustawienia `fetch`, np. `method`, `body`, `headers`.

Co robi:

1. Buduje pełny URL:

```ts
`${API}${path}`
```

2. Wysyła request przez `fetch`.

3. Zawsze dodaje:

```ts
credentials: 'include'
```

To jest kluczowe, bo backend loguje przez HttpOnly cookie `session`. Dzięki temu przeglądarka wysyła cookie do backendu.

4. Ustawia nagłówek:

```ts
'Content-Type': 'application/json'
```

5. Pozwala nadpisać/dodać inne nagłówki przez `opts.headers`.

6. Jeśli backend zwróci `401`, rzuca błąd `Unauthorized` z `status: 401`.

7. Sprawdza `content-type` odpowiedzi.

8. Jeśli `res.ok` jest false, próbuje odczytać błąd jako JSON albo text i rzuca go.

9. Jeśli odpowiedź jest JSON, zwraca `res.json()`.

10. Jeśli odpowiedź nie jest JSON, zwraca surowe `res`.

Używane praktycznie w całym frontendzie.

## Funkcja `fetchTextFile`

```ts
export async function fetchTextFile(path: string): Promise<string>
```

Opis:

Helper do pobierania plików tekstowych z backendu.

Po co istnieje:

Etykieta ZPL nie jest JSON-em. To zwykły tekst zaczynający się od `^XA` i kończący `^XZ`. Dlatego nie można używać zwykłego `api()`, bo `api()` jest zaprojektowane głównie pod JSON.

Co robi:

1. Buduje URL z `API + path`.
2. Wysyła request z `credentials: 'include'`.
3. Obsługuje `401`.
4. Jeśli odpowiedź jest błędna, odczytuje błąd jako JSON albo text.
5. Jeśli odpowiedź jest poprawna, zwraca:

```ts
res.text()
```

Używane w `orders/[id]/page.tsx` do pobierania ZPL:

```ts
fetchTextFile(`/shipments/${shipmentId}/label?format=zpl`)
```

## Stała `ALLEGRO_START`

```ts
export const ALLEGRO_START = `${API}/integrations/allegro/start`
```

Opis:

Pełny link do rozpoczęcia OAuth Allegro.

Używane w `account/page.tsx` po kliknięciu przycisku Allegro.

---

# 4. `frontend/src/lib/qzPrint.ts`

## Rola pliku

Ten plik odpowiada za drukowanie etykiety ZPL przez QZ Tray. Jest używany przez przycisk `Drukuj etykietę`.

QZ Tray działa lokalnie na komputerze i umożliwia stronie internetowej wysyłanie danych do drukarki bez standardowego okna drukowania systemu.

## Typ `QzPrinterSettings`

```ts
type QzPrinterSettings = {
  labelPrinterName?: string | null
  labelPrinterDpi?: number | string | null
  labelPrinterWidthMm?: number | string | null
  labelPrinterHeightMm?: number | string | null
}
```

Opis:

Typ ustawień drukarki pobranych z backendu.

Pola:

- `labelPrinterName` — nazwa drukarki zapisana w profilu użytkownika.
- `labelPrinterDpi` — DPI drukarki, np. `203` dla Zebra GC420d.
- `labelPrinterWidthMm` — szerokość etykiety w mm, np. `100`.
- `labelPrinterHeightMm` — wysokość etykiety w mm, np. `150`.

## Funkcja `mmToInches`

```ts
function mmToInches(value: number) {
  return value / 25.4
}
```

Opis:

Konwertuje milimetry na cale.

Po co:

QZ Tray w konfiguracji `size` używa cali, a w profilu zapisujemy rozmiar etykiety w milimetrach.

Przykład:

```txt
100 mm / 25.4 = około 3.94 cala
```

## Funkcja `getQz`

```ts
async function getQz() {
  const mod: any = await import('qz-tray')
  return mod.default || mod
}
```

Opis:

Dynamicznie importuje moduł `qz-tray`.

Po co dynamiczny import:

Next.js renderuje część kodu po stronie serwera, a `qz-tray` ma działać tylko w przeglądarce. Dynamiczny import w funkcji sprawia, że moduł ładuje się dopiero wtedy, gdy użytkownik kliknie drukowanie.

## Funkcja `printZplWithQz`

```ts
export async function printZplWithQz(zpl: string, settings: QzPrinterSettings)
```

Opis:

Główna funkcja drukowania ZPL.

Parametry:

- `zpl` — tekst etykiety ZPL pobrany z backendu.
- `settings` — ustawienia drukarki z profilu użytkownika.

Co robi krok po kroku:

1. Odczytuje nazwę drukarki:

```ts
const printerName = String(settings.labelPrinterName || '').trim()
```

2. Jeśli nazwa jest pusta, rzuca błąd:

```txt
Brak zapisanej drukarki etykiet w profilu użytkownika.
```

3. Jeśli ZPL jest pusty, rzuca błąd:

```txt
Brak danych ZPL etykiety do druku.
```

4. Ładuje QZ Tray:

```ts
const qz = await getQz()
```

5. Sprawdza, czy websocket QZ jest aktywny:

```ts
if (!qz.websocket.isActive()) {
  await qz.websocket.connect()
}
```

6. Szuka drukarki po nazwie:

```ts
const resolvedPrinterName = await qz.printers.find(printerName)
```

7. Jeśli QZ nie znajdzie drukarki, rzuca błąd:

```txt
Nie znaleziono drukarki: {printerName}
```

8. Odczytuje rozmiar etykiety:

```ts
const widthMm = Number(settings.labelPrinterWidthMm || 100)
const heightMm = Number(settings.labelPrinterHeightMm || 150)
```

9. Tworzy konfigurację QZ:

```ts
const config = qz.configs.create(resolvedPrinterName, {
  size: {
    width: mmToInches(widthMm),
    height: mmToInches(heightMm),
  },
  jobName: 'AllePanel label',
})
```

10. Drukuje raw ZPL:

```ts
await qz.print(config, [zpl])
```

11. Zwraca:

```ts
{
  ok: true,
  printerName: resolvedPrinterName,
}
```

Możliwe błędy:

- QZ Tray nie jest uruchomiony.
- Użytkownik nie zapisał drukarki.
- Nazwa drukarki jest inna niż w systemie/QZ Tray.
- QZ odrzuci połączenie lub druk.

---

# 5. `frontend/src/types/qz-tray.d.ts`

## Rola pliku

Ten plik deklaruje moduł `qz-tray` dla TypeScript.

## Deklaracja modułu

```ts
declare module 'qz-tray' {
  const qz: any
  export default qz
}
```

Opis:

Mówi TypeScriptowi, że istnieje moduł `qz-tray`, nawet jeśli paczka nie dostarcza idealnych typów.

`qz` ma typ `any`, żeby nie blokować kompilacji.

---

# 6. `frontend/src/app/layout.tsx`

## Rola pliku

To główny layout całej aplikacji Next.js. Obejmuje wszystkie strony: login, dashboard, account, orders.

## Importy

```ts
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
```

Opis:

- `Metadata` — typ metadanych Next.js.
- `Geist` — font Google/Next.
- `globals.css` — globalne style Tailwind i podstawowe zmienne.

## Stała `geist`

```ts
const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
```

Opis:

Ładuje font Geist z subsetem `latin` i zapisuje CSS variable `--font-geist`.

## Stała `metadata`

```ts
export const metadata: Metadata = { title: 'AllePanel', description: 'Panel zarządzania zamówieniami' }
```

Opis:

Metadane strony:

- title: `AllePanel`,
- description: `Panel zarządzania zamówieniami`.

## Funkcja/komponent `RootLayout`

```tsx
export default function RootLayout({ children }: { children: React.ReactNode })
```

Opis:

Główny layout HTML.

Zwraca:

```tsx
<html lang="pl" className={`${geist.variable} h-full`}>
  <body className="min-h-full bg-gray-50 text-gray-900 font-sans antialiased">
    {children}
  </body>
</html>
```

Znaczenie:

- `lang="pl"` — język polski.
- `geist.variable` — dodaje font.
- `h-full`, `min-h-full` — pełna wysokość strony.
- `bg-gray-50`, `text-gray-900` — globalne kolory.
- `font-sans antialiased` — font i wygładzenie.

---

# 7. `frontend/src/app/globals.css`

## Rola pliku

Globalne style CSS.

## Import Tailwind

```css
@import "tailwindcss";
```

Opis:

Importuje Tailwind CSS.

## Zmienne CSS `:root`

```css
:root {
  --background: #f9fafb;
  --foreground: #111827;
}
```

Opis:

Definiuje podstawowe kolory:

- `--background` — jasne tło.
- `--foreground` — ciemny tekst.

## Styl `body`

```css
body {
  background: var(--background);
  color: var(--foreground);
}
```

Opis:

Ustawia globalne tło i kolor tekstu.

---

# 8. `frontend/src/app/page.tsx`

## Rola pliku

Strona główna `/`.

## Import

```ts
import { redirect } from 'next/navigation'
```

`redirect` służy do przekierowania użytkownika.

## Funkcja `Home`

```ts
export default function Home() { redirect('/dashboard') }
```

Opis:

Po wejściu na `/` użytkownik jest automatycznie przekierowany na `/dashboard`.

---

# 9. `frontend/src/app/login/page.tsx`

## Rola pliku

Strona logowania i rejestracji.

## Dyrektywa `'use client'`

Plik działa po stronie klienta, bo używa `useState`, `useRouter` i obsługuje formularz.

## Importy

```ts
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
```

Opis:

- `useState` — stan formularza.
- `useRouter` — przekierowanie po loginie.
- `api` — requesty do backendu.

## Komponent `LoginPage`

```tsx
export default function LoginPage()
```

Główna strona logowania/rejestracji.

## Zmienna `router`

```ts
const router = useRouter()
```

Do czego służy:

Przekierowuje użytkownika po loginie/rejestracji:

```ts
router.push('/dashboard')
```

## Stan `mode`

```ts
const [mode, setMode] = useState<'login' | 'register'>('login')
```

Opis:

Określa, czy formularz działa jako:

- login,
- rejestracja.

## Stan `form`

```ts
const [form, setForm] = useState({ email: '', password: '', firstName: '' })
```

Opis:

Przechowuje dane formularza:

- email,
- password,
- firstName.

## Stan `error`

```ts
const [error, setError] = useState('')
```

Opis:

Komunikat błędu logowania/rejestracji.

## Stan `loading`

```ts
const [loading, setLoading] = useState(false)
```

Opis:

Czy formularz jest aktualnie wysyłany.

Blokuje przycisk i pokazuje `Ładowanie...`.

## Funkcja `set`

```ts
const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
```

Opis:

Aktualizuje jedno pole formularza.

Parametry:

- `k` — nazwa pola,
- `v` — nowa wartość.

## Funkcja `submit`

```ts
async function submit(e: React.FormEvent)
```

Do czego służy:

Obsługuje wysłanie formularza.

Co robi:

1. `e.preventDefault()` — blokuje normalne przeładowanie strony.
2. Czyści błąd.
3. Ustawia loading.
4. Jeśli `mode === 'login'`, wysyła:

```txt
POST /auth/login
```

5. Jeśli `mode === 'register'`, wysyła:

```txt
POST /auth/register
```

6. Po sukcesie przekierowuje:

```txt
/dashboard
```

7. Po błędzie ustawia `error`.
8. W `finally` wyłącza loading.

---

# 10. `frontend/src/app/(app)/layout.tsx`

## Rola pliku

To layout tylko dla zalogowanej części aplikacji, czyli dla tras w grupie `(app)`:

- `/dashboard`,
- `/account`,
- `/orders/:id`.

## Dyrektywa `'use client'`

Plik działa po stronie klienta, bo używa `useEffect`, `useState`, `useRouter`.

## Importy

```ts
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { UserContext, type User } from '@/lib/context'
import Sidebar from '@/components/Sidebar'
```

Opis:

- `useEffect` — sprawdzanie sesji po załadowaniu.
- `useState` — stan użytkownika.
- `useRouter` — przekierowanie do `/login`.
- `api` — request `/auth/me`.
- `UserContext` — udostępnia usera dzieciom.
- `Sidebar` — boczne menu.

## Komponent `AppLayout`

```tsx
export default function AppLayout({ children }: { children: React.ReactNode })
```

## Zmienna `router`

```ts
const router = useRouter()
```

Do czego służy:

Przekierowuje niezalogowanego użytkownika do `/login`.

## Stan `user`

```ts
const [user, setUser] = useState<User | null | undefined>(undefined)
```

Opis:

Trzy możliwe stany:

- `undefined` — trwa sprawdzanie sesji,
- `null` — brak usera,
- `User` — user zalogowany.

## `useEffect`

```ts
useEffect(() => {
  api('/auth/me').then(d => {
    if (!d.user) router.replace('/login')
    else setUser(d.user)
  }).catch(() => router.replace('/login'))
}, [])
```

Opis:

Po wejściu w zalogowaną część aplikacji frontend sprawdza sesję przez `/auth/me`.

Jeśli brak usera, robi redirect do `/login`.

Jeśli user istnieje, zapisuje go w stanie.

## Loader

Jeśli `user === undefined`, pokazuje spinner.

## Provider

```tsx
<UserContext.Provider value={user}>
```

Udostępnia usera komponentom wewnątrz layoutu.

## Layout UI

Zwraca:

- `Sidebar`,
- `main` z zawartością strony.

---

# 11. `frontend/src/components/Sidebar.tsx`

## Rola pliku

Boczne menu aplikacji.

## Dyrektywa `'use client'`

Wymagana, bo używa `usePathname` i `useUser`.

## Importy

```ts
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/lib/context'
```

Opis:

- `Link` — linki Next.js.
- `usePathname` — aktualny URL.
- `useUser` — dane zalogowanego użytkownika.

## Komponent `Sidebar`

```tsx
export default function Sidebar()
```

## Stała `path`

```ts
const path = usePathname()
```

Opis:

Aktualna ścieżka URL, np. `/dashboard`.

Używana do podświetlenia aktywnej ikony.

## Stała `user`

```ts
const user = useUser()
```

Opis:

Pobiera usera z `UserContext`.

## Stała `initials`

```ts
const initials = user?.firstName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'
```

Opis:

Wylicza literę do avatara konta.

Priorytet:

1. pierwsza litera imienia,
2. pierwsza litera emaila,
3. `?`.

## Link do dashboardu

Link:

```txt
/dashboard
```

Podświetla się, gdy ścieżka zaczyna się od:

- `/dashboard`,
- `/orders`.

## Link do konta

Link:

```txt
/account
```

Pokazuje inicjał użytkownika.

Podświetla się, gdy ścieżka zaczyna się od `/account`.

---

# 12. `frontend/src/app/(app)/account/page.tsx`

## Rola pliku

Strona konta użytkownika. Zawiera:

- dane konta,
- ustawienia drukarki etykiet,
- integracje Allegro/InPost.

## Typ `PrinterSettings`

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

Typ stanu formularza drukarki.

## Funkcja `inp`

```ts
function inp(extra = '')
```

Zwraca klasy Tailwind dla inputów.

Parametr `extra` pozwala dodać dodatkowe klasy.

## Funkcja `btn`

```ts
function btn(extra = '')
```

Zwraca klasy Tailwind dla przycisków.

## Funkcja `normalizePrinter`

```ts
function normalizePrinter(data: any): PrinterSettings
```

Do czego służy:

Normalizuje dane drukarki z backendu do formatu używanego w formularzu.

Backend może zwracać:

```ts
data.printer
```

albo same dane. Funkcja obsługuje oba przypadki.

Zwraca:

- `labelPrinterName`,
- `labelPrinterFormat`,
- `labelPrinterDpi`,
- `labelPrinterWidthMm`,
- `labelPrinterHeightMm`.

Liczby zamienia na stringi, bo inputy React trzymają string.

## Komponent `AccountPage`

Główna strona konta.

## Stała `user`

```ts
const user = useUser()
```

Dane zalogowanego użytkownika.

## Stała `params`

```ts
const params = useSearchParams()
```

Odczytuje query string, np. `?connected=1` albo `?error=...` po OAuth Allegro.

## Stan `allegroAccounts`

```ts
const [allegroAccounts, setAllegroAccounts] = useState<any[]>([])
```

Lista kont Allegro użytkownika.

## Stan `inpostAccounts`

```ts
const [inpostAccounts, setInpostAccounts] = useState<any[]>([])
```

Lista kont InPost ShipX użytkownika.

## Stan `showAddPanel`

Pokazuje/ukrywa panel dodawania integracji.

## Stan `showInpostForm`

Pokazuje/ukrywa formularz dodania konta InPost ShipX.

## Stan `inpostForm`

```ts
const [inpostForm, setInpostForm] = useState({ accountName: '', organizationId: '', apiToken: '' })
```

Pola formularza InPost:

- `accountName`,
- `organizationId`,
- `apiToken`.

## Stan `inpostMsg`

Komunikat testu/połączenia InPost.

## Stan `inpostTesting`

Czy trwa testowanie danych InPost.

## Stan `inpostConnecting`

Czy trwa podłączanie konta InPost.

## Stan `printer`

```ts
const [printer, setPrinter] = useState<PrinterSettings>({...})
```

Stan formularza drukarki.

Domyślnie:

- format `zpl`,
- DPI `203`,
- rozmiar `100 x 150`.

## Stan `printerLoading`

Czy trwa pobieranie ustawień drukarki.

## Stan `printerSaving`

Czy trwa zapis/usuwanie drukarki.

## Stan `printerMsg`

Komunikat sekcji drukarki.

## Stała `connectedOk`

```ts
const connectedOk = params.get('connected')
```

Informacja z URL, że Allegro połączyło się poprawnie.

## Stała `connectedError`

```ts
const connectedError = params.get('error')
```

Błąd z URL po OAuth Allegro.

## `useEffect`

Po załadowaniu strony:

1. pobiera konta Allegro,
2. pobiera konta InPost,
3. pobiera ustawienia drukarki.

## Funkcja `loadPrinter`

Wywołuje:

```txt
GET /users/me/printer
```

Ustawia stan `printer`.

## Funkcja `savePrinter`

Wywołuje:

```txt
PATCH /users/me/printer
```

Wysyła:

- nazwę drukarki,
- format,
- DPI,
- szerokość,
- wysokość.

Jeśli `labelPrinterName` jest pusty, wysyła `null`.

## Funkcja `removePrinter`

Usuwa drukarkę z profilu przez wysłanie:

```ts
labelPrinterName: null
```

oraz przywraca domyślne wartości.

## Funkcja `testInpost`

Wywołuje:

```txt
POST /integrations/inpost/shipx/test-credentials
```

Sprawdza, czy `organizationId` i `apiToken` są poprawne.

## Funkcja `connectInpost`

Wywołuje:

```txt
POST /integrations/inpost/shipx/connect
```

Zapisuje konto ShipX w backendzie.

## Funkcja `setIP`

```ts
const setIP = (k: string, v: string) => setInpostForm((f) => ({ ...f, [k]: v }))
```

Aktualizuje pole formularza InPost.

## Funkcja `setPrinterField`

```ts
const setPrinterField = (k: keyof PrinterSettings, v: string) => {
  setPrinter((p) => ({ ...p, [k]: v }))
  setPrinterMsg('')
}
```

Aktualizuje pole drukarki i czyści komunikat.

## Stała `printerConfigured`

```ts
const printerConfigured = Boolean(printer.labelPrinterName.trim())
```

Określa, czy drukarka jest skonfigurowana.

---

# 13. `frontend/src/app/(app)/dashboard/page.tsx`

## Rola pliku

Dashboard zamówień. Pokazuje segmenty zamówień i pozwala synchronizować Allegro.

## Stała `TABS`

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

Lista zakładek dashboardu.

Pola:

- `key` — klucz zgodny z backendowym `lists[key]`.
- `label` — nazwa widoczna w UI.
- `color` — klasa Tailwind dla kropki koloru.

## Typ `OrderItem`

Opisuje produkt w zamówieniu:

- `productName`,
- `productImageUrl`,
- `quantity`,
- `externalOfferId`.

## Funkcja `groupItems`

Grupuje produkty po:

```txt
productName | productImageUrl | externalOfferId
```

Jeśli produkt występuje kilka razy, sumuje quantity.

## Komponent `OrderImages`

Pokazuje zdjęcie pierwszego produktu.

Jeśli brak produktu, pokazuje ikonę paczki.

Jeśli ilość > 1, pokazuje badge `xN`.

## Funkcja `getStatusBadge`

Zwraca kolorowy badge statusu.

Logika:

- statusy wysłane → zielony,
- anulowane → czerwony,
- `BOUGHT` → żółty,
- inne → niebieski.

## Komponent `OrderRow`

Pojedynczy wiersz zamówienia.

Po kliknięciu przechodzi do:

```txt
/orders/:id
```

## Komponent `DashboardPage`

Główna strona dashboardu.

## Stan `data`

Przechowuje odpowiedź z `/orders/segments`.

## Stan `tab`

Aktywna zakładka. Domyślnie `inpost`.

## Stan `loading`

Czy dashboard się ładuje.

## Stan `syncing`

Czy trwa synchronizacja Allegro.

## Stan `syncMsg`

Komunikat po synchronizacji.

## Funkcja `loadSegments`

Wywołuje:

```txt
GET /orders/segments?limit=100
```

Zapisuje odpowiedź w `data`.

## `useEffect`

Po wejściu na dashboard wywołuje `loadSegments()`.

## Funkcja `sync`

Wywołuje:

```txt
POST /integrations/allegro/orders/sync-all
```

Po sukcesie odświeża segmenty.

## Stała `summary`

```ts
const summary = data?.summary || {}
```

Liczniki zakładek.

## Stała `lists`

```ts
const lists = data?.lists || {}
```

Listy zamówień per zakładka.

## Stała `orders`

```ts
const orders: any[] = lists[tab] || []
```

Zamówienia dla aktualnej zakładki.

---

# 14. `frontend/src/app/(app)/orders/[id]/page.tsx`

## Rola pliku

Strona szczegółów zamówienia, formularz nadania przesyłki, pobieranie etykiet i drukowanie ZPL przez QZ Tray.

## Typ `ShipmentTabKey`

```ts
type ShipmentTabKey = 'ALLEGRO' | 'INPOST_COURIER' | 'INPOST_LOCKER' | 'TEMU_SHIPPING' | 'OTHER'
```

Opis:

Możliwe zakładki formularza przesyłki.

## Typ `ParcelRow`

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

Jedna podpaczka w formularzu.

## Stała `TAB_LABELS`

Mapuje klucz zakładki na nazwę widoczną w UI.

## Stała `TAB_ORDER`

Określa kolejność zakładek.

## Stała `LOCKER_SIZE_DIMENSIONS`

Mapuje gabaryty Paczkomatu na techniczne wymiary wysyłane do backendu:

- `A` → 64 × 38 × 8,
- `B` → 64 × 38 × 19,
- `C` → 64 × 38 × 41.

## Stała `INPOST_LOCKER_SIZES`

Lista gabarytów wyświetlana jako radio buttony.

Każdy element ma:

- `key`,
- `label`,
- `hint`.

## Stała `PACKAGE_TEMPLATES`

Szablony wymiarów dla Allegro i InPost Kurier.

Używane do szybkiego uzupełniania paczki.

## Funkcja `inputClass`

Zwraca klasy Tailwind dla inputów.

## Funkcja `selectClass`

Zwraca klasy Tailwind dla selectów.

## Komponent `Field`

Mały wrapper pola formularza.

Pokazuje:

- label,
- children,
- error.

## Funkcja `money`

Formatuje wartość liczbową jako kwotę.

## Funkcja `datePL`

Formatuje datę po polsku.

## Funkcja `compactId`

Skraca długi externalOrderId.

## Funkcja `toText`

Bezpiecznie konwertuje wartość na string.

## Funkcja `getInitialParcels`

Tworzy startową listę paczek na podstawie defaultów z backendu.

## Funkcja `calculateVolumetricWeight`

Liczy wagę gabarytową:

```txt
length * width * height / 6000
```

## Komponent `Card`

Wrapper UI dla białej karty.

## Komponent `SectionTitle`

Nagłówek sekcji.

## Komponent `MoneyInput`

Input kwoty z dopiskiem `PLN`.

## Komponent `OrderDetailPage`

Główna strona szczegółów.

## Stała `id`

```ts
const { id } = useParams()
```

ID zamówienia z URL.

## Stała `router`

```ts
const router = useRouter()
```

Nawigacja.

## Stan `order`

Dane zamówienia z `/orders/:id`.

## Stan `options`

Dane formularza przesyłki z `/shipments/orders/:id/options`.

## Stan `loading`

Czy strona się ładuje.

## Stan `error`

Błąd ładowania strony.

## Stan `activeTab`

Aktywna zakładka przesyłki.

## Stan `form`

Główne dane formularza przesyłki.

Zawiera m.in.:

- `shippingAccountId`,
- `marketplaceAccountId`,
- `deliveryMethodId`,
- `credentialsId`,
- `parcelSize`,
- `codAmount`,
- `insuranceAmount`,
- `description`,
- `reference`,
- checkboxy usług dodatkowych.

## Stan `parcels`

Lista podpaczęk.

Obecnie backend używa pierwszej paczki, ale UI jest przygotowane na wielopaczkowość.

## Stan `sending`

Czy trwa nadawanie przesyłki.

## Stan `result`

Wynik nadania przesyłki.

## Stan `fieldErrors`

Błędy walidacji formularza.

## Stan `showAdvanced`

Pokazuje/ukrywa pola techniczne:

- opis zawartości,
- numer referencyjny.

## Stan `printingShipmentId`

ID przesyłki, która aktualnie jest drukowana.

Jeśli null, nic się nie drukuje.

## Stan `printMsg`

Komunikat sukcesu/błędu drukowania.

## `useEffect`

Po wejściu na stronę:

1. pobiera `/orders/:id`,
2. pobiera `/shipments/orders/:id/options`,
3. ustawia `activeTab`,
4. ustawia defaulty formularza,
5. ustawia paczki.

## Stała `o`

```ts
const o = order?.order || order
```

Normalizuje strukturę zamówienia.

## Stała `items`

Produkty zamówienia.

## Stała `receiver`

Odbiorca z `/options`.

## Stała `tabs`

Zakładki z backendu.

## Stała `allegroServices`

Usługi Wysyłam z Allegro.

## Stała `inpostAccounts`

Konta InPost ShipX użytkownika.

## Stała `existingShipments`

Przesyłki już utworzone dla zamówienia.

## Stała `activeTabInfo`

Obiekt aktualnej zakładki z `tabs`.

## Stała `firstParcel`

Pierwsza paczka z listy `parcels`.

## Stała `volumetricWeight`

Waga gabarytowa pierwszej paczki.

## Funkcja `setF`

Aktualizuje pole `form` i czyści błąd pola.

## Funkcja `updateParcel`

Aktualizuje pole wybranej paczki.

## Funkcja `applyTemplate`

Po wybraniu szablonu uzupełnia wagę/wymiary paczki.

## Funkcja `addParcel`

Dodaje podpaczę w UI.

## Funkcja `removeParcel`

Usuwa podpaczę, ale nie pozwala usunąć ostatniej.

## Funkcja `getEffectiveParcel`

Dla `INPOST_LOCKER` zwraca paczkę wynikającą z gabarytu.

Dla innych zakładek zwraca pierwszą paczkę z formularza.

## Funkcja `validate`

Waliduje formularz przed nadaniem.

Dla `ALLEGRO` wymaga kuriera/metody.

Dla InPost wymaga konta ShipX.

Dla Paczkomatu wymaga gabarytu.

Dla Allegro/InPost Kurier wymaga wagi i wymiarów.

## Funkcja `submitShipment`

Wysyła realne nadanie przesyłki:

```txt
POST /shipments/orders/:id/create
```

Buduje payload z:

- `mode`,
- `shippingAccountId`,
- `parcelSize`,
- `weightKg`,
- `lengthCm`,
- `widthCm`,
- `heightCm`,
- `labelFormat`,
- `deliveryMethodId`,
- `credentialsId`,
- `description`,
- `reference`,
- `insuranceAmount`,
- `codAmount`,
- `returnLabel`.

## Funkcja `labelUrl`

Buduje link do etykiety.

Przykłady:

```txt
/shipments/2/label?format=pdf-a6
/shipments/2/label?format=zpl
```

## Funkcja `printShipmentLabel`

Drukuje etykietę.

Co robi:

1. Czyści komunikat.
2. Ustawia `printingShipmentId`.
3. Pobiera drukarkę z `/users/me/printer`.
4. Jeśli nie ma drukarki, pokazuje błąd.
5. Pobiera ZPL przez `fetchTextFile`.
6. Wywołuje `printZplWithQz`.
7. Pokazuje sukces albo błąd.
8. Czyści `printingShipmentId`.

## Funkcja `renderInpostLabelButtons`

Renderuje przyciski dla InPost:

- `Pobierz PDF A6`,
- `Pobierz ZPL`,
- `Drukuj etykietę`.

Parametr `size`:

- `normal` — pełne nazwy przycisków po nadaniu,
- `small` — krótkie nazwy w panelu istniejących przesyłek.

---

# 15. Najważniejsze aktualne zachowanie systemu

## 15.1. Po udanym nadaniu paczki

Backend tworzy przesyłkę, a potem próbuje ustawić w Allegro:

```txt
READY_FOR_SHIPMENT
```

Jeśli się uda, response ma:

```json
"fulfillmentUpdate": {
  "ok": true,
  "status": "READY_FOR_SHIPMENT"
}
```

## 15.2. Dashboard po statusie `READY_FOR_SHIPMENT`

Zamówienie powinno trafić do zakładki:

```txt
Wysłane
```

## 15.3. Drukarka

Drukarka jest przypisana do usera przez:

```txt
GET /users/me/printer
PATCH /users/me/printer
```

## 15.4. Drukowanie

Przycisk `Drukuj etykietę` działa tak:

1. pobiera drukarkę,
2. pobiera ZPL,
3. wysyła ZPL do QZ Tray,
4. QZ Tray drukuje na zapisanej drukarce.

## 15.5. PDF A6

PDF A6 jest tylko opcją awaryjną/podglądem. Dla Zebra GC420d najważniejszy jest ZPL.

---

# 16. Pliki, których faktycznej treści nie mam

## `database/docker-compose.yml`

Nie otrzymałem treści tego pliku, więc nie mogę opisać konkretnych stałych, portów, usług, wolumenów ani zmiennych środowiskowych z tego pliku.

Mogę go dokładnie opisać dopiero po wklejeniu albo przesłaniu jego zawartości.

