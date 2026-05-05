import { Injectable } from '@nestjs/common';
import axios from 'axios';

type InpostOrganizationResponse = {
  id?: number | string;
  name?: string;
  email?: string;
  status?: string;
  tax_id?: string;
  [key: string]: unknown;
};

@Injectable()
export class InpostShipxService {
  private readonly shipxBaseUrl = 'https://api-shipx-pl.easypack24.net';

  async getOrganizationByCredentials(
    organizationId: string,
    apiToken: string,
  ): Promise<InpostOrganizationResponse> {
    if (!organizationId) {
      throw new Error('Brak organizationId.');
    }

    if (!apiToken) {
      throw new Error('Brak apiToken.');
    }

    const response = await axios.get<InpostOrganizationResponse>(
      `${this.shipxBaseUrl}/v1/organizations/${organizationId}`,
      {
        headers: this.getShipxHeaders(apiToken),
      },
    );

    return response.data;
  }

  async createShipmentByCredentials(
    organizationId: string,
    apiToken: string,
    payload: Record<string, unknown>,
  ) {
    if (!organizationId) {
      throw new Error('Brak organizationId.');
    }

    if (!apiToken) {
      throw new Error('Brak apiToken.');
    }

    const response = await axios.post(
      `${this.shipxBaseUrl}/v1/organizations/${organizationId}/shipments`,
      payload,
      {
        headers: this.getShipxHeaders(apiToken),
      },
    );

    return response.data;
  }

  async getShipmentLabelByCredentials(
    organizationId: string,
    apiToken: string,
    externalShipmentId: string,
    format = 'pdf',
  ): Promise<Buffer> {
    if (!organizationId) {
      throw new Error('Brak organizationId.');
    }

    if (!apiToken) {
      throw new Error('Brak apiToken.');
    }

    if (!externalShipmentId) {
      throw new Error('Brak externalShipmentId.');
    }

    const normalizedFormat = String(format || 'pdf').toLowerCase();

    const response = await axios.get(
      `${this.shipxBaseUrl}/v1/organizations/${organizationId}/shipments/${externalShipmentId}/label`,
      {
        headers: {
          ...this.getShipxHeaders(apiToken),
          Accept: `application/${normalizedFormat}`,
        },
        responseType: 'arraybuffer',
      },
    );

    return Buffer.from(response.data);
  }

  private getShipxHeaders(apiToken: string) {
    return {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }
}