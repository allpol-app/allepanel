use rusqlite::{Connection, Result as SqlResult};
use std::sync::Mutex;

pub struct Database(pub Mutex<Connection>);

impl Database {
    pub fn init(path: &str) -> SqlResult<Self> {
        let conn = Connection::open(path)?;
        let db = Database(Mutex::new(conn));
        db.create_tables()?;
        Ok(db)
    }

    fn create_tables(&self) -> SqlResult<()> {
        let conn = self.0.lock().expect("Nie udało się zablokować bazy danych");

        conn.execute_batch("
        CREATE TABLE IF NOT EXISTS allegro_accounts (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            allegro_id       TEXT NOT NULL UNIQUE,
            login            TEXT NOT NULL,
            first_name       TEXT,
            last_name        TEXT,
            email            TEXT,
            base_marketplace TEXT,
            company          TEXT,
            features         TEXT,
            access_token     TEXT NOT NULL,
            refresh_token    TEXT NOT NULL,
            expires_at       INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS buyers (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            buyer_id            TEXT,
            buyer_login         TEXT,
            buyer_email         TEXT,
            buyer_first_name    TEXT,
            buyer_last_name     TEXT,
            buyer_company_name  TEXT,
            buyer_street        TEXT,
            buyer_city          TEXT,
            buyer_zip_code      TEXT,
            buyer_country       TEXT,
            buyer_phone         TEXT
        );

        CREATE TABLE IF NOT EXISTS delivery (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            delivery_method_id      TEXT,
            delivery_method_name    TEXT,
            delivery_first_name     TEXT,
            delivery_last_name      TEXT,
            delivery_street         TEXT,
            delivery_city           TEXT,
            delivery_zip_code       TEXT,
            delivery_country_code   TEXT,
            delivery_company        TEXT,
            delivery_phone          TEXT
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            required            INTEGER NOT NULL DEFAULT 0,
            street              TEXT,
            city                TEXT,
            zip_code            TEXT,
            country             TEXT,
            company             TEXT,
            company_id_type     TEXT,
            company_id_value    TEXT,
            vat_payer_status    TEXT,
            tax_id              TEXT,
            first_name          TEXT,
            last_name           TEXT,
            due_date            TEXT
        );

        CREATE TABLE IF NOT EXISTS pickup_details (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            pickup_point_id     TEXT,
            pickup_name         TEXT,
            pickup_description  TEXT,
            pickup_street       TEXT,
            pickup_zip_code     TEXT,
            pickup_city         TEXT,
            pickup_country      TEXT
        );

        CREATE TABLE IF NOT EXISTS payment_details (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            payment_id          TEXT,
            payment_type        TEXT,
            payment_provider    TEXT,
            payment_finished_at TEXT,
            payment_amount      TEXT,
            payment_currency    TEXT
        );

        CREATE TABLE IF NOT EXISTS orders (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            account_name        TEXT NOT NULL,
            external_order_id   TEXT NOT NULL,
            marketplace         TEXT,
            message_to_seller   TEXT,

            pickup_id           INTEGER,
            delivery_cost       TEXT,
            delivery_currency   TEXT,
            status              TEXT,
            fulfillment_status  TEXT,

            payment_detail_id   INTEGER,

            total_to_pay        TEXT,
            currency            TEXT,
            external_updated_at TEXT,
            buyer_id            INTEGER,
            delivery_id         INTEGER,
            invoice_id          INTEGER,

            UNIQUE(account_name, external_order_id),

            FOREIGN KEY(pickup_id) REFERENCES pickup_details(id) ON DELETE SET NULL,
            FOREIGN KEY(payment_detail_id) REFERENCES payment_details(id) ON DELETE SET NULL,
            FOREIGN KEY(buyer_id) REFERENCES buyers(id) ON DELETE SET NULL,
            FOREIGN KEY(delivery_id) REFERENCES delivery(id) ON DELETE SET NULL,
            FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            order_db_id         INTEGER NOT NULL,
            external_offer_id   TEXT NOT NULL,
            product_name        TEXT NOT NULL,
            quantity            INTEGER NOT NULL,
            price               TEXT NOT NULL,
            currency            TEXT NOT NULL,
            bought_at           TEXT NOT NULL,
            product_url         TEXT,
            image_url           TEXT,
            FOREIGN KEY(order_db_id) REFERENCES orders(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS order_platform_params (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            order_db_id INTEGER NOT NULL,
            platform    TEXT NOT NULL,        
            key         TEXT NOT NULL,         
            value       TEXT NOT NULL,        
            FOREIGN KEY(order_db_id) REFERENCES orders(id) ON DELETE CASCADE
        );
        ")?;

        Ok(())
    }
}