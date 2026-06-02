use serde::Deserialize;
use sqlx::SqlitePool;
use std::error::Error;

const ALLEGRO_API_BASE: &str = "https://api.allegro.pl";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// NAGŁÓWKI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

fn allegro_headers(token: &str) -> reqwest::header::HeaderMap {
    use reqwest::header::{HeaderMap, ACCEPT, AUTHORIZATION, CONTENT_TYPE};
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, format!("Bearer {}", token).parse().unwrap());
    headers.insert(ACCEPT, "application/vnd.allegro.public.v1+json".parse().unwrap());
    headers.insert(CONTENT_TYPE, "application/vnd.allegro.public.v1+json".parse().unwrap());
    headers
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STRUKTURY — API Allegro (camelCase → snake_case przez serde)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutFormsPage {
    pub checkout_forms: Vec<OrderForm>,
    pub count: i32,
    pub total_count: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderForm {
    pub id: String,
    pub status: String,
    pub revision: Option<String>,
    pub message_to_seller: Option<String>,
    pub buyer: Buyer,
    pub payment: Option<Payment>,
    pub fulfillment: Fulfillment,
    pub delivery: Delivery,
    pub invoice: Invoice,
    pub line_items: Vec<LineItem>,
    pub marketplace: Marketplace,
    pub summary: Summary,
    pub updated_at: String,
    // pola ustawiane po stronie aplikacji — pomijane przy deserializacji
    #[serde(skip)]
    pub raw_json: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Buyer {
    pub id: String,
    pub email: String,
    pub login: String,
    pub first_name: String,
    pub last_name: String,
    pub company_name: Option<String>,
    pub phone_number: String,
    pub guest: Option<bool>,
    pub address: BuyerAddress,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuyerAddress {
    pub street: String,
    pub city: String,
    pub post_code: String,
    pub country_code: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Payment {
    pub id: Option<String>,
    pub r#type: Option<String>,
    pub provider: Option<String>,
    pub finished_at: Option<String>,
    pub paid_amount: Option<Money>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fulfillment {
    pub status: String,
    pub shipment_summary: Option<ShipmentSummary>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipmentSummary {
    pub line_items_sent: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Delivery {
    // adres jest tylko przy READY_FOR_PROCESSING
    pub address: Option<DeliveryAddress>,
    pub method: DeliveryMethod,
    pub cost: Money,
    pub pickup_point: Option<PickupPoint>,
    pub smart: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryAddress {
    pub first_name: String,
    pub last_name: String,
    pub street: String,
    pub city: String,
    pub zip_code: String,
    pub country_code: String,
    pub company_name: Option<String>,
    pub phone_number: String,
}

#[derive(Debug, Deserialize)]
pub struct DeliveryMethod {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct PickupPoint {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct Invoice {
    pub required: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineItem {
    pub id: String,
    pub offer: OfferRef,
    pub quantity: i32,
    pub original_price: Money,
    pub price: Money,
    pub bought_at: String,
    // pola ustawiane po stronie aplikacji
    #[serde(skip)]
    pub allegro_url: Option<String>,
    #[serde(skip)]
    pub image_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OfferRef {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct Marketplace {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub total_to_pay: Money,
}

#[derive(Debug, Deserialize)]
pub struct Money {
    pub amount: String,
    pub currency: String,
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STRUKTURY — zdjęcia produktu (GET /sale/products/{productId})
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[derive(Debug, Deserialize)]
struct ProductImages {
    images: Vec<ProductImage>,
}

#[derive(Debug, Deserialize)]
struct ProductImage {
    url: String,
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER — URL zdjęcia oferty z cache 24h
//
// Logika:
//   1. Szukaj w offer_images dla danego offer_id
//   2. Jeśli wpis istnieje i ma < 24h → zwróć z cache, bez requestu do API
//   3. Jeśli brak lub wygasł → pobierz z API, zapisz z nowym last_updated
//
// Dzięki temu zdjęcia są aktualne (użytkownik widzi zmiany po maks. 24h)
// ale nie robimy zbędnych requestów przy każdym odświeżeniu zamówień.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async fn get_image_url(
    client: &reqwest::Client,
    token: &str,
    offer_id: &str,
    pool: &SqlitePool,
) -> Option<String> {
    // 1. Sprawdź cache — czy istnieje i czy ma mniej niż 24 godziny
    let cached: Option<(String, bool)> = sqlx::query_as(
        "SELECT image_url,
                (julianday('now') - julianday(last_updated)) < 1.0 AS is_fresh
         FROM offer_images
         WHERE offer_id = ?",
    )
    .bind(offer_id)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    if let Some((url, is_fresh)) = cached {
        if is_fresh {
            // trafienie w świeży cache — brak requestu do API
            return Some(url);
        }
        // cache wygasł — spadamy niżej żeby odświeżyć
    }

    // 2. Pobierz z API produktu
    let res = client
        .get(format!("{}/sale/products/{}", ALLEGRO_API_BASE, offer_id))
        .headers(allegro_headers(token))
        .send()
        .await;

    // mały throttle żeby nie zbombardować Leaky Bucket
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    let image_url = match res {
        Ok(r) if r.status().is_success() => r
            .json::<ProductImages>()
            .await
            .ok()
            .and_then(|p| p.images.into_iter().next())
            .map(|img| img.url),
        Ok(r) => {
            eprintln!(
                "Błąd API przy pobieraniu zdjęcia offer_id={}: {}",
                offer_id,
                r.status()
            );
            None
        }
        Err(e) => {
            eprintln!(
                "Błąd sieci przy pobieraniu zdjęcia offer_id={}: {}",
                offer_id, e
            );
            None
        }
    };

    // 3. Zapisz do cache tylko jeśli dostaliśmy URL (nie nadpisuj starym None)
    if let Some(ref url) = image_url {
        let _ = sqlx::query(
            "INSERT OR REPLACE INTO offer_images (offer_id, image_url, last_updated)
             VALUES (?, ?, datetime('now'))",
        )
        .bind(offer_id)
        .bind(url)
        .execute(pool)
        .await;
    }

    image_url
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER — zapis / aktualizacja zamówienia (wszystkie kolumny schematu)
//
// ON CONFLICT aktualizuje wszystko co może się zmienić po czasie
// (status, fulfillment, adres dostawy, płatność, raw_data, synced_at).
// Pola stałe (buyer_*, marketplace, invoice, order_created_at) są
// zostawiane bez zmian żeby nie tracić danych z pierwszego zapisu.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async fn save_order(
    order: &OrderForm,
    allegro_account_id: &str,
    pool: &SqlitePool,
) -> Result<i64, Box<dyn Error>> {
    let da = order.delivery.address.as_ref(); // delivery address shorthand
    let pay = order.payment.as_ref();         // payment shorthand

    // order_created_at: Allegro nie ma osobnego pola — bierzemy najwcześniejsze bought_at
    let order_created_at = order
        .line_items
        .iter()
        .map(|li| li.bought_at.as_str())
        .min();

    let order_db_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO orders (
            allegro_account_id,
            external_order_id,
            external_order_status,
            external_fulfillment_status,
            external_line_items_sent,
            external_revision,
            marketplace_site_id,
            message_to_seller,
            buyer_id,
            buyer_login,
            buyer_email,
            buyer_first_name,
            buyer_last_name,
            buyer_company_name,
            buyer_phone,
            buyer_guest,
            delivery_method_id,
            delivery_method_name,
            delivery_first_name,
            delivery_last_name,
            delivery_street,
            delivery_city,
            delivery_zip_code,
            delivery_country_code,
            delivery_phone,
            pickup_point_id,
            pickup_point_name,
            delivery_cost,
            delivery_currency,
            delivery_smart,
            payment_id,
            payment_type,
            payment_provider,
            payment_finished_at,
            payment_amount,
            payment_currency,
            total_to_pay,
            total_amount,
            currency,
            invoice_required,
            order_created_at,
            external_updated_at,
            synced_at,
            raw_data
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, datetime('now'), ?
        )
        ON CONFLICT(allegro_account_id, external_order_id) DO UPDATE SET
            external_order_status       = excluded.external_order_status,
            external_fulfillment_status = excluded.external_fulfillment_status,
            external_line_items_sent    = excluded.external_line_items_sent,
            external_revision           = excluded.external_revision,
            delivery_method_id          = excluded.delivery_method_id,
            delivery_method_name        = excluded.delivery_method_name,
            delivery_first_name         = excluded.delivery_first_name,
            delivery_last_name          = excluded.delivery_last_name,
            delivery_street             = excluded.delivery_street,
            delivery_city               = excluded.delivery_city,
            delivery_zip_code           = excluded.delivery_zip_code,
            delivery_country_code       = excluded.delivery_country_code,
            delivery_phone              = excluded.delivery_phone,
            pickup_point_id             = excluded.pickup_point_id,
            pickup_point_name           = excluded.pickup_point_name,
            delivery_cost               = excluded.delivery_cost,
            delivery_currency           = excluded.delivery_currency,
            delivery_smart              = excluded.delivery_smart,
            payment_id                  = excluded.payment_id,
            payment_type                = excluded.payment_type,
            payment_provider            = excluded.payment_provider,
            payment_finished_at         = excluded.payment_finished_at,
            payment_amount              = excluded.payment_amount,
            payment_currency            = excluded.payment_currency,
            total_to_pay                = excluded.total_to_pay,
            total_amount                = excluded.total_amount,
            currency                    = excluded.currency,
            external_updated_at         = excluded.external_updated_at,
            synced_at                   = datetime('now'),
            raw_data                    = excluded.raw_data
        RETURNING id
        "#,
    )
    // ── INSERT binds (44 wartości) ──
    .bind(allegro_account_id)                                                            // allegro_account_id
    .bind(&order.id)                                                                     // external_order_id
    .bind(&order.status)                                                                 // external_order_status
    .bind(&order.fulfillment.status)                                                     // external_fulfillment_status
    .bind(order.fulfillment.shipment_summary.as_ref()
          .and_then(|s| s.line_items_sent.as_deref()))                                   // external_line_items_sent
    .bind(order.revision.as_deref())                                                     // external_revision
    .bind(&order.marketplace.id)                                                         // marketplace_site_id
    .bind(order.message_to_seller.as_deref())                                            // message_to_seller
    .bind(&order.buyer.id)                                                               // buyer_id
    .bind(&order.buyer.login)                                                            // buyer_login
    .bind(&order.buyer.email)                                                            // buyer_email
    .bind(&order.buyer.first_name)                                                       // buyer_first_name
    .bind(&order.buyer.last_name)                                                        // buyer_last_name
    .bind(order.buyer.company_name.as_deref())                                           // buyer_company_name
    .bind(&order.buyer.phone_number)                                                     // buyer_phone
    .bind(order.buyer.guest.unwrap_or(false) as i32)                                    // buyer_guest
    .bind(&order.delivery.method.id)                                                     // delivery_method_id
    .bind(&order.delivery.method.name)                                                   // delivery_method_name
    .bind(da.map(|a| a.first_name.as_str()))                                             // delivery_first_name
    .bind(da.map(|a| a.last_name.as_str()))                                              // delivery_last_name
    .bind(da.map(|a| a.street.as_str()))                                                 // delivery_street
    .bind(da.map(|a| a.city.as_str()))                                                   // delivery_city
    .bind(da.map(|a| a.zip_code.as_str()))                                               // delivery_zip_code
    .bind(da.map(|a| a.country_code.as_str()))                                           // delivery_country_code
    .bind(da.map(|a| a.phone_number.as_str()))                                           // delivery_phone
    .bind(order.delivery.pickup_point.as_ref().map(|p| p.id.as_str()))                  // pickup_point_id
    .bind(order.delivery.pickup_point.as_ref().map(|p| p.name.as_str()))                // pickup_point_name
    .bind(&order.delivery.cost.amount)                                                   // delivery_cost
    .bind(&order.delivery.cost.currency)                                                 // delivery_currency
    .bind(order.delivery.smart.unwrap_or(false) as i32)                                 // delivery_smart
    .bind(pay.and_then(|p| p.id.as_deref()))                                             // payment_id
    .bind(pay.and_then(|p| p.r#type.as_deref()))                                         // payment_type
    .bind(pay.and_then(|p| p.provider.as_deref()))                                       // payment_provider
    .bind(pay.and_then(|p| p.finished_at.as_deref()))                                   // payment_finished_at
    .bind(pay.and_then(|p| p.paid_amount.as_ref()).map(|m| m.amount.as_str()))           // payment_amount
    .bind(pay.and_then(|p| p.paid_amount.as_ref()).map(|m| m.currency.as_str()))         // payment_currency
    .bind(&order.summary.total_to_pay.amount)                                            // total_to_pay
    .bind(&order.summary.total_to_pay.amount)                                            // total_amount (to samo — Allegro ma tylko totalToPay)
    .bind(&order.summary.total_to_pay.currency)                                          // currency
    .bind(order.invoice.required as i32)                                                 // invoice_required
    .bind(order_created_at)                                                              // order_created_at
    .bind(&order.updated_at)                                                             // external_updated_at
    .bind(order.raw_json.as_deref())                                                     // raw_data
    .fetch_one(pool)
    .await?;

    // ── pozycje zamówienia ──
    // ON CONFLICT zabezpiecza przed duplikatami przy re-fetchu
    for item in &order.line_items {
        sqlx::query(
            r#"
            INSERT INTO order_items (
                order_db_id,
                external_line_item_id,
                external_offer_id,
                product_name,
                quantity,
                original_price,
                price,
                currency,
                bought_at,
                allegro_url,
                image_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(order_db_id, external_line_item_id) DO UPDATE SET
                quantity      = excluded.quantity,
                price         = excluded.price,
                allegro_url   = excluded.allegro_url,
                image_url     = COALESCE(excluded.image_url, order_items.image_url)
            "#,
        )
        .bind(order_db_id)
        .bind(&item.id)
        .bind(&item.offer.id)
        .bind(&item.offer.name)
        .bind(item.quantity)
        .bind(&item.original_price.amount)
        .bind(&item.price.amount)
        .bind(&item.price.currency)
        .bind(&item.bought_at)
        .bind(&item.allegro_url)
        .bind(&item.image_url)
        .execute(pool)
        .await?;
    }

    Ok(order_db_id)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER — paginacja API
//
// Zwraca surowe serde_json::Value żeby móc jednocześnie:
//   a) deserializować do OrderForm
//   b) zapisywać oryginalne JSON w kolumnie raw_data
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async fn fetch_all_pages(
    client: &reqwest::Client,
    token: &str,
    filters: &[(&str, &str)],
) -> Result<Vec<serde_json::Value>, Box<dyn Error>> {
    let mut all_forms: Vec<serde_json::Value> = Vec::new();
    let mut offset = 0usize;
    let limit = 100usize;

    loop {
        let limit_str = limit.to_string();
        let offset_str = offset.to_string();

        let res = client
            .get(format!("{}/order/checkout-forms", ALLEGRO_API_BASE))
            .headers(allegro_headers(token))
            .query(filters)
            .query(&[("limit", limit_str.as_str()), ("offset", offset_str.as_str())])
            .send()
            .await?;

        if !res.status().is_success() {
            return Err(format!("Błąd API Allegro: {}", res.status()).into());
        }

        let page: serde_json::Value = res.json().await?;

        let forms = match page["checkoutForms"].as_array() {
            Some(arr) => arr.clone(),
            None => return Err("Brak pola checkoutForms w odpowiedzi API".into()),
        };

        let count = forms.len();
        all_forms.extend(forms);

        if count < limit {
            break; // ostatnia strona
        }
        offset += limit;
    }

    Ok(all_forms)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER — parsuj surowy JSON na OrderForm + zachowaj raw_json
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

fn parse_order_form(raw: serde_json::Value) -> Result<OrderForm, serde_json::Error> {
    let raw_str = raw.to_string();
    let mut order: OrderForm = serde_json::from_value(raw)?;
    order.raw_json = Some(raw_str);
    Ok(order)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER — pobiera pojedyncze zamówienie z API (po ID)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async fn fetch_single_order(
    client: &reqwest::Client,
    token: &str,
    order_id: &str,
) -> Result<serde_json::Value, Box<dyn Error>> {
    let res = client
        .get(format!("{}/order/checkout-forms/{}", ALLEGRO_API_BASE, order_id))
        .headers(allegro_headers(token))
        .send()
        .await?;

    if !res.status().is_success() {
        return Err(format!("Błąd API Allegro dla zamówienia {}: {}", order_id, res.status()).into());
    }

    Ok(res.json().await?)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WEWNĘTRZNY — pobierz i zapisz listę zamówień wg filtrów
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async fn fetch_and_save(
    client: &reqwest::Client,
    token: &str,
    allegro_account_id: &str,
    filters: &[(&str, &str)],
    pool: &SqlitePool,
) -> Result<Vec<OrderForm>, Box<dyn Error>> {
    let raw_list = fetch_all_pages(client, token, filters).await?;
    let mut orders: Vec<OrderForm> = Vec::new();

    for raw in raw_list {
        let mut order = parse_order_form(raw)?;

        // uzupełnij allegro_url i image_url dla każdej pozycji
        for item in &mut order.line_items {
            item.allegro_url = Some(format!("https://allegro.pl/oferta/{}", item.offer.id));
            item.image_url = get_image_url(client, token, &item.offer.id.clone(), pool).await;
        }

        save_order(&order, allegro_account_id, pool).await?;
        orders.push(order);
    }

    Ok(orders)
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLICZNE API modułu
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// Zamówienia opłacone, gotowe do wysyłki (fulfillment NEW lub PROCESSING)
async fn get_new_orders(
    client: &reqwest::Client,
    token: &str,
    allegro_account_id: &str,
    pool: &SqlitePool,
) -> Result<Vec<OrderForm>, Box<dyn Error>> {
    fetch_and_save(
        client,
        token,
        allegro_account_id,
        &[
            ("fulfillment.status", "NEW"),
            ("fulfillment.status", "PROCESSING"),
        ],
        pool,
    )
    .await
}

/// Zamówienia nieopłacone (status BOUGHT)
/// Uwaga: delivery.address będzie None — adres pojawia się dopiero przy READY_FOR_PROCESSING
async fn get_unsettled_orders(
    client: &reqwest::Client,
    token: &str,
    allegro_account_id: &str,
    pool: &SqlitePool,
) -> Result<Vec<OrderForm>, Box<dyn Error>> {
    fetch_and_save(
        client,
        token,
        allegro_account_id,
        &[("status", "BOUGHT")],
        pool,
    )
    .await
}

/// Odświeża oba zestawy zamówień w bazie.
/// Wywołuj np. co 5 minut — save_order używa ON CONFLICT więc bezpieczne.
pub async fn get_orders(
    client: &reqwest::Client,
    token: &str,
    allegro_account_id: &str,
    pool: &SqlitePool,
) -> Result<(), Box<dyn Error>> {
    // 1. Pobieramy zamówienia (Twój ON CONFLICT wewnątrz fetch_and_save zaktualizuje wszystko co trzeba)
    let unsettled = get_unsettled_orders(client, token, allegro_account_id, pool).await?;
    let new_orders = get_new_orders(client, token, allegro_account_id, pool).await?;
    
    // Zbieramy do jednego worka wszystkie ID, które Allegro uważa teraz za BOUGHT/NEW/PROCESSING
    let mut active_api_ids: Vec<String> = Vec::new();
    active_api_ids.extend(unsettled.into_iter().map(|o| o.id));
    active_api_ids.extend(new_orders.into_iter().map(|o| o.id));

    // 2. Pytamy NASZĄ BAZĘ: "Jakie zamówienia wciąż uważasz za aktywne?"
    let db_active_ids: Vec<String> = sqlx::query_scalar(
        r#"SELECT external_order_id FROM orders 
           WHERE allegro_account_id = ? 
           AND (external_fulfillment_status IN ('NEW', 'PROCESSING') OR external_order_status = 'BOUGHT')"#
    )
    .bind(allegro_account_id)
    .fetch_all(pool)
    .await?;

    // 3. Wyłapujemy różnicę. Jeśli baza uważa, że zamówienie jest NEW, a API go nie zwróciło, 
    // to znaczy, że musiało zmienić status (np. na SENT lub CANCELED).
    let missing_ids: Vec<String> = db_active_ids
        .into_iter()
        .filter(|db_id| !active_api_ids.contains(db_id))
        .collect();

    // 4. Pobieramy dane TYLKO dla tych kilku brakujących zamówień
    if !missing_ids.is_empty() {
        println!("Znaleziono {} zamówień, które opuściły status NEW/BOUGHT. Dociągam detale...", missing_ids.len());
        
        for order_id in missing_ids {
            let raw = fetch_single_order(client, token, &order_id).await?; // Z użyciem funkcji z mojej poprzedniej odpowiedzi
            
            // Parsujemy i zapisujemy używając ON CONFLICT
            if let Ok(order) = parse_order_form(raw) {
                save_order(&order, allegro_account_id, pool).await?;
            }
            // mały throttle 
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
    }

    Ok(())
}