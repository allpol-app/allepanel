use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::config::AppConfig;

const ALLEGRO_AUTH_URL: &str = "https://allegro.pl/auth/oauth/authorize";
const ALLEGRO_TOKEN_URL: &str = "https://allegro.pl/auth/oauth/token";

pub struct AllegroAuthService {
    config: AppConfig,
    http_client: Client,
}

#[derive(Deserialize)]
pub struct AllegroTokenResponse {
    pub access_token: String,
    pub expires_in: u64,
    pub refresh_token: String,
}

//profil allegro
#[derive(Deserialize, Serialize)]
pub struct AllegroBaseMarketplace {
    pub id: String,
}
#[derive(Deserialize, Serialize)]
pub struct AllegroCompany {
    pub name: String,
    #[serde(rename = "taxId")]  // JSON ma camelCase, Rust ma snake_case - serde tłumaczy
    pub tax_id: String,
}

#[derive(Deserialize)]
pub struct AllegroProfile {
    pub id: String,
    pub login: String,
    pub email: Option<String>,
    #[serde(rename = "firstName")]
    pub first_name: Option<String>,
    #[serde(rename = "lastName")]
    pub last_name: Option<String>,
    #[serde(rename = "baseMarketplace")]
    pub base_marketplace: Option<AllegroBaseMarketplace>,
    pub company: Option<AllegroCompany>,
    pub features: Option<Vec<String>>,  // Vec<String> = tablica stringów, odpowiednik string[] w TS
}

impl AllegroAuthService {

    pub fn new(config: AppConfig) -> Self {
        Self {
            config,
            http_client: Client::new(),
        }
    }

    //generowanie verifier i sha256 verifier
    pub fn generate_code_verifier() -> String {
        let mut verifier = [0u8; 80];
        getrandom::getrandom(&mut verifier).expect("Nie udalo sie wygenerowac code verifier");
        URL_SAFE_NO_PAD.encode(verifier)
    }

    fn generate_code_challenge(verifier: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(verifier.as_bytes());
        let hash = hasher.finalize();
        URL_SAFE_NO_PAD.encode(hash)
    }

    //generowanie linku do logowania
    pub fn generate_auth_url(&self, code_verifier: &str) -> String {
        let challenge = Self::generate_code_challenge(code_verifier);
        
        let scopes = [
            "allegro:api:orders:read",
            "allegro:api:orders:write",
            "allegro:api:sale:offers:read",
            "allegro:api:shipments:read",
            "allegro:api:shipments:write",
            "allegro:api:profile:read",
            "allegro:api:fulfillment:read",
            "allegro:api:fulfillment:write",
        ]
        .join("%20");

        format!(
            "{}?response_type=code&client_id={}&redirect_uri={}&code_challenge_method=S256&code_challenge={}&scope={}&prompt=confirm",
            ALLEGRO_AUTH_URL,
            self.config.allegro_client_id,
            self.config.allegro_redirect_uri,
            challenge,
            scopes
        )
    }

    //wymiana code na tokeny
    pub async fn exchange_code_for_tokens(
        &self,
        code: &str,
        code_verifier: &str,
    ) -> Result<AllegroTokenResponse, String> {
        let body = format!(
            "grant_type=authorization_code&code={}&redirect_uri={}&code_verifier={}&client_id={}",
            code,
            self.config.allegro_redirect_uri,
            code_verifier,
            self.config.allegro_client_id
        );

        let response = self.http_client.post(ALLEGRO_TOKEN_URL).header("Content-Type", "application/x-www-form-urlencoded").body(body).send().await.map_err(|e| format!("Błąd przy wymianie code na token: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Allegro zwróciło błąd {}: {}!", status, text))
        }

        response
            .json::<AllegroTokenResponse>()
            .await
            .map_err(|e| format!("Błąd przy parsowaniu odpowiedzi allegro: {}!", e))
    }

    //refresh tokenow
    pub async fn refresh_token(&self, refresh_token: &str) ->Result<AllegroTokenResponse, String> {
        let client_secret = {
            let raw = format!(
                "{}:{}",
                self.config.allegro_client_id,
                self.config.allegro_client_secret
            );
            base64::engine::general_purpose::STANDARD.encode(raw)
        };

        let body = format!(
            "grant_type=refresh_token&refresh_token={}",
            refresh_token
        );

        let response = self
            .http_client
            .post(ALLEGRO_TOKEN_URL)
            .header("Authorization", format!("Basic {}", client_secret))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await
            .map_err(|e| format!("Błąd przy refresh: {}!", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Allegro zwróciło błąd {}: {}", status, text));
        }

        response
            .json::<AllegroTokenResponse>()
            .await
            .map_err(|e| format!("Błąd parsowania odpowiedzi Allegro: {}", e))
    }

    pub async fn get_allegro_profile(
        &self,
        access_token: &str
    ) -> Result<AllegroProfile, String> {
        let response = self
            .http_client
            .get("https://api.allegro.pl/me")
            .header("Authorization", format!("Bearer {}", access_token))
            .header("Accept", "application/vnd.allegro.public.v1+json")
            .send()
            .await
            .map_err(|e| format!("Nie udało się pobrać informacji o profilu: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("Allegro zwróciło błąd {}: {}", status, text));
        }

        response
            .json::<AllegroProfile>()
            .await
            .map_err(|e| format!("Błąd parsowania profilu: {}", e))
    }
}