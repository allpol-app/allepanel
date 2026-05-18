use rusqlite::{Connection, Result as SqlResult};
use std::sync::Mutex;

// ----------------------------------------------------------------
// Stan bazy danych
// Mutex zapewnia że tylko jeden wątek na raz pisze do bazy
// Tauri zarządza tym stanem przez .manage() w lib.rs
// ----------------------------------------------------------------

pub struct Database(pub Mutex<Connection>);

impl Database {
    // Otwiera plik bazy danych i tworzy tabele jeśli nie istnieją
    // Wywołujesz raz przy starcie aplikacji w lib.rs
    pub fn init(path: &str) -> SqlResult<Self> {
        let conn = Connection::open(path)?;
        let db = Database(Mutex::new(conn));
        db.create_tables()?;
        Ok(db)
    }

    fn create_tables(&self) -> SqlResult<()> {
        let conn = self.0.lock().expect("Nie udało się zablokować bazy danych");

        conn.execute_batch("
            -- Zintegrowane konta Allegro
            -- Jedno konto = jeden wiersz
            -- access_token odświeżamy co 12h przez refresh_token
            CREATE TABLE IF NOT EXISTS allegro_accounts (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                allegro_id    TEXT NOT NULL UNIQUE,
                login         TEXT NOT NULL,
                email         TEXT,
                access_token  TEXT NOT NULL,
                refresh_token TEXT NOT NULL,
                expires_at    INTEGER NOT NULL
            );
        ")?;

        Ok(())
    }
}