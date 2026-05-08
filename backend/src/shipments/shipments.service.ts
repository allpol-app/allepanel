import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InpostShipxService } from '../integrations/inpost/services/inpost-shipx/inpost-shipx.service';
import { AllegroShipmentsService } from '../integrations/allegro/services/allegro-shipments/allegro-shipments.service';
import {
  Marketplace,
  ShipmentParcelSize,
  ShipmentProvider,
  ShipmentStatus,
  ShippingAccountStatus,
  ShippingProvider,
} from '../generated/prisma/enums';

type PrepareInpostShipmentBody = {
  shippingAccountId?: number;
  parcelSize?: string;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  labelFormat?: string;
};

type CreateShipmentBody = PrepareInpostShipmentBody & {
  mode?: string;
  deliveryMethodId?: string;
  credentialsId?: string;
  description?: string;
  reference?: string;
  insuranceAmount?: number;
  codAmount?: number;
  returnLabel?: boolean;
};

type InpostParcelSize = 'A' | 'B' | 'C';

type ParcelDimensions = {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

type ShipmentOptionsTabKey =
  | 'ALLEGRO'
  | 'INPOST_COURIER'
  | 'INPOST_LOCKER'
  | 'TEMU_SHIPPING'
  | 'OTHER';

const INPOST_PARCEL_LIMITS: Record<InpostParcelSize, ParcelDimensions> = {
  A: {
    lengthCm: 64,
    widthCm: 38,
    heightCm: 8,
  },
  B: {
    lengthCm: 64,
    widthCm: 38,
    heightCm: 19,
  },
  C: {
    lengthCm: 64,
    widthCm: 38,
    heightCm: 41,
  },
};

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inpostShipxService: InpostShipxService,
    private readonly allegroShipmentsService: AllegroShipmentsService,
  ) {}

  // GET /shipments/orders/:orderId/options
  // Bezpieczny endpoint dla frontendu. Niczego nie tworzy w Allegro ani InPost.
  async getShipmentOptionsForOrder(userId: number, orderId: number) {
    if (!Number.isInteger(orderId)) {
      throw new BadRequestException('Niepoprawne orderId.');
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
        deletedAt: null,
      },
      include: {
        marketplaceAccount: {
          select: {
            id: true,
            accountName: true,
            marketplace: true,
            externalAccountId: true,
            status: true,
          },
        },
        items: {
          orderBy: {
            id: 'asc',
          },
        },
        shipments: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            id: 'desc',
          },
          select: {
            id: true,
            provider: true,
            status: true,
            externalShipmentId: true,
            externalCommandId: true,
            trackingNumber: true,
            labelFormat: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(
        'Nie znaleziono zamówienia albo zamówienie nie należy do tego użytkownika.',
      );
    }

    const warnings: string[] = [];

    const inpostAccounts = await this.prisma.shippingAccount.findMany({
      where: {
        userId,
        provider: ShippingProvider.INPOST_SHIPX,
        status: ShippingAccountStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: {
        id: 'desc',
      },
      select: {
        id: true,
        provider: true,
        accountName: true,
        organizationId: true,
        organizationName: true,
        organizationEmail: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    let allegroServices: any[] = [];
    let allegroServiceMatch: any = null;

    const canCheckAllegro =
      order.marketplace === Marketplace.ALLEGRO &&
      Number.isInteger(order.marketplaceAccountId);

    if (canCheckAllegro) {
      try {
        const deliveryServices =
          await this.allegroShipmentsService.getDeliveryServicesForAccount(
            userId,
            order.marketplaceAccountId,
          );

        allegroServices = deliveryServices.services ?? [];
      } catch (error: any) {
        warnings.push(
          `Nie udało się pobrać usług Wysyłam z Allegro: ${this.extractErrorMessage(error)}`,
        );
      }

      try {
        allegroServiceMatch =
          await this.allegroShipmentsService.findDeliveryServiceForOrder(
            userId,
            order.id,
          );
      } catch (error: any) {
        warnings.push(
          `Nie udało się automatycznie dopasować usługi Allegro: ${this.extractErrorMessage(error)}`,
        );
      }
    }

    if (inpostAccounts.length === 0) {
      warnings.push('Brak aktywnego konta InPost ShipX.');
    }

    if (canCheckAllegro && allegroServices.length === 0) {
      warnings.push('Brak dostępnych usług Wysyłam z Allegro dla tego konta.');
    }

    const defaultTab = this.detectDefaultShipmentTab(
      order,
      inpostAccounts.length,
      allegroServices.length,
      allegroServiceMatch,
    );

    const defaultDescription = this.buildContentsDescription(order.items);
    const defaultReference = order.externalOrderId || String(order.id);
    const defaultInsuranceAmount = this.toNumberOrNull(
      order.totalToPay ?? order.paymentAmount ?? order.totalAmount,
    );

    const defaultAllegroService =
      allegroServiceMatch?.allegroShipmentManagement?.selected ?? null;

    return {
      ok: true,
      mode: 'options_only',
      message:
        'Endpoint zwraca opcje formularza przesyłki. Nie tworzy żadnej przesyłki.',
      defaultTab,
      order: {
        id: order.id,
        externalOrderId: order.externalOrderId,
        marketplace: order.marketplace,
        marketplaceAccountId: order.marketplaceAccountId,
        marketplaceAccountName: order.marketplaceAccount?.accountName ?? null,
        status: order.status,
        externalOrderStatus: order.externalOrderStatus,
        externalFulfillmentStatus: order.externalFulfillmentStatus,
        deliveryMethodId: order.deliveryMethodId,
        deliveryMethodName: order.deliveryMethodName,
        pickupPointId: order.pickupPointId,
        pickupPointName: order.pickupPointName,
        totalAmount: order.totalAmount,
        totalToPay: order.totalToPay,
        currency: order.currency,
        paymentAmount: order.paymentAmount,
        paymentCurrency: order.paymentCurrency,
        invoiceRequired: order.invoiceRequired,
        orderCreatedAt: order.orderCreatedAt,
      },
      receiver: {
        name: this.buildReceiverName(order),
        companyName: order.buyerCompanyName,
        email: order.buyerEmail,
        phone: this.normalizePhone(order.deliveryPhone || order.buyerPhone),
        street: order.deliveryStreet,
        city: order.deliveryCity,
        zipCode: order.deliveryZipCode,
        countryCode: order.deliveryCountryCode,
        pickupPointId: order.pickupPointId,
        pickupPointName: order.pickupPointName,
      },
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        productImageUrl: item.productImageUrl,
        quantity: item.quantity,
        price: item.price,
        currency: item.currency,
        externalOfferId: item.externalOfferId,
      })),
      existingShipments: order.shipments,
      tabs: this.buildShipmentTabs({
        defaultTab,
        canCheckAllegro,
        allegroServicesCount: allegroServices.length,
        inpostAccountsCount: inpostAccounts.length,
      }),
      defaults: {
        account: {
          allegroMarketplaceAccountId: order.marketplaceAccountId ?? null,
          inpostShippingAccountId: inpostAccounts[0]?.id ?? null,
        },
        package: {
          parcelSize: this.getDefaultInpostParcelSize(order.deliveryMethodName),
          weightKg: null,
          lengthCm: null,
          widthCm: null,
          heightCm: null,
          labelFormat: 'PDF',
          description: defaultDescription,
          reference: defaultReference,
          insuranceAmount: defaultInsuranceAmount,
          codAmount: null,
          returnLabel: false,
        },
        allegro: {
          selectedDeliveryMethodId:
            defaultAllegroService?.deliveryMethodId || order.deliveryMethodId || null,
          selectedCredentialsId: defaultAllegroService?.credentialsId || null,
        },
      },
      providers: {
        allegro: {
          available: canCheckAllegro && allegroServices.length > 0,
          marketplaceAccountId: order.marketplaceAccountId,
          marketplaceAccountName: order.marketplaceAccount?.accountName ?? null,
          serviceMatch: allegroServiceMatch,
          services: allegroServices,
        },
        inpostShipx: {
          available: inpostAccounts.length > 0,
          accounts: inpostAccounts,
          parcelLimits: INPOST_PARCEL_LIMITS,
        },
        temuShipping: {
          available: false,
          message: 'Temu Shipping jest placeholderem pod przyszłą integrację.',
        },
        other: {
          available: true,
          message:
            'Sekcja Inne może później obsłużyć ręczne lub niestandardowe metody nadania.',
        },
      },
      requirements: {
        ALLEGRO: {
          requiredFields: [
            'deliveryMethodId',
            'weightKg',
            'lengthCm',
            'widthCm',
            'heightCm',
            'description',
            'reference',
          ],
        },
        INPOST_COURIER: {
          requiredFields: [
            'shippingAccountId',
            'weightKg',
            'lengthCm',
            'widthCm',
            'heightCm',
            'description',
            'reference',
          ],
        },
        INPOST_LOCKER: {
          requiredFields: [
            'shippingAccountId',
            'parcelSize',
            'weightKg',
            'lengthCm',
            'widthCm',
            'heightCm',
            'description',
            'reference',
            'targetPoint',
          ],
        },
      },
      warnings,
    };
  }

   // POST /shipments/orders/:orderId/create
  // Wspólny endpoint do REALNEGO nadawania paczki.
  // Uwaga: ten endpoint może utworzyć prawdziwą przesyłkę u operatora.
  async createShipmentForOrder(
    userId: number,
    orderId: number,
    body: CreateShipmentBody,
  ) {
    if (!Number.isInteger(orderId)) {
      throw new BadRequestException('Niepoprawne orderId.');
    }

    const mode = String(body.mode || '').trim().toUpperCase();

    if (!mode) {
      throw new BadRequestException('Wybierz sposób nadania przesyłki.');
    }

    if (mode === 'TEMU_SHIPPING') {
      throw new BadRequestException(
        'Temu Shipping nie jest jeszcze obsługiwane w tym projekcie.',
      );
    }

    if (mode === 'OTHER') {
      throw new BadRequestException(
        'Nadawanie przez sekcję Inne nie jest jeszcze obsługiwane.',
      );
    }

    if (
      mode === 'INPOST' ||
      mode === 'INPOST_SHIPX' ||
      mode === 'INPOST_LOCKER' ||
      mode === 'INPOST_COURIER'
    ) {
      const result = await this.createInpostShipmentForOrder(userId, orderId, {
        shippingAccountId: body.shippingAccountId,
        parcelSize: body.parcelSize || 'B',
        weightKg: body.weightKg,
        lengthCm: body.lengthCm,
        widthCm: body.widthCm,
        heightCm: body.heightCm,
        labelFormat: body.labelFormat || 'pdf',
      });

      return {
        ...result,
        unifiedEndpoint: true,
        selectedMode: mode,
        provider: ShipmentProvider.INPOST_SHIPX,
        nextStep:
          'Jeśli przesyłka została utworzona, możesz pobrać etykietę przez GET /shipments/:shipmentId/label?format=pdf.',
      };
    }

    if (mode === 'ALLEGRO' || mode === 'ALLEGRO_SHIPMENT_MANAGEMENT') {
      const result =
        await this.allegroShipmentsService.createAllegroShipmentCommandForOrder(
          userId,
          orderId,
          {
            weightKg: body.weightKg,
            lengthCm: body.lengthCm,
            widthCm: body.widthCm,
            heightCm: body.heightCm,
            labelFormat: body.labelFormat || 'PDF',
          },
        );

      return {
        ...result,
        unifiedEndpoint: true,
        selectedMode: mode,
        provider: ShipmentProvider.ALLEGRO_SHIPMENT_MANAGEMENT,
        nextStep:
          'Allegro tworzy komendę nadania. Następnie sprawdź status przez GET /integrations/allegro/shipments/:shipmentId/command. Po otrzymaniu externalShipmentId możesz pobrać etykietę.',
      };
    }

    throw new BadRequestException(`Nieobsługiwany sposób nadania: ${mode}`);
  }

  async prepareInpostShipmentForOrder(
    userId: number,
    orderId: number,
    body: PrepareInpostShipmentBody,
  ) {
    if (!Number.isInteger(orderId)) {
      throw new BadRequestException('Niepoprawne orderId.');
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: orderId,
        userId,
        deletedAt: null,
      },
      include: {
        items: {
          orderBy: {
            id: 'asc',
          },
        },
        marketplaceAccount: {
          select: {
            id: true,
            accountName: true,
            marketplace: true,
            externalAccountId: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(
        'Nie znaleziono zamówienia albo zamówienie nie należy do tego użytkownika.',
      );
    }

    const shippingAccount = await this.getInpostShippingAccount(
      userId,
      body.shippingAccountId,
    );

    const missing: string[] = [];

    const deliveryMethodName = order.deliveryMethodName || '';
    const isInpostOrder = this.isInpostDeliveryMethod(deliveryMethodName);

    if (!isInpostOrder) {
      missing.push('delivery_method_is_not_inpost');
    }

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

    const receiverName = this.buildReceiverName(order);
    const receiverPhone = this.normalizePhone(
      order.deliveryPhone || order.buyerPhone,
    );

    if (!receiverName) {
      missing.push('receiver_name');
    }

    if (!order.buyerEmail) {
      missing.push('receiver_email');
    }

    if (!receiverPhone) {
      missing.push('receiver_phone');
    }

    const isLocker = this.isLockerDelivery(order);

    if (isLocker && !order.pickupPointId) {
      missing.push('target_point');
    }

    if (!isLocker) {
      if (!order.deliveryStreet) missing.push('receiver_street');
      if (!order.deliveryCity) missing.push('receiver_city');
      if (!order.deliveryZipCode) missing.push('receiver_zip_code');
      if (!order.deliveryCountryCode) missing.push('receiver_country_code');
    }

    const parcelValidation = this.validateInpostParcelInput(body);

    if (Object.keys(parcelValidation.fieldErrors).length > 0) {
      missing.push('package_fields_invalid');
    }

    if (order.items.length === 0) {
      missing.push('order_items');
    }

    const uniqueMissing = [...new Set(missing)];

    const service = this.getShipxServiceForOrder(order);
    const parcel = this.buildShipxParcel(
      parcelValidation.parcelSize,
      parcelValidation.weightKg,
      parcelValidation.dimensions,
    );

    const payloadPreview = {
      service,
      receiver: {
        name: receiverName,
        company_name: order.buyerCompanyName || undefined,
        email: order.buyerEmail || undefined,
        phone: receiverPhone || undefined,
      },
      parcels: [parcel],
      custom_attributes: {
        target_point: isLocker ? order.pickupPointId || undefined : undefined,
        sending_method: isLocker ? 'parcel_locker' : 'dispatch_order',
      },
      reference: order.externalOrderId,
      comments: order.items
        .map((item) => item.productName)
        .join(', ')
        .slice(0, 100),
    };

    return {
      ok: uniqueMissing.length === 0,
      mode: 'preview_only',
      message:
        'Ten endpoint tylko przygotowuje payload. Nie tworzy przesyłki w InPost.',
      order: {
        id: order.id,
        externalOrderId: order.externalOrderId,
        marketplace: order.marketplace,
        marketplaceAccountId: order.marketplaceAccountId,
        marketplaceAccountName: order.marketplaceAccount.accountName,
        externalOrderStatus: order.externalOrderStatus,
        externalFulfillmentStatus: order.externalFulfillmentStatus,
        deliveryMethodId: order.deliveryMethodId,
        deliveryMethodName: order.deliveryMethodName,
        pickupPointId: order.pickupPointId,
        pickupPointName: order.pickupPointName,
      },
      shippingAccount: {
        id: shippingAccount.id,
        provider: shippingAccount.provider,
        accountName: shippingAccount.accountName,
        organizationId: shippingAccount.organizationId,
        organizationName: shippingAccount.organizationName,
        organizationEmail: shippingAccount.organizationEmail,
        status: shippingAccount.status,
      },
      parcelInput: {
        parcelSize: parcelValidation.parcelSize,
        weightKg: parcelValidation.weightKg,
        dimensions: parcelValidation.dimensions,
      },
      receiverFromOrder: {
        name: receiverName,
        companyName: order.buyerCompanyName,
        email: order.buyerEmail,
        phone: receiverPhone,
        street: order.deliveryStreet,
        city: order.deliveryCity,
        zipCode: order.deliveryZipCode,
        countryCode: order.deliveryCountryCode,
        pickupPointId: order.pickupPointId,
        pickupPointName: order.pickupPointName,
      },
      canCreateShipmentLater: uniqueMissing.length === 0,
      missing: uniqueMissing,
      fieldErrors: parcelValidation.fieldErrors,
      payloadPreview,
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
        currency: item.currency,
        externalOfferId: item.externalOfferId,
        productImageUrl: item.productImageUrl,
      })),
    };
  }

  private async getInpostShippingAccount(
    userId: number,
    shippingAccountId?: number,
  ) {
    if (shippingAccountId !== undefined && shippingAccountId !== null) {
      if (!Number.isInteger(Number(shippingAccountId))) {
        throw new BadRequestException('Niepoprawne shippingAccountId.');
      }

      const account = await this.prisma.shippingAccount.findFirst({
        where: {
          id: Number(shippingAccountId),
          userId,
          provider: ShippingProvider.INPOST_SHIPX,
          status: ShippingAccountStatus.ACTIVE,
          deletedAt: null,
        },
      });

      if (!account) {
        throw new ForbiddenException(
          'Nie znaleziono aktywnego konta InPost ShipX dla tego użytkownika.',
        );
      }

      return account;
    }

    const account = await this.prisma.shippingAccount.findFirst({
      where: {
        userId,
        provider: ShippingProvider.INPOST_SHIPX,
        status: ShippingAccountStatus.ACTIVE,
        deletedAt: null,
      },
      orderBy: {
        id: 'desc',
      },
    });

    if (!account) {
      throw new ForbiddenException(
        'Ten użytkownik nie ma aktywnego konta InPost ShipX.',
      );
    }

    return account;
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

  private isLockerDelivery(order: {
    pickupPointId?: string | null;
    deliveryMethodName?: string | null;
  }) {
    const name = String(order.deliveryMethodName || '').toLowerCase();

    return (
      Boolean(order.pickupPointId) ||
      name.includes('paczkomat') ||
      name.includes('paczko') ||
      name.includes('one box')
    );
  }

  private getShipxServiceForOrder(order: {
    pickupPointId?: string | null;
    deliveryMethodName?: string | null;
  }) {
    return this.isLockerDelivery(order)
      ? 'inpost_locker_standard'
      : 'inpost_courier_standard';
  }

  private buildReceiverName(order: {
    deliveryFirstName?: string | null;
    deliveryLastName?: string | null;
    buyerLogin?: string | null;
    buyerEmail?: string | null;
  }) {
    const name = [order.deliveryFirstName, order.deliveryLastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return name || order.buyerLogin || order.buyerEmail || null;
  }

  private normalizePhone(phone?: string | null) {
    if (!phone) {
      return null;
    }

    return String(phone).replace(/\s+/g, '').replace(/^\+48/, '');
  }

  private normalizeParcelSize(size?: string): InpostParcelSize | null {
    const normalized = String(size || '').toUpperCase();

    if (['A', 'B', 'C'].includes(normalized)) {
      return normalized as InpostParcelSize;
    }

    return null;
  }

  private validateInpostParcelInput(body: PrepareInpostShipmentBody) {
    const fieldErrors: Record<string, string> = {};

    const parcelSize = this.normalizeParcelSize(body.parcelSize);

    if (!parcelSize) {
      fieldErrors.parcelSize = 'Wybierz gabaryt A, B albo C.';
    }

    const weightKg = Number(body.weightKg);

    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      fieldErrors.weightKg = 'Waga musi być większa niż 0 kg.';
    }

    const lengthCm = Number(body.lengthCm);
    const widthCm = Number(body.widthCm);
    const heightCm = Number(body.heightCm);

    if (!Number.isFinite(lengthCm) || lengthCm <= 0) {
      fieldErrors.lengthCm = 'Długość musi być większa niż 0 cm.';
    }

    if (!Number.isFinite(widthCm) || widthCm <= 0) {
      fieldErrors.widthCm = 'Szerokość musi być większa niż 0 cm.';
    }

    if (!Number.isFinite(heightCm) || heightCm <= 0) {
      fieldErrors.heightCm = 'Wysokość musi być większa niż 0 cm.';
    }

    if (parcelSize) {
      const limits = INPOST_PARCEL_LIMITS[parcelSize];

      if (Number.isFinite(lengthCm) && lengthCm > limits.lengthCm) {
        fieldErrors.lengthCm = `Maksymalna długość dla gabarytu ${parcelSize} to ${limits.lengthCm} cm.`;
      }

      if (Number.isFinite(widthCm) && widthCm > limits.widthCm) {
        fieldErrors.widthCm = `Maksymalna szerokość dla gabarytu ${parcelSize} to ${limits.widthCm} cm.`;
      }

      if (Number.isFinite(heightCm) && heightCm > limits.heightCm) {
        fieldErrors.heightCm = `Maksymalna wysokość dla gabarytu ${parcelSize} to ${limits.heightCm} cm.`;
      }
    }

    const hasErrors = Object.keys(fieldErrors).length > 0;

    return {
      fieldErrors,
      parcelSize,
      weightKg,
      dimensions: hasErrors
        ? null
        : {
            lengthCm,
            widthCm,
            heightCm,
          },
    };
  }

  private buildShipxParcel(
    parcelSize: InpostParcelSize | null,
    weightKg: number,
    dimensions: ParcelDimensions | null,
  ) {
    const parcel: any = {
      weight: Number.isFinite(weightKg)
        ? {
            amount: weightKg,
            unit: 'kg',
          }
        : undefined,
    };

    if (parcelSize) {
      parcel.template = this.getShipxTemplate(parcelSize);
    }

    if (dimensions) {
      parcel.dimensions = {
        length: dimensions.lengthCm * 10,
        width: dimensions.widthCm * 10,
        height: dimensions.heightCm * 10,
        unit: 'mm',
      };
    }

    return parcel;
  }

  private getShipxTemplate(parcelSize: InpostParcelSize) {
    const map: Record<InpostParcelSize, string> = {
      A: 'small',
      B: 'medium',
      C: 'large',
    };

    return map[parcelSize];
  }

  // POST /shipments/orders/:orderId/create-inpost
  // Służy do REALNEGO nadania przesyłki przez InPost ShipX.
  // Tego endpointu nie odpalaj testowo, jeśli nie chcesz utworzyć paczki.
  async createInpostShipmentForOrder(
    userId: number,
    orderId: number,
    body: PrepareInpostShipmentBody,
  ) {
    const prepared = await this.prepareInpostShipmentForOrder(
      userId,
      orderId,
      body,
    );

    if (!prepared.ok) {
      throw new BadRequestException({
        message:
          'Nie można nadać przesyłki. Dane paczki lub zamówienia są niepoprawne.',
        missing: prepared.missing,
        fieldErrors: prepared.fieldErrors,
      });
    }

    const existingShipment = await this.prisma.shipment.findFirst({
      where: {
        userId,
        orderId,
        provider: ShipmentProvider.INPOST_SHIPX,
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
        'Dla tego zamówienia istnieje już utworzona przesyłka InPost.',
      );
    }

    const shippingAccount = await this.getFullInpostShippingAccount(
      userId,
      prepared.shippingAccount.id,
    );

    const labelFormat = String(body.labelFormat || 'pdf').toLowerCase();

    const rawRequest = this.toJsonSafe(prepared.payloadPreview);

    try {
      const shipxResponse =
        await this.inpostShipxService.createShipmentByCredentials(
          shippingAccount.organizationId,
          shippingAccount.apiToken,
          rawRequest,
        );

      const externalShipmentId = this.extractExternalShipmentId(shipxResponse);
      const trackingNumber = this.extractTrackingNumber(shipxResponse);

      const savedShipment = await this.prisma.shipment.create({
        data: {
          userId,
          orderId,
          shippingAccountId: shippingAccount.id,

          provider: ShipmentProvider.INPOST_SHIPX,
          status: ShipmentStatus.CREATED,

          parcelSize: prepared.parcelInput.parcelSize
            ? ShipmentParcelSize[prepared.parcelInput.parcelSize]
            : null,

          weightKg: prepared.parcelInput.weightKg
            ? String(prepared.parcelInput.weightKg)
            : null,

          lengthCm: prepared.parcelInput.dimensions?.lengthCm
            ? String(prepared.parcelInput.dimensions.lengthCm)
            : null,

          widthCm: prepared.parcelInput.dimensions?.widthCm
            ? String(prepared.parcelInput.dimensions.widthCm)
            : null,

          heightCm: prepared.parcelInput.dimensions?.heightCm
            ? String(prepared.parcelInput.dimensions.heightCm)
            : null,

          externalShipmentId,
          trackingNumber,

          labelFormat,
          labelPath: null,

          errorMessage: null,
          rawRequest,
          rawResponse: this.toJsonSafe(shipxResponse),
        },
      });

      let fulfillmentUpdate: any = null;

      try {
        fulfillmentUpdate = await this.allegroShipmentsService.markOrderReadyForShipment(
          userId,
          orderId,
        );
      } catch (statusError: any) {
        fulfillmentUpdate = {
          ok: false,
          message:
            statusError?.response?.data ||
            statusError?.message ||
            'Nie udało się zmienić statusu Allegro na READY_FOR_SHIPMENT.',
        };
      }

      return {
        ok: true,
        message: 'Przesyłka InPost została utworzona.',
        shipment: {
          id: savedShipment.id,
          orderId: savedShipment.orderId,
          provider: savedShipment.provider,
          status: savedShipment.status,
          externalShipmentId: savedShipment.externalShipmentId,
          trackingNumber: savedShipment.trackingNumber,
          labelFormat: savedShipment.labelFormat,
          createdAt: savedShipment.createdAt,
          updatedAt: savedShipment.updatedAt,
        },
        fulfillmentUpdate,
      };
    } catch (error: any) {
      const errorDetails = error.response?.data || {
        message: error.message,
      };

      const errorMessage =
        typeof errorDetails === 'string'
          ? errorDetails
          : JSON.stringify(errorDetails);

      await this.prisma.shipment.create({
        data: {
          userId,
          orderId,
          shippingAccountId: shippingAccount.id,

          provider: ShipmentProvider.INPOST_SHIPX,
          status: ShipmentStatus.ERROR,

          parcelSize: prepared.parcelInput.parcelSize
            ? ShipmentParcelSize[prepared.parcelInput.parcelSize]
            : null,

          weightKg: prepared.parcelInput.weightKg
            ? String(prepared.parcelInput.weightKg)
            : null,

          lengthCm: prepared.parcelInput.dimensions?.lengthCm
            ? String(prepared.parcelInput.dimensions.lengthCm)
            : null,

          widthCm: prepared.parcelInput.dimensions?.widthCm
            ? String(prepared.parcelInput.dimensions.widthCm)
            : null,

          heightCm: prepared.parcelInput.dimensions?.heightCm
            ? String(prepared.parcelInput.dimensions.heightCm)
            : null,

          externalShipmentId: null,
          trackingNumber: null,

          labelFormat,
          labelPath: null,

          errorMessage,
          rawRequest,
          rawResponse: this.toJsonSafe(errorDetails),
        },
      });

      throw new BadRequestException({
        message: 'InPost ShipX odrzucił utworzenie przesyłki.',
        details: errorDetails,
      });
    }
  }

  // GET /shipments/:shipmentId/label
  // Służy do pobrania etykiety PDF/ZPL/EPL dla przesyłki utworzonej w InPost ShipX.
  async getInpostShipmentLabelForUser(
    userId: number,
    shipmentId: number,
    format = 'pdf',
  ) {
    if (!Number.isInteger(shipmentId)) {
      throw new BadRequestException('Niepoprawne shipmentId.');
    }

    const shipment = await this.prisma.shipment.findFirst({
      where: {
        id: shipmentId,
        userId,
        provider: ShipmentProvider.INPOST_SHIPX,
        deletedAt: null,
      },
      include: {
        shippingAccount: true,
      },
    });

    if (!shipment) {
      throw new NotFoundException(
        'Nie znaleziono przesyłki InPost dla tego użytkownika.',
      );
    }

    if (!shipment.externalShipmentId) {
      throw new BadRequestException(
        'Ta przesyłka nie ma externalShipmentId z InPost.',
      );
    }

    if (!shipment.shippingAccount) {
      throw new BadRequestException(
        'Ta przesyłka nie ma przypisanego konta InPost.',
      );
    }

    const normalizedFormat = String(format || shipment.labelFormat || 'pdf')
      .toLowerCase()
      .trim();

    const labelBuffer =
      await this.inpostShipxService.getShipmentLabelByCredentials(
        shipment.shippingAccount.organizationId,
        shipment.shippingAccount.apiToken,
        shipment.externalShipmentId,
        normalizedFormat,
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
        labelFormat: normalizedFormat,
      },
    });

    return {
      buffer: labelBuffer,
      contentType: this.getLabelContentType(normalizedFormat),
      filename: `inpost-label-${shipment.id}.${this.getLabelExtension(normalizedFormat)}`,
    };
  }

  private async getFullInpostShippingAccount(
    userId: number,
    shippingAccountId: number,
  ) {
    const account = await this.prisma.shippingAccount.findFirst({
      where: {
        id: shippingAccountId,
        userId,
        provider: ShippingProvider.INPOST_SHIPX,
        status: ShippingAccountStatus.ACTIVE,
        deletedAt: null,
      },
    });

    if (!account) {
      throw new ForbiddenException(
        'Nie znaleziono aktywnego konta InPost ShipX dla tego użytkownika.',
      );
    }

    return account;
  }

  private extractExternalShipmentId(shipxResponse: any): string | null {
    const value =
      shipxResponse?.id ??
      shipxResponse?.shipment_id ??
      shipxResponse?.shipmentId ??
      null;

    return value ? String(value) : null;
  }

  private extractTrackingNumber(shipxResponse: any): string | null {
    const value =
      shipxResponse?.tracking_number ??
      shipxResponse?.trackingNumber ??
      shipxResponse?.tracking_details?.number ??
      shipxResponse?.parcels?.[0]?.tracking_number ??
      shipxResponse?.parcels?.[0]?.trackingNumber ??
      null;

    return value ? String(value) : null;
  }

   private getLabelContentType(format: string) {
    const normalized = String(format || '').toLowerCase().trim();

    if (normalized === 'zpl') {
      return 'text/plain; charset=utf-8';
    }

    if (normalized === 'epl' || normalized === 'epl2') {
      return 'text/plain; charset=utf-8';
    }

    return 'application/pdf';
  }

  private getLabelExtension(format: string) {
    const normalized = String(format || '').toLowerCase().trim();

    if (normalized === 'zpl') {
      return 'zpl';
    }

    if (normalized === 'epl' || normalized === 'epl2') {
      return 'epl';
    }

    return 'pdf';
  }

  private toJsonSafe(value: unknown) {
    return JSON.parse(JSON.stringify(value));
  }

  private buildShipmentTabs(input: {
    defaultTab: ShipmentOptionsTabKey;
    canCheckAllegro: boolean;
    allegroServicesCount: number;
    inpostAccountsCount: number;
  }) {
    return [
      {
        key: 'ALLEGRO',
        label: 'Allegro.pl',
        enabled: input.canCheckAllegro && input.allegroServicesCount > 0,
        recommended: input.defaultTab === 'ALLEGRO',
        reason:
          input.canCheckAllegro && input.allegroServicesCount > 0
            ? null
            : 'Brak dostępnych usług Wysyłam z Allegro.',
      },
      {
        key: 'INPOST_COURIER',
        label: 'InPost Kurier',
        enabled: input.inpostAccountsCount > 0,
        recommended: input.defaultTab === 'INPOST_COURIER',
        reason:
          input.inpostAccountsCount > 0
            ? null
            : 'Brak aktywnego konta InPost ShipX.',
      },
      {
        key: 'INPOST_LOCKER',
        label: 'InPost Paczkomaty',
        enabled: input.inpostAccountsCount > 0,
        recommended: input.defaultTab === 'INPOST_LOCKER',
        reason:
          input.inpostAccountsCount > 0
            ? null
            : 'Brak aktywnego konta InPost ShipX.',
      },
      {
        key: 'TEMU_SHIPPING',
        label: 'Temu Shipping',
        enabled: false,
        recommended: input.defaultTab === 'TEMU_SHIPPING',
        reason: 'Integracja będzie dodana później.',
      },
      {
        key: 'OTHER',
        label: 'Inne',
        enabled: true,
        recommended: input.defaultTab === 'OTHER',
        reason: null,
      },
    ];
  }

  private detectDefaultShipmentTab(
    order: {
      deliveryMethodName?: string | null;
      pickupPointId?: string | null;
    },
    inpostAccountsCount: number,
    allegroServicesCount: number,
    allegroServiceMatch: any,
  ): ShipmentOptionsTabKey {
    if (
      allegroServiceMatch?.recommendedProvider ===
        'ALLEGRO_SHIPMENT_MANAGEMENT' &&
      allegroServicesCount > 0
    ) {
      return 'ALLEGRO';
    }

    if (allegroServiceMatch?.recommendedProvider === 'INPOST_SHIPX') {
      return this.isLockerDelivery(order) ? 'INPOST_LOCKER' : 'INPOST_COURIER';
    }

    if (this.isInpostDeliveryMethod(order.deliveryMethodName)) {
      return this.isLockerDelivery(order) ? 'INPOST_LOCKER' : 'INPOST_COURIER';
    }

    if (allegroServicesCount > 0) {
      return 'ALLEGRO';
    }

    if (inpostAccountsCount > 0) {
      return 'INPOST_COURIER';
    }

    return 'OTHER';
  }

  private getDefaultInpostParcelSize(deliveryMethodName?: string | null) {
    const name = String(deliveryMethodName || '').toLowerCase();

    if (name.includes('gabaryt a')) return 'A';
    if (name.includes('gabaryt b')) return 'B';
    if (name.includes('gabaryt c')) return 'C';

    return 'B';
  }

  private buildContentsDescription(items: { productName?: string | null }[]) {
    const description = items
      .map((item) => item.productName)
      .filter(Boolean)
      .join(', ')
      .trim();

    return description.slice(0, 100) || 'Towar ze sprzedaży internetowej';
  }

  private toNumberOrNull(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private extractErrorMessage(error: any) {
    const responseData = error?.response?.data;

    if (typeof responseData === 'string') {
      return responseData;
    }

    if (responseData?.message) {
      return Array.isArray(responseData.message)
        ? responseData.message.join(', ')
        : String(responseData.message);
    }

    if (responseData?.errors) {
      try {
        return JSON.stringify(responseData.errors);
      } catch {
        return 'Błąd API zewnętrznego.';
      }
    }

    return error?.message || 'Nieznany błąd.';
  }
}
