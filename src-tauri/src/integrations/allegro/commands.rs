use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use std::time::{SystemTime, UNIX_EPOCH};
use serde_json;
use tauri::State;

use crate::config::AppConfig;
use crate::integrations::allegro::auth::{AllegroAuthService, AllegroBaseMarketplace, AllegroCompany};

use crate::db::Database;
use reqwest::Client;
use sqlx::SqlitePool;

use crate::integrations::allegro::orders_true::{
    fetch_and_save_new_orders,
    fetch_and_save_unsettled_orders,
};

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub accounts_synced: u32,
    pub total_fetched: u32,
    pub total_saved: u32,
}

//struct konta
pub struct AllegroAccount {
    pub allegro_id: String,
    pub login: String,
    pub email: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub base_marketplace: Option<AllegroBaseMarketplace>,
    pub company: Option<AllegroCompany>,
    pub features: Option<Vec<String>>,
    pub access_token:  String,
    pub refresh_token: String,
    pub expires_at:    i64,
}

pub struct AppState {
    pub db_pool: SqlitePool,
    pub http_client: Client,
}

impl AllegroAccount {
    // Sprawdza czy token wygasł lub wygaśnie w ciągu 5 minut
    // Wywołujesz to przed każdym requestem do Allegro API
    pub fn is_token_expired(&self) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Błąd zegara systemowego")
            .as_secs();

        let five_minutes: u64 = 5 * 60;
        self.expires_at < (now + five_minutes) as i64
    }
}

//funckja zapisania konta allegro
fn save_allegro_account(
    db: &Database,
    allegro_id: &str,
    login: &str,
    email: Option<&str>,
    first_name: Option<&str>,
    last_name: Option<&str>,
    base_marketplace: Option<&AllegroBaseMarketplace>,
    company: Option<&AllegroCompany>,
    features: Option<&[String]>,
    access_token: &str,
    refresh_token: &str,
    expires_in: u64,
) -> Result<(), String> {
    let conn = db.0.lock().expect("Nie udało się zablokować bazy danych");

    let expires_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Błąd zegara systemowego")
        .as_secs()
        + expires_in;
    
    let base_marketplace_json = base_marketplace
        .map(|bm| serde_json::to_string(bm).map_err(|e| e.to_string()))
        .transpose()?;
        
    let company_json = company
        .map(|c| serde_json::to_string(c).map_err(|e| e.to_string()))
        .transpose()?;
        
    let features_json = features
        .map(|f| serde_json::to_string(f).map_err(|e| e.to_string()))
        .transpose()?;

    conn.execute(
        "INSERT INTO allegro_accounts
            (allegro_id, login, email, first_name, last_name, base_marketplace, company, features, access_token, refresh_token, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(allegro_id) DO UPDATE SET
            login         = excluded.login,
            email         = excluded.email,
            first_name    = excluded.first_name,
            last_name     = excluded.last_name,
            base_marketplace = excluded.base_marketplace,
            company       = excluded.company,
            features      = excluded.features,
            access_token  = excluded.access_token,
            refresh_token = excluded.refresh_token,
            expires_at    = excluded.expires_at",
        rusqlite::params![
            allegro_id,
            login,
            email,
            first_name,
            last_name,
            base_marketplace_json,
            company_json,
            features_json,
            access_token,
            refresh_token,
            expires_at as i64
        ],
    )
    .map_err(|e| format!("Błąd zapisu konta Allegro do bazy: {}", e))?;

    Ok(())
}

//jakies 2 funkcje 
fn get_allegro_account(db: &Database, allegro_id: &str) -> Result<AllegroAccount, String> {
    let conn = db.0.lock().expect("Nie udało się zablokować bazy danych");

    conn.query_row(
        "SELECT allegro_id, login, email, first_name, last_name,
                base_marketplace, company, features,
                access_token, refresh_token, expires_at
         FROM allegro_accounts
         WHERE allegro_id = ?1",
        rusqlite::params![allegro_id],
        |row| {
            Ok(AllegroAccount {
                allegro_id:    row.get(0)?,
                login:         row.get(1)?,
                email:         row.get(2)?,
                first_name:    row.get(3)?,
                last_name:     row.get(4)?,
                // base_marketplace, company, features trzymamy jako JSON string w bazie
                // przy odczycie zostawiamy None - do wyświetlania profilu będzie osobna komenda
                base_marketplace: None,
                company:       None,
                features:      None,
                access_token:  row.get(8)?,
                refresh_token: row.get(9)?,
                expires_at:    row.get(10)?,
            })
        },
    )
    .map_err(|e| format!("Nie znaleziono konta Allegro w bazie: {}", e))
}

fn update_allegro_tokens(
    db: &Database,
    allegro_id: &str,
    access_token: &str,
    refresh_token: &str,
    expires_in: u64,
) -> Result<(), String> {
    let conn = db.0.lock().expect("Nie udało się zablokować bazy danych");

    let expires_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Błąd zegara systemowego")
        .as_secs()
        + expires_in;

    conn.execute(
        "UPDATE allegro_accounts
         SET access_token  = ?1,
             refresh_token = ?2,
             expires_at    = ?3
         WHERE allegro_id  = ?4",
        rusqlite::params![access_token, refresh_token, expires_at as i64, allegro_id],
    )
    .map_err(|e| format!("Błąd aktualizacji tokenów Allegro: {}", e))?;

    Ok(())
}

//funckja pomocnicza do wycaigania wartosci code z requesta allegro
fn get_code_from_request(request_line: &str) -> Result<String,String> {
    let code_start = request_line
        .find("code=")
        .ok_or("Brak code w request Allegro")?;

    let after_code = &request_line[code_start +5..];

    let code_end = after_code
        .find(|c| c == '&'|| c == ' ')
        .unwrap_or(after_code.len());

    let code = &after_code[..code_end];

    if code.is_empty() {
        return Err("Code jest pusty".to_string());
    }

    Ok(code.to_string())
}

//zwraca kod z callbacku allegro
async fn wait_for_allegro_callback() -> Result<String, String> {
    //otwiera listener na 7777
    let listener = TcpListener::bind("127.0.0.1:7777")
        .await
        .map_err(|e| format!("Nie udalo siew uruchmic serwera na 7777, {}", e))?;

    //jak ktos wysle request(allegro) to to wycaiga stream a ignoruje addr
    let (stream, _) = listener
        .accept()
        .await
        .map_err(|e| format!("Błąd przy odbieraniu 7777, {}", e))?;

    //czyta stream
    let mut reader = BufReader::new(stream);

    //tworzy pusty string
    let mut first_line = String::new();

    reader
        .read_line(&mut first_line) //czyta i odrazu wydajnie napelnia nowy pusty string
        .await
        .map_err(|e| format!("Błąd przy czytaniu requestu: {}", e))?;

    //wyciaga tylko code z requestu(funckja wyzej)
    let code = get_code_from_request(&first_line)?;

    //concat przy kompilacji tworzy prosta stronke.
    let html_response = concat!(
        "HTTP/1.1 200 OK\r\n",
        "Content-Type: text/html; charset=utf-8\r\n",
        "\r\n",
        "<html><body>",
        "<h2>Konto Allegro zostało połączone!</h2>",
        "<p>Zamknij tę karte i wróć do aplikacji.</p>",
        "</body></html>"
    );

    let _ = reader.get_mut().write_all(html_response.as_bytes()).await;

    Ok(code)
}

#[tauri::command]
pub async fn start_allegro_auth(
        db: State<'_, Database>,
    ) -> Result<String, String> {
    let config = AppConfig::from_env();
    let service = AllegroAuthService::new(config);

    let code_verifier = AllegroAuthService::generate_code_verifier();

    let auth_url = service.generate_auth_url(&code_verifier);

    tauri_plugin_opener::open_url(&auth_url, None::<String>)
        .map_err(|e| format!("Nie udało sie otworzyc przeglądarki, {}", e))?;

    let code = wait_for_allegro_callback().await?;

    let tokens = service.exchange_code_for_tokens(&code, &code_verifier).await?;

    let profile = service.get_allegro_profile(&tokens.access_token).await?;

    save_allegro_account(
        &*db,
        &profile.id,
        &profile.login,
        profile.email.as_deref(),
        profile.first_name.as_deref(),
        profile.last_name.as_deref(),
        profile.base_marketplace.as_ref(),
        profile.company.as_ref(),
        profile.features.as_ref().map(|v| v.as_slice()),
        &tokens.access_token,
        &tokens.refresh_token,
        tokens.expires_in,
    ).map_err(|e| {
        eprintln!("BŁĄD ZAPISU DO BAZY: {}", e);
        e
    })?;

    Ok(profile.login)
}

#[tauri::command]
pub async fn refresh_allegro_token(
    allegro_id: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    // pobieramy aktualne dane konta z bazy
    let account = get_allegro_account(&*db, &allegro_id)?;

    let config = AppConfig::from_env();
    let service = AllegroAuthService::new(config);

    // wywołujemy refresh w serwisie auth
    let tokens = service
        .refresh_token(&account.refresh_token)
        .await?;

    // zapisujemy nową parę tokenów do bazy
    update_allegro_tokens(
        &*db,
        &allegro_id,
        &tokens.access_token,
        &tokens.refresh_token,
        tokens.expires_in,
    )?;

    Ok(())
}

#[tauri::command]
pub fn get_allegro_accounts(db: State<'_, Database>) -> Result<serde_json::Value, String> {
    let conn = db.0.lock().expect("lock");

    let mut stmt = conn
        .prepare(
            "SELECT allegro_id, login, first_name, last_name, email
             FROM allegro_accounts",
        )
        .map_err(|e| format!("prepare error: {}", e))?;

    let accounts: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "allegroId":  row.get::<_, String>(0)?,
                "login":      row.get::<_, String>(1)?,
                "firstName":  row.get::<_, Option<String>>(2)?,
                "lastName":   row.get::<_, Option<String>>(3)?,
                "email":      row.get::<_, Option<String>>(4)?,
            }))
        })
        .map_err(|e| format!("query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(serde_json::json!({ "accounts": accounts }))
}

#[tauri::command]
pub async fn sync_allegro_orders(
    db: tauri::State<'_, Database>,
) -> Result<SyncResult, String> {
    let client = reqwest::Client::new();

    // ── 1. Pobierz konta przez rusqlite (jak reszta kodu) ─────────────────
    let accounts: Vec<(String, String)> = {
        let conn = db.0.lock().expect("lock");
        let mut stmt = conn
            .prepare("SELECT login, access_token FROM allegro_accounts")
            .map_err(|e| e.to_string())?;

        let result: Vec<(String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        result
    };

    // ── 2. Stwórz sqlx pool (orders_true.rs tego wymaga) ──────────────────
    let pool = sqlx::SqlitePool::connect("sqlite://propacker.db")
        .await
        .map_err(|e| e.to_string())?;

    let mut accounts_synced = 0u32;

    for (login, access_token) in &accounts {
        fetch_and_save_new_orders(&client, access_token, login, &pool)
            .await
            .map_err(|e| format!("Błąd konta {}: {}", login, e))?;

        fetch_and_save_unsettled_orders(&client, access_token, login, &pool)
            .await
            .map_err(|e| format!("Błąd konta {}: {}", login, e))?;

        accounts_synced += 1;
    }

    Ok(SyncResult { accounts_synced, total_fetched: 0, total_saved: 0 })
}