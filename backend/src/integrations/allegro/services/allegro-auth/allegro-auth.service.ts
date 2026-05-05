import { Injectable } from '@nestjs/common';
import axios from 'axios';


@Injectable()
export class AllegroAuthService {
  private readonly allegroAuthUrl = 'https://allegro.pl/auth/oauth/authorize';
  private readonly allegroTokenUrl = 'https://allegro.pl/auth/oauth/token';

  // AllegroAuthService po dostaniu accountID zwraca link do OAuth
  createAuthUrl(accountId: number): string {
    const clientId = process.env.ALLEGRO_CLIENT_ID;
    const appUrl = process.env.APP_URL;

    if (!clientId) {
      throw new Error('Brak ALLEGRO_CLIENT_ID w .env');
    }

    if (!appUrl) {
      throw new Error('Brak APP_URL w .env');
    }

    const redirectUri = `${appUrl}/integrations/allegro/callback`;

    const scopes = [
      'allegro:api:orders:read',
      'allegro:api:orders:write',
      'allegro:api:sale:offers:read',
      'allegro:api:shipments:read',
      'allegro:api:shipments:write',
      'allegro:api:profile:read',
      'allegro:api:fulfillment:read',
      'allegro:api:fulfillment:write'
    ].join(' ');

    const params = new URLSearchParams();

    params.append('response_type', 'code');
    params.append('client_id', clientId);
    params.append('redirect_uri', redirectUri);
    params.append('scope', scopes);
    params.append('state', String(accountId));
    params.append('prompt', 'confirm');

    return `${this.allegroAuthUrl}?${params.toString()}`;
  }
  
  //wymiana code na tokeny
  async exchangeCodeForTokens(code: string) {
    const clientId = process.env.ALLEGRO_CLIENT_ID;
    const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;
    const appUrl = process.env.APP_URL;

    if (!clientId) {
      throw new Error('Brak ALLEGRO_CLIENT_ID w .env');
    }

    if (!clientSecret) {
      throw new Error('Brak ALLEGRO_CLIENT_SECRET w .env');
    }

    if (!appUrl) {
      throw new Error('Brak APP_URL w .env');
    }

    if (!code) {
      throw new Error('Brak code');
    }

    const redirectUri = `${appUrl}/integrations/allegro/callback`;

    const basicAuth = Buffer
      .from(`${clientId}:${clientSecret}`)
      .toString('base64');

    const body = new URLSearchParams();

    body.append('grant_type', 'authorization_code');
    body.append('code', code);
    body.append('redirect_uri', redirectUri);

    const response = await axios.post(
      this.allegroTokenUrl,
      body.toString(),
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    return response.data;
  }

    //odswiezanie tokena
  async refreshAccessToken(refreshToken: string) {
      const clientId = process.env.ALLEGRO_CLIENT_ID;
      const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;

      if (!clientId) {
        throw new Error('Brak ALLEGRO_CLIENT_ID w .env');
      }

      if (!clientSecret) {
        throw new Error('Brak ALLEGRO_CLIENT_SECRET w .env');
      }

      if (!refreshToken) {
        throw new Error('Brak refresh_token');
      }

      const basicAuth = Buffer
        .from(`${clientId}:${clientSecret}`)
        .toString('base64');

      const body = new URLSearchParams();

      body.append('grant_type', 'refresh_token');
      body.append('refresh_token', refreshToken);

      const response = await axios.post(
        this.allegroTokenUrl,
        body.toString(),
        {
        headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );

    return response.data;
  }

  async getCurrentAllegroUser(accessToken: string) {
    if (!accessToken) {
      throw new Error('Brak access_token');
    }

    const response = await axios.get('https://api.allegro.pl/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.allegro.public.v1+json',
        'Content-Type': 'application/vnd.allegro.public.v1+json',
      },
    });

    return response.data as {
    id: string;
      login: string;
      email?: string;
      baseMarketplace?: {
        id?: string;
      };
      company?: {
        name?: string;
        taxId?: string;
      };
      features?: string[];
    };
  }
}