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

type LabelRequestSettings = {
  queryFormat: 'pdf' | 'zpl' | 'epl';
  accept: string;
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
    format = 'pdf-a6',
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

    const labelSettings = this.getLabelRequestSettings(format);

    const response = await axios.get(
      `${this.shipxBaseUrl}/v1/shipments/${externalShipmentId}/label?format=${labelSettings.queryFormat}`,
      {
        headers: {
          ...this.getShipxHeaders(apiToken),
          Accept: labelSettings.accept,
        },
        responseType: 'arraybuffer',
      },
    );

    return Buffer.from(response.data);
  }

  private getLabelRequestSettings(format: string): LabelRequestSettings {
    const normalized = String(format || 'pdf-a6').toLowerCase().trim();

    if (normalized === 'zpl') {
      return {
        queryFormat: 'zpl',
        accept: 'text/zpl;dpi=203',
      };
    }

    if (normalized === 'epl' || normalized === 'epl2') {
      return {
        queryFormat: 'epl',
        accept: 'text/epl2;dpi=203',
      };
    }

    if (normalized === 'pdf-a4' || normalized === 'a4') {
      return {
        queryFormat: 'pdf',
        accept: 'application/pdf;format=A4',
      };
    }

    return {
      queryFormat: 'pdf',
      accept: 'application/pdf;format=A6',
    };
  }

  private getShipxHeaders(apiToken: string) {
    return {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }
}