import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AllegroAuthService } from '../allegro-auth/allegro-auth.service';
import {
  Marketplace,
  MarketplaceAccountStatus,
  ShippingAccountStatus,
  ShippingProvider,
  ShipmentProvider,
  ShipmentStatus,
} from '../../../../generated/prisma/enums';

type AllegroDeliveryService = {
  id?: {
    deliveryMethodId?: string;
    credentialsId?: string;
  } | string;
  deliveryMethodId?: string;
  credentialsId?: string;
  name?: string;
  carrierId?: string;
  additionalServices?: unknown[];
  [key: string]: unknown;
};

type AllegroDeliveryServicesResponse = {
  deliveryServices?: AllegroDeliveryService[];
  services?: AllegroDeliveryService[];
  [key: string]: unknown;
};

type AllegroShipmentPackageInput = {
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  labelFormat?: string;
};

@Injectable()
export class AllegroShipmentsService {
  private readonly allegroApiBaseUrl = 'https://api.allegro.pl';
  private normalizePhone(phone?: string | null) {
  if (!phone) {
    return null;
  }

  return String(phone).replace(/\s+/g, '').replace(/^\+48/, '');
}

  constructor(
    private readonly prisma: PrismaService,
    private readonly allegroAuthService: AllegroAuthService,
  ) {}

  async getDeliveryServicesForAccount(
    userId: number,
    marketplaceAccountId: number,
  ) {
    const accessToken = await this.getValidAccessTokenForAccount(
      userId,
      marketplaceAccountId,
    );

    const response = await axios.get<AllegroDeliveryServicesResponse>(
      `${this.allegroApiBaseUrl}/shipment-management/delivery-services`,
      {
        headers: this.getAllegroHeaders(accessToken),
      },
    );

    const services = this.normalizeDeliveryServices(response.data);

    return {
      ok: true,
      marketplaceAccountId,
      totalServices: services.length,
      services: services.map((service) => this.simplifyDeliveryService(service)),
      raw: response.data,
    };
  }

  async findDeliveryServiceForOrder(userId: number, orderId: number) {
    if (!Number.isInteger(orderId)) {
      throw new BadRequestException('Niepoprawne orderId.');
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
        marketplace: Marketplace.ALLEGRO,
        deletedAt: null,
      },
      include: {
        marketplaceAccount: {
          select: {
            id: true,
            accountName: true,
            marketplace: true,
            status: true,
            externalAccountId: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(
        'Nie znaleziono zamówienia Allegro dla tego użytkownika.',
      );
    }

    if (!order.deliveryMethodId) {
      throw new BadRequestException(
        'Zamówienie nie ma deliveryMethodId z Allegro.',
      );
    }

    const isInpost = this.isInpostDeliveryMethod(order.deliveryMethodName);
    const activeInpostShipxAccount = await this.prisma.shippingAccount.findFirst({
      where: {
        userId,
        provider: ShippingProvider.INPOST_SHIPX,
        status: ShippingAccountStatus.ACTIVE,
        deletedAt: null,
      },
      select: {
        id: true,
        accountName: true,
        organizationId: true,
        organizationName: true,
        status: true,
      },
      orderBy: {
        id: 'desc',
      },
    });

    if (isInpost && activeInpostShipxAccount) {
      return {
        ok: true,
        orderId: order.id,
        marketplaceAccountId: order.marketplaceAccountId,
        deliveryMethodId: order.deliveryMethodId,
        deliveryMethodName: order.deliveryMethodName,
        recommendedProvider: 'INPOST_SHIPX',
        message:
          'Zamówienie wygląda na InPost i użytkownik ma aktywne konto InPost ShipX. Wysyłam z Allegro nie jest wymagane dla tej ścieżki.',
        inpostShipxAccount: activeInpostShipxAccount,
        allegroShipmentManagement: {
          checked: false,
          totalServices: 0,
          matches: [],
          selected: null,
        },
      };
    }

    const accessToken = await this.getValidAccessTokenForAccount(
      userId,
      order.marketplaceAccountId,
    );

    const response = await axios.get<AllegroDeliveryServicesResponse>(
      `${this.allegroApiBaseUrl}/shipment-management/delivery-services`,
      {
        headers: this.getAllegroHeaders(accessToken),
      },
    );

    const services = this.normalizeDeliveryServices(response.data);

    const deliveryMethodId = order.deliveryMethodId;

if (!deliveryMethodId) {
  throw new BadRequestException(
    'Zamówienie nie ma deliveryMethodId z Allegro.',
  );
}

const matches = services.filter((service) =>
  this.deliveryServiceMatchesMethod(service, deliveryMethodId),
);

    const selected = matches[0] ?? null;

    return {
      ok: matches.length > 0,
      orderId: order.id,
      marketplaceAccountId: order.marketplaceAccountId,
      deliveryMethodId: order.deliveryMethodId,
      deliveryMethodName: order.deliveryMethodName,
      recommendedProvider:
        matches.length > 0 ? 'ALLEGRO_SHIPMENT_MANAGEMENT' : 'UNKNOWN',
      message:
        matches.length > 0
          ? 'Znaleziono usługę Wysyłam z Allegro pasującą do deliveryMethodId zamówienia.'
          : 'Nie znaleziono usługi Wysyłam z Allegro pasującej do deliveryMethodId zamówienia.',
      allegroShipmentManagement: {
        checked: true,
        totalServices: services.length,
        matchesCount: matches.length,
        selected: selected ? this.simplifyDeliveryService(selected) : null,
        matches: matches.map((service) => this.simplifyDeliveryService(service)),
      },
    };
  }

  async prepareAllegroShipmentForOrder(
  userId: number,
  orderId: number,
  body: {
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    labelFormat?: string;
  },
) {
  if (!Number.isInteger(orderId)) {
    throw new BadRequestException('Niepoprawne orderId.');
  }

  const order = await this.prisma.order.findFirst({
    where: {
      id: orderId,
      userId,
      marketplace: Marketplace.ALLEGRO,
      deletedAt: null,
    },
    include: {
      marketplaceAccount: {
        select: {
          id: true,
          accountName: true,
          marketplace: true,
          status: true,
          externalAccountId: true,
        },
      },
      items: {
        orderBy: {
          id: 'asc',
        },
      },
    },
  });

  if (!order) {
    throw new NotFoundException(
      'Nie znaleziono zamówienia Allegro dla tego użytkownika.',
    );
  }

  if (!order.deliveryMethodId) {
    throw new BadRequestException(
      'Zamówienie nie ma deliveryMethodId z Allegro.',
    );
  }

  const serviceMatch = await this.findDeliveryServiceForOrder(userId, orderId);

  if (serviceMatch.recommendedProvider !== 'ALLEGRO_SHIPMENT_MANAGEMENT') {
    return {
      ok: false,
      orderId: order.id,
      marketplaceAccountId: order.marketplaceAccountId,
      recommendedProvider: serviceMatch.recommendedProvider,
      message:
        'To zamówienie nie powinno być nadawane przez Wysyłam z Allegro według obecnej logiki.',
      serviceMatch,
    };
  }

  const selectedService =
    serviceMatch.allegroShipmentManagement?.selected ?? null;

  if (!selectedService) {
    return {
      ok: false,
      orderId: order.id,
      marketplaceAccountId: order.marketplaceAccountId,
      recommendedProvider: 'UNKNOWN',
      message:
        'Nie znaleziono usługi Wysyłam z Allegro pasującej do tego zamówienia.',
      serviceMatch,
    };
  }

  const fieldErrors: Record<string, string> = {};

  const weightKg = Number(body.weightKg);
  const lengthCm = Number(body.lengthCm);
  const widthCm = Number(body.widthCm);
  const heightCm = Number(body.heightCm);

  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    fieldErrors.weightKg = 'Waga musi być większa niż 0 kg.';
  }

  if (!Number.isFinite(lengthCm) || lengthCm <= 0) {
    fieldErrors.lengthCm = 'Długość musi być większa niż 0 cm.';
  }

  if (!Number.isFinite(widthCm) || widthCm <= 0) {
    fieldErrors.widthCm = 'Szerokość musi być większa niż 0 cm.';
  }

  if (!Number.isFinite(heightCm) || heightCm <= 0) {
    fieldErrors.heightCm = 'Wysokość musi być większa niż 0 cm.';
  }

  const receiverName = [
    order.deliveryFirstName,
    order.deliveryLastName,
  ]
    .filter(Boolean)
    .join(' ')
    .trim() || order.buyerLogin || order.buyerEmail;

  const receiverPhone = this.normalizePhone(
    order.deliveryPhone || order.buyerPhone,
  );

  const missing: string[] = [];

  if (order.externalOrderStatus !== 'READY_FOR_PROCESSING') {
    missing.push('order_status_not_ready_for_processing');
  }

  if (
    !['NEW', 'PROCESSING', 'READY_FOR_SHIPMENT'].includes(
      order.externalFulfillmentStatus || '',
    )
  ) {
    missing.push('fulfillment_status_not_supported_for_shipment');
  }

  if (!receiverName) missing.push('receiver_name');
  if (!order.buyerEmail) missing.push('receiver_email');
  if (!receiverPhone) missing.push('receiver_phone');
  if (!order.deliveryStreet) missing.push('receiver_street');
  if (!order.deliveryCity) missing.push('receiver_city');
  if (!order.deliveryZipCode) missing.push('receiver_zip_code');
  if (!order.deliveryCountryCode) missing.push('receiver_country_code');
  if (order.items.length === 0) missing.push('order_items');

  if (Object.keys(fieldErrors).length > 0) {
    missing.push('package_fields_invalid');
  }

  const labelFormat = String(body.labelFormat || 'PDF').toUpperCase();

  const packageData = {
    type: 'PACKAGE',
    length: Number.isFinite(lengthCm)
      ? { value: lengthCm, unit: 'CENTIMETER' }
      : null,
    width: Number.isFinite(widthCm)
      ? { value: widthCm, unit: 'CENTIMETER' }
      : null,
    height: Number.isFinite(heightCm)
      ? { value: heightCm, unit: 'CENTIMETER' }
      : null,
    weight: Number.isFinite(weightKg)
      ? { value: weightKg, unit: 'KILOGRAMS' }
      : null,
    textOnLabel: order.items
      .map((item) => item.productName)
      .join(', ')
      .slice(0, 100),
  };

  const payloadPreview = {
    input: {
      deliveryMethodId:
        selectedService.deliveryMethodId || order.deliveryMethodId,

      credentialsId: selectedService.credentialsId || null,

      receiver: {
        name: receiverName,
        company: order.buyerCompanyName || null,
        street: order.deliveryStreet,
        postalCode: order.deliveryZipCode,
        city: order.deliveryCity,
        countryCode: order.deliveryCountryCode,
        email: order.buyerEmail,
        phone: receiverPhone,
      },

      referenceNumber: order.externalOrderId,
      packages: [packageData],
      insurance: {
        amount: String(order.totalToPay ?? order.paymentAmount ?? 0),
        currency: order.paymentCurrency || order.currency || 'PLN',
      },
      labelFormat,
    },
  };

  const uniqueMissing = [...new Set(missing)];

  return {
    ok: uniqueMissing.length === 0,
    mode: 'preview_only',
    message:
      'Ten endpoint tylko przygotowuje payload dla Wysyłam z Allegro. Nie tworzy przesyłki.',
    order: {
      id: order.id,
      externalOrderId: order.externalOrderId,
      marketplaceAccountId: order.marketplaceAccountId,
      deliveryMethodId: order.deliveryMethodId,
      deliveryMethodName: order.deliveryMethodName,
      externalOrderStatus: order.externalOrderStatus,
      externalFulfillmentStatus: order.externalFulfillmentStatus,
    },
    selectedDeliveryService: selectedService,
    recommendedProvider: 'ALLEGRO_SHIPMENT_MANAGEMENT',
    canCreateShipmentLater: uniqueMissing.length === 0,
    missing: uniqueMissing,
    fieldErrors,
    payloadPreview,
  };
  }

  // POST /shipment-management/shipments/create-commands
// REALNIE tworzy komendę nadania paczki przez Wysyłam z Allegro.
// Nie odpalaj tego testowo, jeśli nie chcesz utworzyć przesyłki.
async createAllegroShipmentCommandForOrder(
  userId: number,
  orderId: number,
  body: AllegroShipmentPackageInput,
) {
  const prepared = await this.prepareAllegroShipmentForOrder(
    userId,
    orderId,
    body,
  );

  if (!prepared.ok) {
    throw new BadRequestException({
      message:
        'Nie można nadać przesyłki przez Wysyłam z Allegro. Dane są niepoprawne.',
      recommendedProvider: prepared.recommendedProvider,
      missing: prepared.missing ?? [],
      fieldErrors: prepared.fieldErrors ?? {},
      details: prepared,
    });
  }

  if (prepared.recommendedProvider !== 'ALLEGRO_SHIPMENT_MANAGEMENT') {
    throw new BadRequestException({
      message:
        'To zamówienie nie jest przeznaczone do nadania przez Wysyłam z Allegro według obecnej logiki.',
      recommendedProvider: prepared.recommendedProvider,
    });
  }

  const existingShipment = await this.prisma.shipment.findFirst({
    where: {
      userId,
      orderId,
      provider: ShipmentProvider.ALLEGRO_SHIPMENT_MANAGEMENT,
      deletedAt: null,
      status: {
        in: [
          ShipmentStatus.CREATED,
          ShipmentStatus.LABEL_READY,
          ShipmentStatus.SENT,
        ],
      },
    },
  });

  if (existingShipment) {
    throw new ConflictException(
      'Dla tego zamówienia istnieje już utworzona przesyłka przez Wysyłam z Allegro.',
    );
  }

  if (!prepared.order?.marketplaceAccountId) {
    throw new BadRequestException(
      'Brak marketplaceAccountId w przygotowanym payloadzie Wysyłam z Allegro.',
    );
  }
  
  const accessToken = await this.getValidAccessTokenForAccount(
    userId,
    prepared.order.marketplaceAccountId,
  );

  const rawRequest = this.toJsonSafe(prepared.payloadPreview);

  try {
    const response = await axios.post(
      `${this.allegroApiBaseUrl}/shipment-management/shipments/create-commands`,
      rawRequest,
      {
        headers: this.getAllegroHeaders(accessToken),
      },
    );

    const commandId = this.extractCommandId(response.data);

    const savedShipment = await this.prisma.shipment.create({
      data: {
        userId,
        orderId,

        provider: ShipmentProvider.ALLEGRO_SHIPMENT_MANAGEMENT,
        status: ShipmentStatus.CREATED,

        externalCommandId: commandId,
        externalShipmentId: null,
        trackingNumber: null,

        labelFormat: String(body.labelFormat || 'PDF').toUpperCase(),
        labelPath: null,

        weightKg: Number.isFinite(Number(body.weightKg))
          ? String(body.weightKg)
          : null,
        lengthCm: Number.isFinite(Number(body.lengthCm))
          ? String(body.lengthCm)
          : null,
        widthCm: Number.isFinite(Number(body.widthCm))
          ? String(body.widthCm)
          : null,
        heightCm: Number.isFinite(Number(body.heightCm))
          ? String(body.heightCm)
          : null,

        errorMessage: null,
        rawRequest,
        rawResponse: this.toJsonSafe(response.data),
      },
    });

    return {
      ok: true,
      message:
        'Komenda nadania przesyłki przez Wysyłam z Allegro została utworzona.',
      shipment: {
        id: savedShipment.id,
        orderId: savedShipment.orderId,
        provider: savedShipment.provider,
        status: savedShipment.status,
        externalCommandId: savedShipment.externalCommandId,
        externalShipmentId: savedShipment.externalShipmentId,
        trackingNumber: savedShipment.trackingNumber,
        labelFormat: savedShipment.labelFormat,
        createdAt: savedShipment.createdAt,
        updatedAt: savedShipment.updatedAt,
      },
      raw: response.data,
    };
  } catch (error: any) {
    const errorDetails = error.response?.data || {
      message: error.message,
    };

    await this.prisma.shipment.create({
      data: {
        userId,
        orderId,

        provider: ShipmentProvider.ALLEGRO_SHIPMENT_MANAGEMENT,
        status: ShipmentStatus.ERROR,

        externalCommandId: null,
        externalShipmentId: null,
        trackingNumber: null,

        labelFormat: String(body.labelFormat || 'PDF').toUpperCase(),
        labelPath: null,

        weightKg: Number.isFinite(Number(body.weightKg))
          ? String(body.weightKg)
          : null,
        lengthCm: Number.isFinite(Number(body.lengthCm))
          ? String(body.lengthCm)
          : null,
        widthCm: Number.isFinite(Number(body.widthCm))
          ? String(body.widthCm)
          : null,
        heightCm: Number.isFinite(Number(body.heightCm))
          ? String(body.heightCm)
          : null,

        errorMessage:
          typeof errorDetails === 'string'
            ? errorDetails
            : JSON.stringify(errorDetails),
        rawRequest,
        rawResponse: this.toJsonSafe(errorDetails),
      },
    });

    throw new BadRequestException({
      message: 'Allegro odrzuciło komendę nadania przesyłki.',
      details: errorDetails,
    });
  }
  }

  // GET /shipment-management/shipments/create-commands/{commandId}
// Sprawdza status komendy nadania i zapisuje shipmentId, jeśli Allegro go zwróci.
async getAllegroShipmentCommandForUser(userId: number, shipmentId: number) {
  if (!Number.isInteger(shipmentId)) {
    throw new BadRequestException('Niepoprawne shipmentId.');
  }

  const shipment = await this.prisma.shipment.findFirst({
    where: {
      id: shipmentId,
      userId,
      provider: ShipmentProvider.ALLEGRO_SHIPMENT_MANAGEMENT,
      deletedAt: null,
    },
    include: {
      order: true,
    },
  });

  if (!shipment) {
    throw new NotFoundException(
      'Nie znaleziono przesyłki Wysyłam z Allegro dla tego użytkownika.',
    );
  }

  if (!shipment.externalCommandId) {
    throw new BadRequestException(
      'Ta przesyłka nie ma externalCommandId komendy Allegro.',
    );
  }

  const accessToken = await this.getValidAccessTokenForAccount(
    userId,
    shipment.order.marketplaceAccountId,
  );

  const response = await axios.get(
    `${this.allegroApiBaseUrl}/shipment-management/shipments/create-commands/${shipment.externalCommandId}`,
    {
      headers: this.getAllegroHeaders(accessToken),
    },
  );

  const externalShipmentId = this.extractExternalShipmentId(response.data);
  const trackingNumber = this.extractTrackingNumber(response.data);
  const commandStatus = this.extractCommandStatus(response.data);

  const updatedShipment = await this.prisma.shipment.update({
    where: {
      id: shipment.id,
    },
    data: {
      externalShipmentId: externalShipmentId ?? shipment.externalShipmentId,
      trackingNumber: trackingNumber ?? shipment.trackingNumber,
      status:
        commandStatus === 'ERROR'
          ? ShipmentStatus.ERROR
          : shipment.status,
      errorMessage:
        commandStatus === 'ERROR'
          ? JSON.stringify(response.data?.errors ?? response.data)
          : shipment.errorMessage,
      rawResponse: this.toJsonSafe(response.data),
    },
  });

  return {
    ok: true,
    shipment: {
      id: updatedShipment.id,
      orderId: updatedShipment.orderId,
      provider: updatedShipment.provider,
      status: updatedShipment.status,
      externalCommandId: updatedShipment.externalCommandId,
      externalShipmentId: updatedShipment.externalShipmentId,
      trackingNumber: updatedShipment.trackingNumber,
    },
    command: response.data,
  };
  }

  // GET /shipment-management/shipments/{shipmentId}
// Pobiera szczegóły paczki z Wysyłam z Allegro.
async getAllegroShipmentDetailsForUser(userId: number, shipmentId: number) {
  if (!Number.isInteger(shipmentId)) {
    throw new BadRequestException('Niepoprawne shipmentId.');
  }

  const shipment = await this.prisma.shipment.findFirst({
    where: {
      id: shipmentId,
      userId,
      provider: ShipmentProvider.ALLEGRO_SHIPMENT_MANAGEMENT,
      deletedAt: null,
    },
    include: {
      order: true,
    },
  });

  if (!shipment) {
    throw new NotFoundException(
      'Nie znaleziono przesyłki Wysyłam z Allegro dla tego użytkownika.',
    );
  }

  if (!shipment.externalShipmentId) {
    throw new BadRequestException(
      'Ta przesyłka nie ma externalShipmentId paczki Allegro. Najpierw sprawdź komendę nadania.',
    );
  }

  const accessToken = await this.getValidAccessTokenForAccount(
    userId,
    shipment.order.marketplaceAccountId,
  );

  const response = await axios.get(
    `${this.allegroApiBaseUrl}/shipment-management/shipments/${shipment.externalShipmentId}`,
    {
      headers: this.getAllegroHeaders(accessToken),
    },
  );

  const trackingNumber = this.extractTrackingNumber(response.data);

  const updatedShipment = await this.prisma.shipment.update({
    where: {
      id: shipment.id,
    },
    data: {
      trackingNumber: trackingNumber ?? shipment.trackingNumber,
      rawResponse: this.toJsonSafe(response.data),
    },
  });

  return {
    ok: true,
    shipment: {
      id: updatedShipment.id,
      orderId: updatedShipment.orderId,
      provider: updatedShipment.provider,
      status: updatedShipment.status,
      externalCommandId: updatedShipment.externalCommandId,
      externalShipmentId: updatedShipment.externalShipmentId,
      trackingNumber: updatedShipment.trackingNumber,
    },
    details: response.data,
  };
  }

  // POST /shipment-management/label
// Pobiera etykietę dla paczki utworzonej przez Wysyłam z Allegro.
async getAllegroShipmentLabelForUser(
  userId: number,
  shipmentId: number,
  options?: {
    pageSize?: string;
    cutLine?: boolean;
  },
) {
  if (!Number.isInteger(shipmentId)) {
    throw new BadRequestException('Niepoprawne shipmentId.');
  }

  const shipment = await this.prisma.shipment.findFirst({
    where: {
      id: shipmentId,
      userId,
      provider: ShipmentProvider.ALLEGRO_SHIPMENT_MANAGEMENT,
      deletedAt: null,
    },
    include: {
      order: true,
    },
  });

  if (!shipment) {
    throw new NotFoundException(
      'Nie znaleziono przesyłki Wysyłam z Allegro dla tego użytkownika.',
    );
  }

  if (!shipment.externalShipmentId) {
    throw new BadRequestException(
      'Ta przesyłka nie ma externalShipmentId paczki Allegro.',
    );
  }

  const accessToken = await this.getValidAccessTokenForAccount(
    userId,
    shipment.order.marketplaceAccountId,
  );

  const pageSize = String(options?.pageSize || 'A4').toUpperCase();

  const response = await axios.post(
    `${this.allegroApiBaseUrl}/shipment-management/label`,
    {
      shipmentIds: [shipment.externalShipmentId],
      pageSize,
      cutLine: options?.cutLine ?? true,
    },
    {
      headers: {
        ...this.getAllegroHeaders(accessToken),
        Accept: 'application/octet-stream',
      },
      responseType: 'arraybuffer',
    },
  );

  await this.prisma.shipment.update({
    where: {
      id: shipment.id,
    },
    data: {
      status:
        shipment.status === ShipmentStatus.CREATED
          ? ShipmentStatus.LABEL_READY
          : shipment.status,
      labelFormat: 'PDF',
    },
  });

  return {
    buffer: Buffer.from(response.data),
    contentType: 'application/pdf',
    filename: `allegro-label-${shipment.id}.pdf`,
  };
  }

  private async getActiveAllegroAccountForUser(
    userId: number,
    marketplaceAccountId: number,
  ) {
    if (!Number.isInteger(marketplaceAccountId)) {
      throw new BadRequestException('Niepoprawne marketplaceAccountId.');
    }

    const marketplaceAccount = await this.prisma.marketplaceAccount.findFirst({
      where: {
        id: marketplaceAccountId,
        userId,
        marketplace: Marketplace.ALLEGRO,
        status: MarketplaceAccountStatus.ACTIVE,
        deletedAt: null,
      },
    });

    if (!marketplaceAccount) {
      throw new ForbiddenException(
        'Nie znaleziono aktywnego konta Allegro dla tego użytkownika.',
      );
    }

    return marketplaceAccount;
  }

  private async getValidAccessTokenForAccount(
    userId: number,
    marketplaceAccountId: number,
  ): Promise<string> {
    const marketplaceAccount = await this.getActiveAllegroAccountForUser(
      userId,
      marketplaceAccountId,
    );

    if (!marketplaceAccount.accessToken) {
      throw new ForbiddenException('Konto Allegro nie ma accessToken.');
    }

    if (!marketplaceAccount.refreshToken) {
      throw new ForbiddenException('Konto Allegro nie ma refreshToken.');
    }

    const now = new Date();
    const tokenExpiresAt = marketplaceAccount.tokenExpiresAt;

    const shouldRefresh =
      !tokenExpiresAt ||
      tokenExpiresAt.getTime() - now.getTime() < 1000 * 60 * 2;

    if (!shouldRefresh) {
      return marketplaceAccount.accessToken;
    }

    const refreshedTokens = await this.allegroAuthService.refreshAccessToken(
      marketplaceAccount.refreshToken,
    );

    const refreshedTokenExpiresAt = new Date();
    refreshedTokenExpiresAt.setSeconds(
      refreshedTokenExpiresAt.getSeconds() + refreshedTokens.expires_in,
    );

    await this.prisma.marketplaceAccount.update({
      where: {
        id: marketplaceAccount.id,
      },
      data: {
        accessToken: refreshedTokens.access_token,
        refreshToken:
          refreshedTokens.refresh_token ?? marketplaceAccount.refreshToken,
        tokenType: refreshedTokens.token_type ?? marketplaceAccount.tokenType,
        tokenExpiresAt: refreshedTokenExpiresAt,
        status: MarketplaceAccountStatus.ACTIVE,
        errorMessage: null,
      },
    });

    return refreshedTokens.access_token;
  }

  private normalizeDeliveryServices(
    data: AllegroDeliveryServicesResponse | AllegroDeliveryService[],
  ): AllegroDeliveryService[] {
    if (Array.isArray(data)) {
      return data;
    }

    if (Array.isArray(data.deliveryServices)) {
      return data.deliveryServices;
    }

    if (Array.isArray(data.services)) {
      return data.services;
    }

    return [];
  }

  private deliveryServiceMatchesMethod(
    service: AllegroDeliveryService,
    deliveryMethodId: string,
  ) {
    const serviceId =
      typeof service.id === 'object' ? service.id?.deliveryMethodId : service.id;

    return (
      serviceId === deliveryMethodId ||
      service.deliveryMethodId === deliveryMethodId
    );
  }

  private simplifyDeliveryService(service: AllegroDeliveryService) {
    return {
      id: service.id ?? null,
      deliveryMethodId:
        typeof service.id === 'object'
          ? service.id?.deliveryMethodId ?? service.deliveryMethodId ?? null
          : service.deliveryMethodId ?? service.id ?? null,
      credentialsId:
        typeof service.id === 'object'
          ? service.id?.credentialsId ?? service.credentialsId ?? null
          : service.credentialsId ?? null,
      name: service.name ?? null,
      carrierId: service.carrierId ?? null,
      additionalServices: service.additionalServices ?? [],
      rawKeys: Object.keys(service),
    };
  }

  private isInpostDeliveryMethod(deliveryMethodName?: string | null) {
    const name = String(deliveryMethodName || '').toLowerCase();

    return (
      name.includes('inpost') ||
      name.includes('paczkomat') ||
      name.includes('paczko') ||
      name.includes('one box')
    );
  }

  private getAllegroHeaders(accessToken: string) {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.allegro.public.v1+json',
      'Content-Type': 'application/vnd.allegro.public.v1+json',
    };
  }

  private extractCommandId(data: any): string | null {
  const value =
    data?.commandId ??
    data?.id ??
    data?.data?.commandId ??
    null;

  return value ? String(value) : null;
}

private extractCommandStatus(data: any): string | null {
  const value =
    data?.status ??
    data?.commandStatus ??
    data?.data?.status ??
    null;

  return value ? String(value) : null;
}

private extractExternalShipmentId(data: any): string | null {
  const value =
    data?.shipmentId ??
    data?.shipment?.id ??
    data?.output?.shipmentId ??
    data?.output?.shipment?.id ??
    data?.result?.shipmentId ??
    null;

  return value ? String(value) : null;
}

private extractTrackingNumber(data: any): string | null {
  const value =
    data?.trackingNumber ??
    data?.tracking_number ??
    data?.waybill ??
    data?.shipment?.trackingNumber ??
    data?.shipment?.tracking_number ??
    data?.trackingDetails?.number ??
    data?.tracking_details?.number ??
    null;

  return value ? String(value) : null;
}

private toJsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}
}