use serde::Deserialize;
use sqlx::SqlitePool;
use std::error::Error;

// ── allegro types ───────────────────────────────────────────────────────────
const ALLEGRO_API_BASE: &str = "https://api.allegro.pl";

fn allegro_headers(token: &str) -> reqwest::header::HeaderMap {
    use reqwest::header::{HeaderMap, ACCEPT, AUTHORIZATION, CONTENT_TYPE};
    let mut headers = HeaderMap::new();
    headers.insert(AUTHORIZATION, format!("Bearer {}", token).parse().unwrap());
    headers.insert(ACCEPT, "application/vnd.allegro.public.v1+json".parse().unwrap());
    headers.insert(CONTENT_TYPE, "application/vnd.allegro.public.v1+json".parse().unwrap());
    headers
}


// ── Wspólne typy ────────────────────────────────────────────────────────────
 
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Money {
    pub amount: String,
    pub currency: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutFormsPage {
    pub checkout_forms: Vec<OrderForm>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderForm {
    pub id: String,
    pub message_to_seller: Option<String>,
    pub buyer: Buyer,
    pub payment: Payment,
    pub status: String,
    pub fulfillment: Fulfillment,
    pub delivery: Delivery,
    pub invoice: Invoice,
    pub line_items: Vec<LineItem>,
    pub marketplace: Marketplace,
    pub summary: Summary,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Buyer {
    pub id: String,
    pub email: Option<String>,
    pub login: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company_name: Option<String>,
    pub guest: bool,
    pub personal_identity: Option<String>,
    pub phone_number: Option<String>,
    pub preferences: Option<BuyerPreferences>,
    pub address: Option<BuyerAddress>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuyerPreferences {
    pub language: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuyerAddress {
    pub street: Option<String>,
    pub city: Option<String>,
    pub post_code: Option<String>,
    pub country_code: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Payment {
    pub id: String,
    pub r#type: Option<String>,
    pub provider: Option<String>,
    pub finished_at: Option<chrono::DateTime<chrono::Utc>>,
    pub paid_amount: Option<Money>,
    pub reconciliation: Option<Money>,
    pub features: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Delivery {
    pub address: Option<DeliveryAddress>,
    pub method: Option<DeliveryMethod>,
    pub pickup_point: Option<PickupPoint>,
    pub cost: Option<Money>,
    pub smart: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryAddress {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub street: Option<String>,
    pub city: Option<String>,
    pub zip_code: Option<String>,
    pub country_code: Option<String>,
    pub company_name: Option<String>,
    pub phone_number: Option<String>,
    pub modified_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeliveryMethod {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickupPoint {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub address: Option<PickupAddress>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickupAddress {
    pub street: Option<String>,
    pub zip_code: Option<String>,
    pub city: Option<String>,
    pub country_code: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Invoice {
    pub required: bool,
    pub address: Option<InvoiceAddress>,
    pub due_date: Option<chrono::NaiveDate>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceAddress {
    pub street: Option<String>,
    pub city: Option<String>,
    pub zip_code: Option<String>,
    pub country_code: Option<String>,
    pub company: Option<InvoiceCompany>,
    pub natural_person: Option<InvoiceNaturalPerson>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceCompany {
    pub name: Option<String>,
    pub ids: Option<Vec<InvoiceId>>,
    pub vat_payer_status: Option<String>,
    pub tax_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceId {
    pub r#type: String,
    pub value: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvoiceNaturalPerson {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Marketplace {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub total_to_pay: Option<Money>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineItem {
    pub id: String,
    pub offer: Offer,
    pub quantity: Option<u32>,
    pub original_price: Option<Money>,
    pub price: Option<Money>,
    pub deposit: Option<Deposit>,
    pub reconciliation: Option<Reconciliation>,
    pub selected_additional_services: Option<Vec<AdditionalService>>,
    pub vouchers: Option<Vec<Voucher>>,
    pub tax: Option<Tax>,
    pub bought_at: chrono::DateTime<chrono::Utc>,
    pub discounts: Option<Vec<Discount>>,
    pub serial_numbers: Option<SerialNumbers>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Offer {
    pub id: String,
    pub name: String,
    pub external: Option<ExternalId>,
    pub product_set: Option<ProductSet>,
    pub hs_number: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalId {
    pub id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductSet {
    pub products: Option<Vec<Product>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    pub id: String,
    pub quantity: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Deposit {
    pub price: Option<Money>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reconciliation {
    pub value: Option<Money>,
    pub r#type: Option<String>,
    pub quantity: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdditionalService {
    pub definition_id: Option<String>,
    pub name: Option<String>,
    pub price: Option<Money>,
    pub quantity: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Voucher {
    pub code: Option<String>,
    pub r#type: Option<String>,
    pub status: Option<String>,
    pub external_transaction_id: Option<String>,
    pub value: Option<Money>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tax {
    pub rate: Option<String>,
    pub subject: Option<String>,
    pub exemption: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Discount {
    pub r#type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialNumbers {
    pub expected: Option<bool>,
    pub entries: Option<Vec<SerialNumberEntry>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SerialNumberEntry {
    pub value: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fulfillment {
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct ProductOfferResponse {
    pub images: String,
}


//zapisywanie zamowien juz
//SAVE ORDER(order+image_url)
async fn save_order(
    order: &OrderForm,
    image_url: &str,
    allegro_login: &str,
    pool: &SqlitePool,
) -> Result<i64, Box<dyn Error + Send + Sync>> {
    let mut tx = pool.begin().await?;

    // ── BUYER ─────────────────────────────────────────────────────────────
    let buyer_db_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO buyers (
            buyer_id, buyer_login, buyer_email,
            buyer_first_name, buyer_last_name, buyer_company_name,
            buyer_street, buyer_city, buyer_zip_code, buyer_country, buyer_phone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
        "#,
    )
    .bind(&order.buyer.id)
    .bind(&order.buyer.login)
    .bind(&order.buyer.email)
    .bind(&order.buyer.first_name)
    .bind(&order.buyer.last_name)
    .bind(&order.buyer.company_name)
    .bind(order.buyer.address.as_ref().map(|a| &a.street))
    .bind(order.buyer.address.as_ref().map(|a| &a.city))
    .bind(order.buyer.address.as_ref().map(|a| &a.post_code))
    .bind(order.buyer.address.as_ref().map(|a| &a.country_code))
    .bind(&order.buyer.phone_number)
    .fetch_one(&mut *tx)
    .await?;
 
    // ── DELIVERY ───────────────────────────────────────────────────────────
    let delivery_db_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO delivery (
            delivery_method_id, delivery_method_name,
            delivery_first_name, delivery_last_name,
            delivery_street, delivery_city, delivery_zip_code,
            delivery_country_code, delivery_company, delivery_phone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
        "#,
    )
    .bind(order.delivery.method.as_ref().map(|m| &m.id))
    .bind(order.delivery.method.as_ref().map(|m| &m.name))
    .bind(order.delivery.address.as_ref().map(|a| &a.first_name))
    .bind(order.delivery.address.as_ref().map(|a| &a.last_name))
    .bind(order.delivery.address.as_ref().map(|a| &a.street))
    .bind(order.delivery.address.as_ref().map(|a| &a.city))
    .bind(order.delivery.address.as_ref().map(|a| &a.zip_code))
    .bind(order.delivery.address.as_ref().map(|a| &a.country_code))
    .bind(order.delivery.address.as_ref().map(|a| &a.company_name))
    .bind(order.delivery.address.as_ref().map(|a| &a.phone_number))
    .fetch_one(&mut *tx)
    .await?;
 
    // ── INVOICE ────────────────────────────────────────────────────────────
    let invoice_db_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO invoices (
            required, street, city, zip_code, country,
            company, company_id_type, company_id_value,
            vat_payer_status, tax_id,
            first_name, last_name, due_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
        "#,
    )
    .bind(order.invoice.required)
    .bind(&order.invoice.address.as_ref().map(|a| &a.street))
    .bind(order.invoice.address.as_ref().map(|a| &a.street))
    .bind(order.invoice.address.as_ref().map(|a| &a.city))
    .bind(order.invoice.address.as_ref().map(|a| &a.zip_code))
    .bind(order.invoice.address.as_ref().map(|a| &a.country_code))

    // company — Option<InvoiceCompany>
    .bind(order.invoice.address.as_ref().and_then(|a| a.company.as_ref()).map(|c| &c.name))
    .bind(order.invoice.address.as_ref().and_then(|a| a.company.as_ref()).and_then(|c| c.ids.as_deref()).and_then(|ids| ids.first()).map(|i| &i.r#type))
    .bind(order.invoice.address.as_ref().and_then(|a| a.company.as_ref()).and_then(|c| c.ids.as_deref()).and_then(|ids| ids.first()).map(|i| &i.value))
    .bind(order.invoice.address.as_ref().and_then(|a| a.company.as_ref()).map(|c| &c.vat_payer_status))
    .bind(order.invoice.address.as_ref().and_then(|a| a.company.as_ref()).map(|c| &c.tax_id))
    
    // natural_person — Option<InvoiceNaturalPerson> wewnątrz Option<Address>
    .bind(order.invoice.address.as_ref().and_then(|a| a.natural_person.as_ref()).map(|p| &p.first_name))
    .bind(order.invoice.address.as_ref().and_then(|a| a.natural_person.as_ref()).map(|p| &p.last_name))
    
    .bind(order.invoice.due_date.as_ref().map(|d| d.to_string()))
    .fetch_one(&mut *tx)
    .await?;
 
    // ── PICKUP (opcjonalny) ────────────────────────────────────────────────
    let pickup_db_id: Option<i64> = if let Some(pickup) = &order.delivery.pickup_point {
        let id: i64 = sqlx::query_scalar(
            r#"
            INSERT INTO pickup_details (
                pickup_point_id, pickup_name, pickup_description,
                pickup_street, pickup_zip_code, pickup_city, pickup_country
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            "#,
        )
        .bind(&pickup.id)
        .bind(&pickup.name)
        .bind(&pickup.description)
        .bind(pickup.address.as_ref().map(|a| &a.street))
        .bind(pickup.address.as_ref().map(|a| &a.zip_code))
        .bind(pickup.address.as_ref().map(|a| &a.city))
        .bind(pickup.address.as_ref().map(|a| &a.country_code))
        .fetch_one(&mut *tx)
        .await?;
        Some(id)
    } else {
        None
    };
 
    // ── PAYMENT ────────────────────────────────────────────────────────────
    let payment_db_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO payment_details (
            payment_id, payment_type, payment_provider,
            payment_finished_at, payment_amount, payment_currency
        ) VALUES (?, ?, ?, ?, ?, ?)
        RETURNING id
        "#,
    )
    .bind(&order.payment.id)
    .bind(&order.payment.r#type)
    .bind(&order.payment.provider)
    .bind(order.payment.finished_at.map(|dt| dt.to_rfc3339()))
    .bind(order.payment.paid_amount.as_ref().map(|m| &m.amount))
    .bind(order.payment.paid_amount.as_ref().map(|m| &m.currency))
    .fetch_one(&mut *tx)
    .await?;
 
    // ── ORDERS ─────────────────────────────────────────────────────────────
    let order_db_id: i64 = sqlx::query_scalar(
        r#"
        INSERT INTO orders (
            account_name, external_order_id, marketplace,
            message_to_seller, pickup_id,
            delivery_cost, delivery_currency,
            status, fulfillment_status,
            payment_detail_id, total_to_pay, currency,
            external_updated_at,
            buyer_id, delivery_id, invoice_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_name, external_order_id) DO UPDATE SET
            status              = excluded.status,
            fulfillment_status  = excluded.fulfillment_status,
            pickup_id           = excluded.pickup_id,
            delivery_cost       = excluded.delivery_cost,
            delivery_currency   = excluded.delivery_currency,
            payment_detail_id   = excluded.payment_detail_id,
            total_to_pay        = excluded.total_to_pay,
            currency            = excluded.currency,
            external_updated_at = excluded.external_updated_at,
            buyer_id            = excluded.buyer_id,
            delivery_id         = excluded.delivery_id,
            invoice_id          = excluded.invoice_id
        RETURNING id
        "#,
    )
    .bind(allegro_login)
    .bind(&order.id)
    .bind(&order.marketplace.id)
    .bind(order.message_to_seller.as_deref())
    .bind(pickup_db_id)
    .bind(order.delivery.cost.as_ref().map(|m| &m.amount))
    .bind(order.delivery.cost.as_ref().map(|m| &m.currency))
    .bind(&order.status)
    .bind(&order.fulfillment.status)
    .bind(payment_db_id)
    .bind(order.summary.total_to_pay.as_ref().map(|m| &m.amount))
    .bind(order.summary.total_to_pay.as_ref().map(|m| &m.currency))
    .bind(order.updated_at.to_rfc3339())
    .bind(buyer_db_id)
    .bind(delivery_db_id)
    .bind(invoice_db_id)
    .fetch_one(&mut *tx)
    .await?;
 
    // ── ORDER ITEMS ────────────────────────────────────────────────────────
    for item in &order.line_items {

        let product_url = format!("https://allegro.pl/oferta/{}", item.offer.id);

        sqlx::query(
            r#"
            INSERT INTO order_items (
                order_db_id, external_offer_id, product_name,
                quantity, price, currency, bought_at,
                product_url, image_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(order_db_id)
        .bind(&item.offer.id)
        .bind(&item.offer.name)
        .bind(item.quantity)
        .bind(item.price.as_ref().map(|m| &m.amount))
        .bind(item.price.as_ref().map(|m| &m.currency))
        .bind(item.bought_at.to_rfc3339())
        .bind(&product_url)
        .bind(image_url)
        .execute(&mut *tx)
        .await?;
    }
 
    // ── 8. PLATFORM PARAMS ────────────────────────────────────────────────────
    sqlx::query(
        r#"
        INSERT INTO order_platform_params (order_db_id, platform, key, value)
        VALUES (?, 'allegro', 'delivery_smart', ?)
        "#,
    )
    .bind(order_db_id)
    .bind(order.delivery.smart.map(|s| s.to_string()))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
    Ok(order_db_id)
}


//funkcje
//GET sale/products -> String image_url
async fn get_image_url(
    client: &reqwest::Client,
    token: &str,
    offer_id: &str,
) -> Result<Option<String>, Box<dyn Error + Send + Sync>> {
    let res = client
        .get(format!("{}/sale/product-offers/{}", ALLEGRO_API_BASE, offer_id))
        .headers(allegro_headers(token))
        .send()
        .await?;

    if !res.status().is_success() {
        return Err(format!("Błąd pobierania image_url Allegro oferty {}: {}", offer_id, res.status()).into());
    }

    let data: ProductOfferResponse = res.json().await?;
    let first_url: Option<String> = serde_json::from_str::<Vec<String>>(&data.images)
        .ok()
        .and_then(|urls| urls.into_iter().next());

    Ok(first_url)
}

//GET single order
async fn get_single_order(
    client: &reqwest::Client,
    token: &str,
    order_id: &str,
) -> Result<OrderForm, Box<dyn Error + Send + Sync>> {
    let res = client
        .get(format!("{}/order/checkout-forms/{}", ALLEGRO_API_BASE, order_id))
        .headers(allegro_headers(token))
        .send()
        .await?;

    if !res.status().is_success() {
        return Err(format!("Błąd pobierania zamówienia {}: {}", order_id, res.status()).into());
    }

    Ok(res.json::<OrderForm>().await?)
}

//wszystkie zamowienia dla konta
async fn fetch_orders_for_account(
    client: &reqwest::Client,
    token: &str,
    filters: &[(&str, &str)]
) -> Result<Vec<OrderForm>, Box<dyn Error + Send + Sync>> {
    let mut all_orders: Vec<OrderForm> = Vec::new();
    let mut offset = 0usize;
    let limit = 100usize;
    
    loop {
        let offset_str = offset.to_string();
        let limit_str = limit.to_string();
        let res = client
            .get(format!("{}/order/checkout-forms", ALLEGRO_API_BASE))
            .headers(allegro_headers(token))
            .query(filters)
            .query(&[("limit", limit_str.as_str()), ("offset", offset_str.as_str())])
            .send()
            .await?;
        if !res.status().is_success() {
            return Err(format!("Błąd API allegro(GET /orders/checkout_forms): {}", res.status()).into());
        }

        let raw = res.text().await?;
eprintln!("RAW RESPONSE: {}", &raw[..raw.len().min(2000)]);
let page: CheckoutFormsPage = serde_json::from_str(&raw)
    .map_err(|e| format!("deserialize error: {} \n w JSON: {}", e, &raw[..200]))?;
    
        let fetched = page.checkout_forms.len();
        all_orders.extend(page.checkout_forms);

        if fetched < limit{
            break;
        }

        offset += limit;
    }

    Ok(all_orders)
}
//nowe
async fn get_new_orders(
    client: &reqwest::Client,
    token: &str,
) -> Result<Vec<OrderForm>, Box<dyn Error + Send + Sync>> {
    fetch_orders_for_account(
        client,
        token,
        &[
            ("fulfillment.status", "NEW"),
            ("fulfillment.status", "PROCESSING"),
        ],
    )
    .await
}
//nieoplacone
async fn get_unsettled_orders(
    client: &reqwest::Client,
    token: &str,
) -> Result<Vec<OrderForm>, Box<dyn Error + Send + Sync>> {
    fetch_orders_for_account(
        client,
        token,
        &[("status", "BOUGHT")],
    )
    .await
}

//sync orders
async fn sync_orders(
    client: &reqwest::Client,
    token: &str,
    allegro_login: &str,
    pool: &SqlitePool,
    api_orders: Vec<OrderForm>,
    db_ids: std::collections::HashSet<String>,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let api_ids: std::collections::HashSet<&str> =
        api_orders.iter().map(|o| o.id.as_str()).collect();

    for order in &api_orders {
        let image_url = match order.line_items.first() {
            Some(item) => get_image_url(client, token, &item.offer.id)
                .await
                .unwrap_or(None)
                .unwrap_or_default(),
            None => String::new(),
        };
        if let Err(e) = save_order(order, &image_url, allegro_login, pool).await {
            eprintln!("[WARN] Błąd zapisu zamówienia {}: {}", order.id, e);
        }
    }

    for order_id in db_ids.iter().filter(|id| !api_ids.contains(id.as_str())) {
        let image_url: String = sqlx::query_scalar(
            r#"
            SELECT oi.image_url
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_db_id
            WHERE o.account_name = ? AND o.external_order_id = ?
            LIMIT 1
            "#,
        )
        .bind(allegro_login)
        .bind(order_id.as_str())
        .fetch_optional(pool)
        .await
        .unwrap_or(None)
        .flatten()
        .unwrap_or_default();

        match get_single_order(client, token, order_id).await {
            Ok(order) => {
                if let Err(e) = save_order(&order, &image_url, allegro_login, pool).await {
                    eprintln!("[WARN] Błąd aktualizacji zamówienia {}: {}", order_id, e);
                }
            }
            Err(e) => eprintln!("[WARN] Nie udało się pobrać zamówienia {}: {}", order_id, e),
        }
    }

    Ok(())
}


pub async fn fetch_and_save_new_orders(
    client: &reqwest::Client,
    token: &str,
    allegro_login: &str,
    pool: &SqlitePool,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let api_orders = get_new_orders(client, token).await?;
    let db_ids = sqlx::query_scalar::<_, String>(
        r#"
        SELECT external_order_id FROM orders
        WHERE account_name = ?
          AND fulfillment_status IN ('NEW', 'PROCESSING')
        "#,
    )
    .bind(allegro_login)
    .fetch_all(pool)
    .await?
    .into_iter()
    .collect();

    sync_orders(client, token, allegro_login, pool, api_orders, db_ids).await
}

pub async fn fetch_and_save_unsettled_orders(
    client: &reqwest::Client,
    token: &str,
    allegro_login: &str,
    pool: &SqlitePool,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let api_orders = get_unsettled_orders(client, token).await?;
    let db_ids = sqlx::query_scalar::<_, String>(
        r#"
        SELECT external_order_id FROM orders
        WHERE account_name = ?
          AND status = 'BOUGHT'
        "#,
    )
    .bind(allegro_login)
    .fetch_all(pool)
    .await?
    .into_iter()
    .collect();

    sync_orders(client, token, allegro_login, pool, api_orders, db_ids).await
}