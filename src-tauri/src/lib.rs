use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::State;

struct DbState(Mutex<Connection>);

#[tauri::command]
fn save_token(state: State<DbState>, token: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        ("allegro_token", &token),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_token(state: State<DbState>) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        ["allegro_token"],
        |row| row.get(0),
    );
    match result {
        Ok(val) => Ok(val),
        Err(_) => Ok(String::new()),
    }
}

fn init_db(conn: &Connection) {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )
    .expect("failed to init db");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let conn = Connection::open("propacker.db").expect("failed to open db");
    init_db(&conn);

    tauri::Builder::default()
        .manage(DbState(Mutex::new(conn)))
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_token, get_token])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}