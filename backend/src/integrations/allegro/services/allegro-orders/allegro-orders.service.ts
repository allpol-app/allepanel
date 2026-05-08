import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AllegroAuthService } from '../allegro-auth/allegro-auth.service';
import {
  Marketplace,
  MarketplaceAccountStatus,
  OrderStatus,
} from '../../../../generated/prisma/enums';

type AllegroMoney = {
  amount?: string;
  currency?: string;
};

type AllegroCheckoutForm = {
  id: string;
  status?: string;
  messageToSeller?: string | null;
  updatedAt?: string | null;
  revision?: string | null;

  marketplace?: {
    id?: string;
  };

  buyer?: {
    id?: string;
    login?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    companyName?: string;
    phoneNumber?: string;
    guest?: boolean;
  };

  fulfillment?: {
    status?: string;
    shipmentSummary?: {
      lineItemsSent?: string;
    };
  };

  delivery?: {
    address?: {
      firstName?: string;
      lastName?: string;
      street?: string;
      city?: string;
      zipCode?: string;
      countryCode?: string;
      phoneNumber?: string;
    };
    pickupPoint?: {
      id?: string;
      name?: string;
    };
    method?: {
      id?: string;
      name?: string;
    };
    cost?: AllegroMoney;
    smart?: boolean;
  };

  payment?: {
    id?: string;
    type?: string;
    provider?: string;
    finishedAt?: string | null;
    paidAmount?: AllegroMoney;
  };

  summary?: {
    totalToPay?: AllegroMoney;
  };

  invoice?: {
    required?: boolean;
  };

  lineItems?: AllegroLineItem[];
};

type AllegroLineItem = {
  id?: string;
  offer?: {
    id?: string;
    name?: string;
  };
  quantity?: number;
  originalPrice?: AllegroMoney;
  price?: AllegroMoney;
  boughtAt?: string;
};

type AllegroCheckoutFormsResponse = {
  checkoutForms?: AllegroCheckoutForm[];
  count?: number;
  totalCount?: number;
};

type SyncOrdersResult = {
  marketplaceAccountId: number;
  fetched: number;
  savedOrders: number;
  savedItems: number;
  totalCount: number;
  statusRefresh: {
    checked: number;
    updated: number;
    movedToArchive: number;
  };
};



// Pobieramy jako nowe / aktywne tylko opłacone zamówienia gotowe do obsługi.
// Nie pobieramy READY_FOR_SHIPMENT / SENT / PICKED_UP / READY_FOR_PICKUP jako nowych.
const ACTIVE_SYNC_FULFILLMENT_STATUSES = ['NEW', 'PROCESSING'];

// Zamówienia nieopłacone pobieramy tylko jako BOUGHT.
// FILLED_IN pomijamy, bo Allegro może zwrócić wiele wersji FOD przed zakończeniem płatności.
const UNPAID_SYNC_ORDER_STATUSES = ['BOUGHT'];

const SHIPPED_FULFILLMENT_STATUSES = [
  'READY_FOR_SHIPMENT',
  'SENT',
  'PICKED_UP',
  'READY_FOR_PICKUP',
];

const CANCELLED_EXTERNAL_ORDER_STATUSES = [
  'CANCELLED',
  'BUYER_CANCELLED',
  'AUTO_CANCELLED',
];

@Injectable()
export class AllegroOrdersService {
  private readonly allegroApiBaseUrl = 'https://api.allegro.pl';

  constructor(
    private readonly prisma: PrismaService,
    private readonly allegroAuthService: AllegroAuthService,
  ) {}

  /**
   * TEST 1:
   * Pobiera zamówienia z Allegro dla jednego konta marketplace.
   * Jeszcze nic nie zapisuje do PostgreSQL.
   */
  
  async fetchOrdersForAccount(
    userId: number,
    marketplaceAccountId: number,
  ): Promise<AllegroCheckoutFormsResponse> {
    const accessToken = await this.getValidAccessTokenForAccount(
      userId,
      marketplaceAccountId,
    );

    const readyForProcessing = await this.fetchCheckoutFormsByFilters(
      accessToken,
      {
        status: ['READY_FOR_PROCESSING'],
        fulfillmentStatus: ACTIVE_SYNC_FULFILLMENT_STATUSES,
      },
    );

    const unpaid = await this.fetchCheckoutFormsByFilters(accessToken, {
      status: UNPAID_SYNC_ORDER_STATUSES,
      fulfillmentStatus: [],
    });

    const byId = new Map<string, AllegroCheckoutForm>();

    for (const order of [...readyForProcessing.checkoutForms, ...unpaid.checkoutForms]) {
      byId.set(order.id, order);
    }

    const checkoutForms = Array.from(byId.values());

    return {
      checkoutForms,
      count: checkoutForms.length,
      totalCount: checkoutForms.length,
    };
  }

  private async fetchCheckoutFormsByFilters(
    accessToken: string,
    filters: {
      status: string[];
      fulfillmentStatus: string[];
    },
  ): Promise<{ checkoutForms: AllegroCheckoutForm[]; totalCount: number }> {
    const limit = 100;
    let offset = 0;
    let totalCount = 0;
    const allCheckoutForms: AllegroCheckoutForm[] = [];

    while (true) {
      const params = new URLSearchParams();

      params.append('limit', String(limit));
      params.append('offset', String(offset));

      for (const status of filters.status) {
        params.append('status', status);
      }

      for (const status of filters.fulfillmentStatus) {
        params.append('fulfillment.status', status);
      }

      const response = await axios.get<AllegroCheckoutFormsResponse>(
        `${this.allegroApiBaseUrl}/order/checkout-forms?${params.toString()}`,
        {
          headers: this.getAllegroHeaders(accessToken),
        },
      );

      const checkoutForms = response.data.checkoutForms ?? [];
      allCheckoutForms.push(...checkoutForms);

      totalCount = response.data.totalCount ?? allCheckoutForms.length;

      if (checkoutForms.length < limit) break;

      offset += limit;

      if (offset >= totalCount) break;
    }

    return {
      checkoutForms: allCheckoutForms,
      totalCount,
    };
  }

  /**
   * TEST 2:
   * Pobiera zamówienia z Allegro i zapisuje/aktualizuje je w tabelach:
   * - orders
   * - order_items
   */
  async syncOrdersForAccount(
    userId: number,
    marketplaceAccountId: number,
  ): Promise<SyncOrdersResult> {
    const marketplaceAccount = await this.getActiveAllegroAccountForUser(
      userId,
      marketplaceAccountId,
    );

    const accessToken = await this.getValidAccessTokenForAccount(
      userId,
      marketplaceAccountId,
    );

    const data = await this.fetchOrdersForAccount(userId, marketplaceAccountId);
    const checkoutForms = data.checkoutForms ?? [];

    const imageByOfferId = await this.fetchImagesForOrders(
      accessToken,
      checkoutForms,
    );

    let savedOrders = 0;
    let savedItems = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const allegroOrder of checkoutForms) {
        const lineItems = allegroOrder.lineItems ?? [];

        const totalToPay = this.toDecimalString(
          allegroOrder.summary?.totalToPay?.amount,
          0,
        );

        const totalCurrency =
          allegroOrder.summary?.totalToPay?.currency ?? 'PLN';

        const totalAmount = this.calculateProductsTotal(lineItems);

        const fulfillmentStatus = allegroOrder.fulfillment?.status ?? null;
        const externalOrderStatus = allegroOrder.status ?? null;

        const localStatus = this.mapToLocalOrderStatus(
          externalOrderStatus,
          fulfillmentStatus,
        );

        const orderCreatedAt = this.getOrderCreatedAt(lineItems);
        const syncedAt = new Date();

        const savedOrder = await tx.order.upsert({
          where: {
            marketplaceAccountId_externalOrderId: {
              marketplaceAccountId,
              externalOrderId: allegroOrder.id,
            },
          },
          create: {
            externalOrderId: allegroOrder.id,
            marketplace: Marketplace.ALLEGRO,

            userId: marketplaceAccount.userId,
            marketplaceAccountId: marketplaceAccount.id,

            status: localStatus,

            externalOrderStatus,
            externalFulfillmentStatus: fulfillmentStatus,
            externalLineItemsSentStatus:
              allegroOrder.fulfillment?.shipmentSummary?.lineItemsSent ?? null,

            totalAmount,
            totalToPay,
            currency: totalCurrency,

            orderCreatedAt,
            externalUpdatedAt: this.toDateOrNull(allegroOrder.updatedAt),
            syncedAt,

            messageToSeller: allegroOrder.messageToSeller ?? null,

            buyerId: allegroOrder.buyer?.id ?? null,
            buyerLogin: allegroOrder.buyer?.login ?? null,
            buyerEmail: allegroOrder.buyer?.email ?? null,
            buyerFirstName: allegroOrder.buyer?.firstName ?? null,
            buyerLastName: allegroOrder.buyer?.lastName ?? null,
            buyerCompanyName: allegroOrder.buyer?.companyName ?? null,
            buyerPhone: allegroOrder.buyer?.phoneNumber ?? null,
            buyerGuest: Boolean(allegroOrder.buyer?.guest),

            deliveryMethodId: allegroOrder.delivery?.method?.id ?? null,
            deliveryMethodName: allegroOrder.delivery?.method?.name ?? null,

            deliveryFirstName:
              allegroOrder.delivery?.address?.firstName ?? null,
            deliveryLastName: allegroOrder.delivery?.address?.lastName ?? null,
            deliveryStreet: allegroOrder.delivery?.address?.street ?? null,
            deliveryCity: allegroOrder.delivery?.address?.city ?? null,
            deliveryZipCode: allegroOrder.delivery?.address?.zipCode ?? null,
            deliveryCountryCode:
              allegroOrder.delivery?.address?.countryCode ?? null,
            deliveryPhone: allegroOrder.delivery?.address?.phoneNumber ?? null,

            pickupPointId: allegroOrder.delivery?.pickupPoint?.id ?? null,
            pickupPointName: allegroOrder.delivery?.pickupPoint?.name ?? null,

            deliveryCost: this.toDecimalString(
              allegroOrder.delivery?.cost?.amount,
              0,
            ),
            deliveryCurrency:
              allegroOrder.delivery?.cost?.currency ?? totalCurrency,
            deliverySmart: Boolean(allegroOrder.delivery?.smart),

            paymentId: allegroOrder.payment?.id ?? null,
            paymentType: allegroOrder.payment?.type ?? null,
            paymentProvider: allegroOrder.payment?.provider ?? null,
            paymentFinishedAt: this.toDateOrNull(
              allegroOrder.payment?.finishedAt,
            ),
            paymentAmount: this.toDecimalString(
              allegroOrder.payment?.paidAmount?.amount,
              0,
            ),
            paymentCurrency:
              allegroOrder.payment?.paidAmount?.currency ?? totalCurrency,

            invoiceRequired: Boolean(allegroOrder.invoice?.required),

            externalRevision: allegroOrder.revision ?? null,
            marketplaceSiteId: allegroOrder.marketplace?.id ?? null,

            rawData: allegroOrder as object,
          },
          update: {
            status: localStatus,

            externalOrderStatus,
            externalFulfillmentStatus: fulfillmentStatus,
            externalLineItemsSentStatus:
              allegroOrder.fulfillment?.shipmentSummary?.lineItemsSent ?? null,

            totalAmount,
            totalToPay,
            currency: totalCurrency,

            orderCreatedAt,
            externalUpdatedAt: this.toDateOrNull(allegroOrder.updatedAt),
            syncedAt,

            messageToSeller: allegroOrder.messageToSeller ?? null,

            buyerId: allegroOrder.buyer?.id ?? null,
            buyerLogin: allegroOrder.buyer?.login ?? null,
            buyerEmail: allegroOrder.buyer?.email ?? null,
            buyerFirstName: allegroOrder.buyer?.firstName ?? null,
            buyerLastName: allegroOrder.buyer?.lastName ?? null,
            buyerCompanyName: allegroOrder.buyer?.companyName ?? null,
            buyerPhone: allegroOrder.buyer?.phoneNumber ?? null,
            buyerGuest: Boolean(allegroOrder.buyer?.guest),

            deliveryMethodId: allegroOrder.delivery?.method?.id ?? null,
            deliveryMethodName: allegroOrder.delivery?.method?.name ?? null,

            deliveryFirstName:
              allegroOrder.delivery?.address?.firstName ?? null,
            deliveryLastName: allegroOrder.delivery?.address?.lastName ?? null,
            deliveryStreet: allegroOrder.delivery?.address?.street ?? null,
            deliveryCity: allegroOrder.delivery?.address?.city ?? null,
            deliveryZipCode: allegroOrder.delivery?.address?.zipCode ?? null,
            deliveryCountryCode:
              allegroOrder.delivery?.address?.countryCode ?? null,
            deliveryPhone: allegroOrder.delivery?.address?.phoneNumber ?? null,

            pickupPointId: allegroOrder.delivery?.pickupPoint?.id ?? null,
            pickupPointName: allegroOrder.delivery?.pickupPoint?.name ?? null,

            deliveryCost: this.toDecimalString(
              allegroOrder.delivery?.cost?.amount,
              0,
            ),
            deliveryCurrency:
              allegroOrder.delivery?.cost?.currency ?? totalCurrency,
            deliverySmart: Boolean(allegroOrder.delivery?.smart),

            paymentId: allegroOrder.payment?.id ?? null,
            paymentType: allegroOrder.payment?.type ?? null,
            paymentProvider: allegroOrder.payment?.provider ?? null,
            paymentFinishedAt: this.toDateOrNull(
              allegroOrder.payment?.finishedAt,
            ),
            paymentAmount: this.toDecimalString(
              allegroOrder.payment?.paidAmount?.amount,
              0,
            ),
            paymentCurrency:
              allegroOrder.payment?.paidAmount?.currency ?? totalCurrency,

            invoiceRequired: Boolean(allegroOrder.invoice?.required),

            externalRevision: allegroOrder.revision ?? null,
            marketplaceSiteId: allegroOrder.marketplace?.id ?? null,

            rawData: allegroOrder as object,
          },
        });

        savedOrders++;

        await tx.orderItem.deleteMany({
          where: {
            orderId: savedOrder.id,
          },
        });

        if (lineItems.length > 0) {
          await tx.orderItem.createMany({
            data: lineItems.map((item) => {
              const offerId = item.offer?.id ?? null;

              return {
                orderId: savedOrder.id,

                externalLineItemId: item.id ?? null,
                externalOfferId: offerId,

                productName: item.offer?.name ?? 'Brak nazwy',
                productImageUrl: offerId ? imageByOfferId[offerId] ?? null : null,

                quantity: Number(item.quantity ?? 1),

                originalPrice: this.toDecimalString(
                  item.originalPrice?.amount,
                  0,
                ),
                price: this.toDecimalString(item.price?.amount, 0),
                currency: item.price?.currency ?? 'PLN',

                boughtAt: this.toDateOrNull(item.boughtAt),

                rawData: item as object,
              };
            }),
          });

          savedItems += lineItems.length;
        }
      }
    });

    const activeExternalOrderIds = new Set(
        checkoutForms.map((order) => order.id),
    );

    const statusRefresh = await this.refreshPreviouslyActiveOrders(
     userId,
     marketplaceAccountId,
     activeExternalOrderIds,
     accessToken,
    );

    return {
     marketplaceAccountId,
     fetched: checkoutForms.length,
     savedOrders,
     savedItems,
     totalCount: data.totalCount ?? checkoutForms.length,
     statusRefresh,
    };
  }

  /**
   * TEST 3:
   * Synchronizuje wszystkie aktywne konta Allegro danego usera.
   */
  async syncAllOrdersForUser(userId: number) {
    const accounts = await this.prisma.marketplaceAccount.findMany({
      where: {
        userId,
        marketplace: Marketplace.ALLEGRO,
        status: MarketplaceAccountStatus.ACTIVE,
        deletedAt: null,
        accessToken: {
          not: null,
        },
        refreshToken: {
          not: null,
        },
      },
      orderBy: {
        id: 'asc',
      },
    });

    const results: SyncOrdersResult[] = [];

    for (const account of accounts) {
      const result = await this.syncOrdersForAccount(userId, account.id);
      results.push(result);
    }

    return {
      ok: true,
      accountsSynced: results.length,
      results,
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


  private async fetchSingleOrderByExternalOrderId(
  accessToken: string,
  externalOrderId: string,
): Promise<AllegroCheckoutForm | null> {
  try {
    const response = await axios.get<AllegroCheckoutForm>(
      `${this.allegroApiBaseUrl}/order/checkout-forms/${externalOrderId}`,
      {
        headers: this.getAllegroHeaders(accessToken),
      },
    );

    return response.data;
  } catch (error: any) {
    console.error(
      `[AllegroOrdersService.fetchSingleOrderByExternalOrderId] externalOrderId=${externalOrderId}`,
      error.response?.status,
      error.response?.data || error.message,
    );

    return null;
  }
  }
  
  private async refreshPreviouslyActiveOrders(
    userId: number,
    marketplaceAccountId: number,
    activeExternalOrderIds: Set<string>,
    accessToken: string,
  ) {
    const where: any = {
      userId,
      marketplaceAccountId,
      marketplace: Marketplace.ALLEGRO,
      deletedAt: null,
    };

    if (activeExternalOrderIds.size > 0) {
      where.externalOrderId = {
        notIn: Array.from(activeExternalOrderIds),
      };
    }

    const localOrdersToRefresh = await this.prisma.order.findMany({
      where,
      select: {
        id: true,
        externalOrderId: true,
        externalOrderStatus: true,
        externalFulfillmentStatus: true,
      },
    });

    let checked = 0;
    let updated = 0;
    let movedToArchive = 0;
    let movedToSent = 0;
    let movedToCancelled = 0;

    for (const localOrder of localOrdersToRefresh) {
      checked++;

      const freshOrder = await this.fetchSingleOrderByExternalOrderId(
        accessToken,
        localOrder.externalOrderId,
      );

      if (!freshOrder) {
        continue;
      }

      const freshExternalOrderStatus = freshOrder.status ?? null;
      const freshFulfillmentStatus = freshOrder.fulfillment?.status ?? null;

      const statusChanged =
        freshExternalOrderStatus !== localOrder.externalOrderStatus ||
        freshFulfillmentStatus !== localOrder.externalFulfillmentStatus;

      if (!statusChanged) {
        continue;
      }

      if (this.isShippedFulfillmentStatus(freshFulfillmentStatus)) {
        movedToSent++;
        movedToArchive++;
      }

      if (this.isCancelledExternalOrderStatus(freshExternalOrderStatus)) {
        movedToCancelled++;
        movedToArchive++;
      }

      await this.prisma.order.update({
        where: {
          id: localOrder.id,
        },
        data: {
          status: this.mapToLocalOrderStatus(
            freshExternalOrderStatus,
            freshFulfillmentStatus,
          ),
          externalOrderStatus: freshExternalOrderStatus,
          externalFulfillmentStatus: freshFulfillmentStatus,
          externalLineItemsSentStatus:
            freshOrder.fulfillment?.shipmentSummary?.lineItemsSent ?? null,
          externalUpdatedAt: this.toDateOrNull(freshOrder.updatedAt),
          externalRevision: freshOrder.revision ?? null,
          marketplaceSiteId: freshOrder.marketplace?.id ?? null,
          syncedAt: new Date(),
          rawData: freshOrder as object,
        },
      });

      updated++;
    }

    return {
      checked,
      updated,
      movedToArchive,
      movedToSent,
      movedToCancelled,
    };
  }

  private async fetchImagesForOrders(
    accessToken: string,
    orders: AllegroCheckoutForm[],
  ): Promise<Record<string, string | null>> {
    const uniqueOfferIds = [
      ...new Set(
        orders
          .flatMap((order) => order.lineItems ?? [])
          .map((item) => item.offer?.id)
          .filter((offerId): offerId is string => Boolean(offerId)),
      ),
    ];

    const imageByOfferId: Record<string, string | null> = {};

    await Promise.all(
      uniqueOfferIds.map(async (offerId) => {
        imageByOfferId[offerId] = await this.fetchOfferImage(
          accessToken,
          offerId,
        );
      }),
    );

    return imageByOfferId;
  }

  private async fetchOfferImage(
    accessToken: string,
    offerId: string,
  ): Promise<string | null> {
    try {
      const response = await axios.get(
        `${this.allegroApiBaseUrl}/sale/product-offers/${offerId}`,
        {
          headers: this.getAllegroHeaders(accessToken),
        },
      );

      const images = response.data?.images;

      if (!images) {
        return null;
      }

      const parsedImages =
        typeof images === 'string' ? JSON.parse(images) : images;

      if (!Array.isArray(parsedImages) || parsedImages.length === 0) {
        return null;
      }

      return typeof parsedImages[0] === 'string' ? parsedImages[0] : null;
    } catch (error: any) {
      console.error(
        `[AllegroOrdersService.fetchOfferImage] offerId=${offerId}`,
        error.response?.status,
        error.response?.data || error.message,
      );

      return null;
    }
  }

  private getAllegroHeaders(accessToken: string) {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.allegro.public.v1+json',
      'Content-Type': 'application/vnd.allegro.public.v1+json',
    };
  }

  private calculateProductsTotal(lineItems: AllegroLineItem[]): string {
    const total = lineItems.reduce((sum, item) => {
      const price = Number(item.price?.amount ?? 0);
      const quantity = Number(item.quantity ?? 1);

      return sum + price * quantity;
    }, 0);

    return this.toDecimalString(total, 0);
  }

  private getOrderCreatedAt(lineItems: AllegroLineItem[]): Date | null {
    const dates = lineItems
      .map((item) => item.boughtAt)
      .filter((date): date is string => Boolean(date))
      .sort();

    if (dates.length === 0) {
      return null;
    }

    return this.toDateOrNull(dates[0]);
  }

  private toDateOrNull(value?: string | null): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  private toDecimalString(value: unknown, fallback: number): string {
    const numberValue = Number(value ?? fallback);

    if (!Number.isFinite(numberValue)) {
      return fallback.toFixed(2);
    }

    return numberValue.toFixed(2);
  }

  private isShippedFulfillmentStatus(status?: string | null) {
    return SHIPPED_FULFILLMENT_STATUSES.includes(String(status || ''));
  }

  private isCancelledExternalOrderStatus(status?: string | null) {
    return CANCELLED_EXTERNAL_ORDER_STATUSES.includes(String(status || ''));
  }

  private mapToLocalOrderStatus(
    externalOrderStatus?: string | null,
    externalFulfillmentStatus?: string | null,
  ): OrderStatus {
    if (
      this.isCancelledExternalOrderStatus(externalOrderStatus) ||
      String(externalFulfillmentStatus || '').includes('CANCELLED')
    ) {
      return OrderStatus.CANCELLED;
    }

    if (this.isShippedFulfillmentStatus(externalFulfillmentStatus)) {
      return OrderStatus.SENT;
    }

    if (externalFulfillmentStatus === 'PROCESSING') {
      return OrderStatus.PROCESSING;
    }

    return OrderStatus.NEW;
  }
}