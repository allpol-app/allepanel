
use reqwest::Client;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
 
 
// ///////////////////////////////////////////////////////////////////
// STAŁE
// ///////////////////////////////////////////////////////////////////
 
const ALLEGRO_API_BASE: &str = "https://api.allegro.pl";
 
/// Aktywne zamówienia — opłacone, gotowe do obsługi.
const ACTIVE_FULFILLMENT_STATUSES: &[&str] = &["NEW", "PROCESSING"];
 
/// Nieopłacone — tylko BOUGHT; FILLED_IN pomijamy (Allegro może go zwrócić
/// wielokrotnie zanim płatność zostanie zakończona).
const UNPAID_ORDER_STATUSES: &[&str] = &["BOUGHT"];
 
const SHIPPED_FULFILLMENT_STATUSES: &[&str] = &[
    "READY_FOR_SHIPMENT",
    "SENT",
    "PICKED_UP",
    "READY_FOR_PICKUP",
];
 
const CANCELLED_ORDER_STATUSES: &[&str] = &["CANCELLED", "BUYER_CANCELLED", "AUTO_CANCELLED"];
 
 
// ///////////////////////////////////////////////////////////////////
// TYPY Z ALLEGRO API
// ///////////////////////////////////////////////////////////////////
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroMoney {
    pub amount: Option<String>,
    pub currency: Option<String>,
}
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroMarketplace {
    pub id: Option<String>,
}
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroBuyer {
    pub id: Option<String>,
    pub login: Option<String>,
    pub email: Option<String>,
    #[serde(rename = "firstName")]
    pub first_name: Option<String>,
    #[serde(rename = "lastName")]
    pub last_name: Option<String>,
    #[serde(rename = "companyName")]
    pub company_name: Option<String>,
    #[serde(rename = "phoneNumber")]
    pub phone_number: Option<String>,
    pub guest: Option<bool>,
}
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroShipmentSummary {
    #[serde(rename = "lineItemsSent")]
    pub line_items_sent: Option<String>,
}
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroFulfillment {
    pub status: Option<String>,
    #[serde(rename = "shipmentSummary")]
    pub shipment_summary: Option<AllegroShipmentSummary>,
}
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroDeliveryAddress {
    #[serde(rename = "firstName")]
    pub first_name: Option<String>,
    #[serde(rename = "lastName")]
    pub last_name: Option<String>,
    pub street: Option<String>,
    pub city: Option<String>,
    #[serde(rename = "zipCode")]
    pub zip_code: Option<String>,
    #[serde(rename = "countryCode")]
    pub country_code: Option<String>,
    #[serde(rename = "phoneNumber")]
    pub phone_number: Option<String>,
}
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroPickupPoint {
    pub id: Option<String>,
    pub name: Option<String>,
}
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroDeliveryMethod {
    pub id: Option<String>,
    pub name: Option<String>,
}
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroDelivery {
    pub address: Option<AllegroDeliveryAddress>,
    #[serde(rename = "pickupPoint")]
    pub pickup_point: Option<AllegroPickupPoint>,
    pub method: Option<AllegroDeliveryMethod>,
    pub cost: Option<AllegroMoney>,
    pub smart: Option<bool>,
}
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroPayment {
    pub id: Option<String>,
    #[serde(rename = "type")]
    pub payment_type: Option<String>,
    pub provider: Option<String>,
    #[serde(rename = "finishedAt")]
    pub finished_at: Option<String>,
    #[serde(rename = "paidAmount")]
    pub paid_amount: Option<AllegroMoney>,
}
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroSummary {
    #[serde(rename = "totalToPay")]
    pub total_to_pay: Option<AllegroMoney>,
}
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroInvoice {
    pub required: Option<bool>,
}
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroOffer {
    pub id: Option<String>,
    pub name: Option<String>,
}
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroLineItem {
    pub id: Option<String>,
    pub offer: Option<AllegroOffer>,
    pub quantity: Option<u32>,
    #[serde(rename = "originalPrice")]
    pub original_price: Option<AllegroMoney>,
    pub price: Option<AllegroMoney>,
    #[serde(rename = "boughtAt")]
    pub bought_at: Option<String>,
}
 
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct AllegroCheckoutForm {
    pub id: String,
    pub status: Option<String>,
    #[serde(rename = "messageToSeller")]
    pub message_to_seller: Option<String>,
    #[serde(rename = "updatedAt")]
    pub updated_at: Option<String>,
    pub revision: Option<String>,
    pub marketplace: Option<AllegroMarketplace>,
    pub buyer: Option<AllegroBuyer>,
    pub fulfillment: Option<AllegroFulfillment>,
    pub delivery: Option<AllegroDelivery>,
    pub payment: Option<AllegroPayment>,
    pub summary: Option<AllegroSummary>,
    pub invoice: Option<AllegroInvoice>,
    #[serde(rename = "lineItems")]
    pub line_items: Option<Vec<AllegroLineItem>>,
}
 
#[derive(Debug, Deserialize)]
struct AllegroCheckoutFormsResponse {
    #[serde(rename = "checkoutForms")]
    checkout_forms: Option<Vec<AllegroCheckoutForm>>,
    #[serde(rename = "totalCount")]
    total_count: Option<u64>,
}
 
 
// ///////////////////////////////////////////////////////////////////
// WYNIKI ZWRACANE DO COMMANDS
// ///////////////////////////////////////////////////////////////////
 
#[derive(Debug, Serialize)]
pub struct SyncOrdersResult {
    pub allegro_account_id: String,
    pub fetched: usize,
    pub saved_orders: usize,
    pub saved_items: usize,
    pub status_refresh: StatusRefreshResult,
}
 
#[derive(Debug, Serialize)]
pub struct StatusRefreshResult {
    pub checked: usize,
    pub updated: usize,
    pub moved_to_sent: usize,
    pub moved_to_cancelled: usize,
}
 
 
// ///////////////////////////////////////////////////////////////////
// HELPERY PRYWATNE
// ///////////////////////////////////////////////////////////////////
 
// naglowki
fn allegro_headers(access_token: &str) -> reqwest::header::HeaderMap {
    use reqwest::header::{HeaderMap, ACCEPT, AUTHORIZATION, CONTENT_TYPE};
    let mut headers = HeaderMap::new();
    headers.insert(
        AUTHORIZATION,
        format!("Bearer {}", access_token).parse().unwrap(),
    );
    headers.insert(
        ACCEPT,
        "application/vnd.allegro.public.v1+json".parse().unwrap(),
    );
    headers.insert(
        CONTENT_TYPE,
        "application/vnd.allegro.public.v1+json".parse().unwrap(),
    );
    headers
}


fn map_to_local_status(
    external_order_status: Option<&str>,
    external_fulfillment_status: Option<&str>,
) -> &'static str {
    let order_s = external_order_status.unwrap_or("");
    let fulfil_s = external_fulfillment_status.unwrap_or("");
 
    if CANCELLED_ORDER_STATUSES.contains(&order_s) || fulfil_s.contains("CANCELLED") {
        return "CANCELLED";
    }
 
    if SHIPPED_FULFILLMENT_STATUSES.contains(&fulfil_s) {
        return "SENT";
    }
 
    if fulfil_s == "PROCESSING" {
        return "PROCESSING";
    }
 
    "NEW"
}
 
fn to_decimal(value: Option<&str>) -> String {
    match value.and_then(|v| v.parse::<f64>().ok()) {
        Some(n) if n.is_finite() => format!("{:.2}", n),
        _ => "0.00".to_string(),
    }
}
 
fn calculate_products_total(line_items: &[AllegroLineItem]) -> String {
    let total: f64 = line_items.iter().fold(0.0, |sum, item| {
        let price = item
            .price
            .as_ref()
            .and_then(|p| p.amount.as_deref())
            .and_then(|a| a.parse::<f64>().ok())
            .unwrap_or(0.0);
        let qty = item.quantity.unwrap_or(1) as f64;
        sum + price * qty
    });
    format!("{:.2}", total)
}
 
fn get_order_created_at(line_items: &[AllegroLineItem]) -> Option<String> {
    let mut dates: Vec<&str> = line_items
        .iter()
        .filter_map(|i| i.bought_at.as_deref())
        .collect();
    dates.sort_unstable();
    dates.first().map(|s| s.to_string())
}
 
fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}
 
 
// ///////////////////////////////////////////////////////////////////
// POBIERANIE Z API
// ///////////////////////////////////////////////////////////////////
 
async fn fetch_checkout_forms_by_filters(
    client: &Client,
    access_token: &str,
    status_filters: &[&str],
    fulfillment_status_filters: &[&str],
) -> Result<Vec<AllegroCheckoutForm>, String> {
    let limit: u64 = 100;
    let mut offset: u64 = 0;
    let mut all: Vec<AllegroCheckoutForm> = Vec::new();
 
    loop {
        let mut query: Vec<(String, String)> = vec![
            ("limit".into(), limit.to_string()),
            ("offset".into(), offset.to_string()),
        ];
        for s in status_filters {
            query.push(("status".into(), s.to_string()));
        }
        for s in fulfillment_status_filters {
            query.push(("fulfillment.status".into(), s.to_string()));
        }
 
        let resp = client
            .get(format!("{}/order/checkout-forms", ALLEGRO_API_BASE))
            .headers(allegro_headers(access_token))
            .query(&query)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;
 
        let data: AllegroCheckoutFormsResponse = resp
            .json()
            .await
            .map_err(|e| format!("JSON parse error: {}", e))?;
 
        let forms = data.checkout_forms.unwrap_or_default();
        let total = data.total_count.unwrap_or(0);
        let fetched = forms.len() as u64;
 
        all.extend(forms);
 
        if fetched < limit {
            break;
        }
 
        offset += limit;
 
        if offset >= total {
            break;
        }
    }
 
    Ok(all)
}
 
/// Pobiera aktywne + nieopłacone zamówienia z Allegro, bez zapisu do DB.
/// Deduplikuje po ID (na wypadek nakładających się filtrów).
pub async fn fetch_orders_for_account(
    client: &Client,
    access_token: &str,
) -> Result<Vec<AllegroCheckoutForm>, String> {
    let ready = fetch_checkout_forms_by_filters(
        client,
        access_token,
        &["READY_FOR_PROCESSING"],
        ACTIVE_FULFILLMENT_STATUSES,
    )
    .await?;
 
    let unpaid = fetch_checkout_forms_by_filters(
        client,
        access_token,
        UNPAID_ORDER_STATUSES,
        &[],
    )
    .await?;
 
    let mut by_id: HashMap<String, AllegroCheckoutForm> = HashMap::new();
    for order in ready.into_iter().chain(unpaid) {
        by_id.insert(order.id.clone(), order);
    }
 
    Ok(by_id.into_values().collect())
}
 
pub async fn fetch_single_order(
    client: &Client,
    access_token: &str,
    external_order_id: &str,
) -> Option<AllegroCheckoutForm> {
    let url = format!(
        "{}/order/checkout-forms/{}",
        ALLEGRO_API_BASE, external_order_id
    );
    let resp = client
        .get(&url)
        .headers(allegro_headers(access_token))
        .send()
        .await
        .ok()?;
 
    if !resp.status().is_success() {
        eprintln!(
            "[orders] fetch_single_order {} → HTTP {}",
            external_order_id,
            resp.status()
        );
        return None;
    }
 
    resp.json::<AllegroCheckoutForm>().await.ok()
}
 
 
// ///////////////////////////////////////////////////////////////////
// ZAPIS DO BAZY
// ///////////////////////////////////////////////////////////////////
 
/// Wstawia lub aktualizuje zamówienie w tabeli `orders`.
/// Zwraca `id` rekordu z bazy.
fn upsert_order(
    conn: &Connection,
    allegro_account_id: &str,
    order: &AllegroCheckoutForm,
) -> Result<i64, String> {
    let line_items = order.line_items.as_deref().unwrap_or(&[]);
 
    let total_to_pay = to_decimal(
        order
            .summary
            .as_ref()
            .and_then(|s| s.total_to_pay.as_ref())
            .and_then(|t| t.amount.as_deref()),
    );
    let total_currency = order
        .summary
        .as_ref()
        .and_then(|s| s.total_to_pay.as_ref())
        .and_then(|t| t.currency.as_deref())
        .unwrap_or("PLN");
 
    let total_amount = calculate_products_total(line_items);
    let order_created_at = get_order_created_at(line_items);
 
    let ext_order_status = order.status.as_deref();
    let ext_fulfil_status = order.fulfillment.as_ref().and_then(|f| f.status.as_deref());
    let local_status = map_to_local_status(ext_order_status, ext_fulfil_status);
 
    let raw_data = serde_json::to_string(order).unwrap_or_default();
    let synced_at = now_iso();
 
    // Makro pomocnicze: wyciąga Option<&str> przez łańcuch .as_ref()/.as_deref()
    // (inlinujemy bezpośrednio w params! dla czytelności)
 
    conn.execute(
        "INSERT INTO orders (
            allegro_account_id,
            external_order_id,
            local_status,
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
        )
        VALUES (
            ?1,  ?2,  ?3,  ?4,  ?5,  ?6,  ?7,  ?8,  ?9,  ?10,
            ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
            ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30,
            ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39, ?40,
            ?41, ?42, ?43, ?44, ?45
        )
        ON CONFLICT(allegro_account_id, external_order_id) DO UPDATE SET
            local_status                = excluded.local_status,
            external_order_status       = excluded.external_order_status,
            external_fulfillment_status = excluded.external_fulfillment_status,
            external_line_items_sent    = excluded.external_line_items_sent,
            external_revision           = excluded.external_revision,
            marketplace_site_id         = excluded.marketplace_site_id,
            message_to_seller           = excluded.message_to_seller,
            buyer_id                    = excluded.buyer_id,
            buyer_login                 = excluded.buyer_login,
            buyer_email                 = excluded.buyer_email,
            buyer_first_name            = excluded.buyer_first_name,
            buyer_last_name             = excluded.buyer_last_name,
            buyer_company_name          = excluded.buyer_company_name,
            buyer_phone                 = excluded.buyer_phone,
            buyer_guest                 = excluded.buyer_guest,
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
            invoice_required            = excluded.invoice_required,
            order_created_at            = excluded.order_created_at,
            external_updated_at         = excluded.external_updated_at,
            synced_at                   = excluded.synced_at,
            raw_data                    = excluded.raw_data",
        params![
            /* ?1  */ allegro_account_id,
            /* ?2  */ &order.id,
            /* ?3  */ local_status,
            /* ?4  */ ext_order_status,
            /* ?5  */ ext_fulfil_status,
            /* ?6  */ order.fulfillment.as_ref()
                          .and_then(|f| f.shipment_summary.as_ref())
                          .and_then(|s| s.line_items_sent.as_deref()),
            /* ?7  */ order.revision.as_deref(),
            /* ?8  */ order.marketplace.as_ref().and_then(|m| m.id.as_deref()),
            /* ?9  */ order.message_to_seller.as_deref(),
            /* ?10 */ order.buyer.as_ref().and_then(|b| b.id.as_deref()),
            /* ?11 */ order.buyer.as_ref().and_then(|b| b.login.as_deref()),
            /* ?12 */ order.buyer.as_ref().and_then(|b| b.email.as_deref()),
            /* ?13 */ order.buyer.as_ref().and_then(|b| b.first_name.as_deref()),
            /* ?14 */ order.buyer.as_ref().and_then(|b| b.last_name.as_deref()),
            /* ?15 */ order.buyer.as_ref().and_then(|b| b.company_name.as_deref()),
            /* ?16 */ order.buyer.as_ref().and_then(|b| b.phone_number.as_deref()),
            /* ?17 */ order.buyer.as_ref().and_then(|b| b.guest).unwrap_or(false) as i32,
            /* ?18 */ order.delivery.as_ref().and_then(|d| d.method.as_ref()).and_then(|m| m.id.as_deref()),
            /* ?19 */ order.delivery.as_ref().and_then(|d| d.method.as_ref()).and_then(|m| m.name.as_deref()),
            /* ?20 */ order.delivery.as_ref().and_then(|d| d.address.as_ref()).and_then(|a| a.first_name.as_deref()),
            /* ?21 */ order.delivery.as_ref().and_then(|d| d.address.as_ref()).and_then(|a| a.last_name.as_deref()),
            /* ?22 */ order.delivery.as_ref().and_then(|d| d.address.as_ref()).and_then(|a| a.street.as_deref()),
            /* ?23 */ order.delivery.as_ref().and_then(|d| d.address.as_ref()).and_then(|a| a.city.as_deref()),
            /* ?24 */ order.delivery.as_ref().and_then(|d| d.address.as_ref()).and_then(|a| a.zip_code.as_deref()),
            /* ?25 */ order.delivery.as_ref().and_then(|d| d.address.as_ref()).and_then(|a| a.country_code.as_deref()),
            /* ?26 */ order.delivery.as_ref().and_then(|d| d.address.as_ref()).and_then(|a| a.phone_number.as_deref()),
            /* ?27 */ order.delivery.as_ref().and_then(|d| d.pickup_point.as_ref()).and_then(|p| p.id.as_deref()),
            /* ?28 */ order.delivery.as_ref().and_then(|d| d.pickup_point.as_ref()).and_then(|p| p.name.as_deref()),
            /* ?29 */ to_decimal(order.delivery.as_ref().and_then(|d| d.cost.as_ref()).and_then(|c| c.amount.as_deref())),
            /* ?30 */ order.delivery.as_ref().and_then(|d| d.cost.as_ref()).and_then(|c| c.currency.as_deref()).unwrap_or(total_currency),
            /* ?31 */ order.delivery.as_ref().and_then(|d| d.smart).unwrap_or(false) as i32,
            /* ?32 */ order.payment.as_ref().and_then(|p| p.id.as_deref()),
            /* ?33 */ order.payment.as_ref().and_then(|p| p.payment_type.as_deref()),
            /* ?34 */ order.payment.as_ref().and_then(|p| p.provider.as_deref()),
            /* ?35 */ order.payment.as_ref().and_then(|p| p.finished_at.as_deref()),
            /* ?36 */ to_decimal(order.payment.as_ref().and_then(|p| p.paid_amount.as_ref()).and_then(|a| a.amount.as_deref())),
            /* ?37 */ order.payment.as_ref().and_then(|p| p.paid_amount.as_ref()).and_then(|a| a.currency.as_deref()).unwrap_or(total_currency),
            /* ?38 */ total_to_pay,
            /* ?39 */ total_amount,
            /* ?40 */ total_currency,
            /* ?41 */ order.invoice.as_ref().and_then(|i| i.required).unwrap_or(false) as i32,
            /* ?42 */ order_created_at,
            /* ?43 */ order.updated_at.as_deref(),
            /* ?44 */ synced_at,
            /* ?45 */ raw_data,
        ],
    )
    .map_err(|e| format!("upsert_order DB error: {}", e))?;
 
    let order_db_id: i64 = conn
        .query_row(
            "SELECT id FROM orders WHERE allegro_account_id = ?1 AND external_order_id = ?2",
            params![allegro_account_id, &order.id],
            |row| row.get(0),
        )
        .map_err(|e| format!("get order id DB error: {}", e))?;
 
    Ok(order_db_id)
}
 
fn upsert_order_items(
    conn: &Connection,
    order_db_id: i64,
    line_items: &[AllegroLineItem],
) -> Result<usize, String> {
    conn.execute(
        "DELETE FROM order_items WHERE order_id = ?1",
        params![order_db_id],
    )
    .map_err(|e| format!("delete order_items DB error: {}", e))?;
 
    for item in line_items {
        let raw = serde_json::to_string(item).unwrap_or_default();
 
        conn.execute(
            "INSERT INTO order_items (
                order_id,
                external_line_item_id,
                external_offer_id,
                product_name,
                quantity,
                original_price,
                price,
                currency,
                bought_at,
                raw_data
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                order_db_id,
                item.id.as_deref(),
                item.offer.as_ref().and_then(|o| o.id.as_deref()),
                item.offer.as_ref().and_then(|o| o.name.as_deref()).unwrap_or("Brak nazwy"),
                item.quantity.unwrap_or(1) as i64,
                to_decimal(item.original_price.as_ref().and_then(|p| p.amount.as_deref())),
                to_decimal(item.price.as_ref().and_then(|p| p.amount.as_deref())),
                item.price.as_ref().and_then(|p| p.currency.as_deref()).unwrap_or("PLN"),
                item.bought_at.as_deref(),
                raw,
            ],
        )
        .map_err(|e| format!("insert order_item DB error: {}", e))?;
    }
 
    Ok(line_items.len())
}
 
 
// ///////////////////////////////////////////////////////////////////
// ODŚWIEŻANIE WCZEŚNIEJ AKTYWNYCH ZAMÓWIEŃ
// ///////////////////////////////////////////////////////////////////
 
/// Zamówienia których nie ma w bieżącym aktywnym fetch'u sprawdzamy
/// indywidualnie — mogły zostać wysłane, anulowane albo zarchiwizowane.
async fn refresh_previously_active_orders(
    conn: &Connection,
    client: &Client,
    access_token: &str,
    allegro_account_id: &str,
    active_external_ids: &std::collections::HashSet<String>,
) -> Result<StatusRefreshResult, String> {
    // Pobieramy lokalne zamówienia tego konta, których nie ma w aktywnym secie
    struct LocalOrder {
        id: i64,
        external_order_id: String,
        ext_order_status: Option<String>,
        ext_fulfil_status: Option<String>,
    }
 
    let mut stmt = conn
        .prepare(
            "SELECT id, external_order_id, external_order_status, external_fulfillment_status
             FROM orders
             WHERE allegro_account_id = ?1
               AND local_status NOT IN ('SENT', 'CANCELLED')",
        )
        .map_err(|e| format!("prepare refresh query error: {}", e))?;
 
    let local_orders: Vec<LocalOrder> = stmt
        .query_map(params![allegro_account_id], |row| {
            Ok(LocalOrder {
                id: row.get(0)?,
                external_order_id: row.get(1)?,
                ext_order_status: row.get(2)?,
                ext_fulfil_status: row.get(3)?,
            })
        })
        .map_err(|e| format!("refresh query error: {}", e))?
        .filter_map(|r| r.ok())
        // pomijamy te które są w aktywnym secie — już je właśnie upsertowaliśmy
        .filter(|o| !active_external_ids.contains(&o.external_order_id))
        .collect();
 
    let mut checked = 0usize;
    let mut updated = 0usize;
    let mut moved_to_sent = 0usize;
    let mut moved_to_cancelled = 0usize;
 
    for local in local_orders {
        checked += 1;
 
        let Some(fresh) = fetch_single_order(client, access_token, &local.external_order_id).await
        else {
            continue;
        };
 
        let fresh_ext_order = fresh.status.as_deref();
        let fresh_ext_fulfil = fresh.fulfillment.as_ref().and_then(|f| f.status.as_deref());
 
        let status_changed = fresh_ext_order != local.ext_order_status.as_deref()
            || fresh_ext_fulfil != local.ext_fulfil_status.as_deref();
 
        if !status_changed {
            continue;
        }
 
        let new_local_status = map_to_local_status(fresh_ext_order, fresh_ext_fulfil);
 
        if new_local_status == "SENT" {
            moved_to_sent += 1;
        }
        if new_local_status == "CANCELLED" {
            moved_to_cancelled += 1;
        }
 
        conn.execute(
            "UPDATE orders SET
                local_status                = ?1,
                external_order_status       = ?2,
                external_fulfillment_status = ?3,
                external_line_items_sent    = ?4,
                external_revision           = ?5,
                marketplace_site_id         = ?6,
                external_updated_at         = ?7,
                synced_at                   = ?8,
                raw_data                    = ?9
             WHERE id = ?10",
            params![
                new_local_status,
                fresh_ext_order,
                fresh_ext_fulfil,
                fresh.fulfillment.as_ref()
                    .and_then(|f| f.shipment_summary.as_ref())
                    .and_then(|s| s.line_items_sent.as_deref()),
                fresh.revision.as_deref(),
                fresh.marketplace.as_ref().and_then(|m| m.id.as_deref()),
                fresh.updated_at.as_deref(),
                now_iso(),
                serde_json::to_string(&fresh).unwrap_or_default(),
                local.id,
            ],
        )
        .map_err(|e| format!("refresh update DB error: {}", e))?;
 
        updated += 1;
    }
 
    Ok(StatusRefreshResult {
        checked,
        updated,
        moved_to_sent,
        moved_to_cancelled,
    })
}
 
 
// ///////////////////////////////////////////////////////////////////
// PUBLICZNE FUNKCJE (wywoływane z commands.rs)
// ///////////////////////////////////////////////////////////////////
 
/// Pobiera zamówienia z Allegro i zapisuje je do SQLite.
/// Przyjmuje już odświeżony `access_token` — odświeżanie tokena
/// obsługuje commands.rs / auth module przed wywołaniem tej funkcji.
pub async fn sync_orders_for_account(
    conn: &Connection,
    client: &Client,
    access_token: &str,
    allegro_account_id: &str,
) -> Result<SyncOrdersResult, String> {
    let forms = fetch_orders_for_account(client, access_token).await?;
 
    let active_ids: std::collections::HashSet<String> =
        forms.iter().map(|o| o.id.clone()).collect();
 
    let mut saved_orders = 0usize;
    let mut saved_items = 0usize;
 
    for order in &forms {
        let order_db_id = upsert_order(conn, allegro_account_id, order)?;
        saved_orders += 1;
 
        let line_items = order.line_items.as_deref().unwrap_or(&[]);
        saved_items += upsert_order_items(conn, order_db_id, line_items)?;
    }
 
    let status_refresh = refresh_previously_active_orders(
        conn,
        client,
        access_token,
        allegro_account_id,
        &active_ids,
    )
    .await?;
 
    Ok(SyncOrdersResult {
        allegro_account_id: allegro_account_id.to_string(),
        fetched: forms.len(),
        saved_orders,
        saved_items,
        status_refresh,
    })
}

// ///////////////////////////////////////////////////////////////////
// PUBLICZNE FUNKCJE SYNC (fetch oddzielnie, zapis oddzielnie)
// ///////////////////////////////////////////////////////////////////

/// Zapisuje pobrane zamówienia do DB. Synchroniczna — bez await,
/// żeby można było trzymać MutexGuard z commands.rs.
pub fn persist_orders_to_db(
    conn: &Connection,
    allegro_account_id: &str,
    forms: &[AllegroCheckoutForm],
) -> Result<(usize, usize), String> {
    let mut saved_orders = 0usize;
    let mut saved_items = 0usize;

    for order in forms {
        let order_db_id = upsert_order(conn, allegro_account_id, order)?;
        saved_orders += 1;
        let items = order.line_items.as_deref().unwrap_or(&[]);
        saved_items += upsert_order_items(conn, order_db_id, items)?;
    }

    Ok((saved_orders, saved_items))
}

/// Zwraca (db_id, external_order_id) zamówień do odświeżenia
/// (nie ma ich w aktywnym secie i nie są jeszcze SENT/CANCELLED).
pub fn get_orders_to_refresh(
    conn: &Connection,
    allegro_account_id: &str,
    active_ids: &std::collections::HashSet<String>,
) -> Result<Vec<(i64, String)>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, external_order_id FROM orders
             WHERE allegro_account_id = ?1
               AND local_status NOT IN ('SENT', 'CANCELLED')",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![allegro_account_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .filter(|(_, ext_id)| !active_ids.contains(ext_id.as_str()))
        .collect();

    Ok(rows)
}

/// Aktualizuje status zamówienia w DB na podstawie świeżych danych z API.
pub fn update_order_from_fresh(
    conn: &Connection,
    order_db_id: i64,
    fresh: &AllegroCheckoutForm,
) -> Result<(), String> {
    let ext_order = fresh.status.as_deref();
    let ext_fulfil = fresh.fulfillment.as_ref().and_then(|f| f.status.as_deref());
    let local_status = map_to_local_status(ext_order, ext_fulfil);

    conn.execute(
        "UPDATE orders SET
            local_status                = ?1,
            external_order_status       = ?2,
            external_fulfillment_status = ?3,
            external_line_items_sent    = ?4,
            external_revision           = ?5,
            marketplace_site_id         = ?6,
            external_updated_at         = ?7,
            synced_at                   = ?8,
            raw_data                    = ?9
         WHERE id = ?10",
        params![
            local_status,
            ext_order,
            ext_fulfil,
            fresh.fulfillment.as_ref()
                .and_then(|f| f.shipment_summary.as_ref())
                .and_then(|s| s.line_items_sent.as_deref()),
            fresh.revision.as_deref(),
            fresh.marketplace.as_ref().and_then(|m| m.id.as_deref()),
            fresh.updated_at.as_deref(),
            now_iso(),
            serde_json::to_string(fresh).unwrap_or_default(),
            order_db_id,
        ],
    )
    .map_err(|e| format!("update_order_from_fresh error: {}", e))?;

    Ok(())
}