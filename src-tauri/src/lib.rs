mod config;
mod db;
mod integrations {
    pub mod allegro {
        pub mod auth;
        pub mod commands;
        pub mod orders_true;
    }
}

use db::Database;
use integrations::allegro::commands::{start_allegro_auth, refresh_allegro_token, get_allegro_accounts, sync_allegro_orders};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = Database::init("propacker.db")
        .expect("Nie udało się zainicjalizować bazy danych");

    tauri::Builder::default()
        .manage(db)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            start_allegro_auth,
            refresh_allegro_token,
            get_allegro_accounts,
            sync_allegro_orders,
        ])
        .run(tauri::generate_context!())
        .expect("Błąd podczas uruchamiania aplikacji");
}