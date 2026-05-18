use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;

use crate::config::AppConfig;
use crate::integrations::allegro::auth::AllegroAuthService;

//funckja pomocnicza do wycaigania wartosci code z requesta allegro
fn get_code_from_request(request_line: &str) -> Result<String,String> {
    let code_start = request_line
        .find("code=")
        .ok_or("Brak code w request Allegro")?;

    let after_code = &request_line[code_start +5..];

    let code_end = after_code
        .find[|c| c == '&'| c == ' ']
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
        .map_err(|e| format!("Błąd przy czytaniu requestu", e))?;

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

    let _ = reader.get_mut().write_all(html_response.as_bytes());

    Ok(code)
}

#[tauri::command]
pub async fn start_allegro_auth(app: AppHandle) -> Result<String, String> {
    let config = AppConfig::from_env();
    let service = AllegroAuthService::new();

    let code_verifier = AllegroAuthService::generate_code_verifier();

    let auth_url = service.generate_auth_url(code_verifier);

    tauri::opener::open_url(&app, &auth_url, None)
        .map_err(|e| format!("Nie udało sie otworzyc przeglądarki, {}", e))?;

    let code = wait_for_allegro_callback().await?;

    let tokens = service.exchange_code_for_tokens(&code, &code_verifier).await?;

    let profile = service.get_allegro_profile(&tokens.access_token).await?;
}