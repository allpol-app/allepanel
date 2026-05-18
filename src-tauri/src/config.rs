pub struct AppConfig {
    pub allegro_client_id: String,
    pub allegro_client_secret: String,
    pub allegro_redirect_uri: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();
        Self {
            allegro_client_id: std::env::var("ALLEGRO_CLIENT_ID")
                .expect("Brak ALLEGRO_CLIENT_ID"),
            allegro_client_secret: std::env::var("ALLEGRO_CLIENT_SECRET")
                .expect("Brak ALLEGRO_CLIENT_SECRET"),
            allegro_redirect_uri: std::env::var("ALLEGRO_REDIRECT_URI")
                .expect("Brak ALLEGRO_REDIRECT_URI"),
        }
    }
}