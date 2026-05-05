import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type OrderListKey =
  | 'inpost'
  | 'dpd'
  | 'ups'
  | 'dhl'
  | 'unpaid'
  | 'cancelled'
  | 'other';

type GetOrdersQuery = {
  page?: string;
  limit?: string;
  list?: string;
  marketplace?: string;
  marketplaceAccountId?: string;
  search?: string;
};

const ACTIVE_ORDER_STATUS = 'READY_FOR_PROCESSING';

const ACTIVE_FULFILLMENT_STATUSES = [
  'NEW',
  'PROCESSING',
  'READY_FOR_SHIPMENT',
];

const UNPAID_ORDER_STATUSES = ['BOUGHT', 'FILLED_IN'];

const CARRIER_KEYS = ['inpost', 'dpd', 'ups', 'dhl'] as const;

@Injectable()   
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrdersForUser(userId: number, query: GetOrdersQuery) {
    const page = this.toPositiveInt(query.page, 1, 100000);
    const limit = this.toPositiveInt(query.limit, 50, 100);
    const skip = (page - 1) * limit;

    const where = this.buildWhere(userId, query);

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: [
          {
            orderCreatedAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
        skip,
        take: limit,
        include: {
          marketplaceAccount: {
            select: {
              id: true,
              accountName: true,
              marketplace: true,
              externalAccountId: true,
            },
          },
          items: {
            orderBy: {
              id: 'asc',
            },
          },
        },
      }),
      this.prisma.order.count({
        where,
      }),
    ]);

    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      orders: orders.map((order) => ({
        ...order,
        carrier: this.detectCarrier(order.deliveryMethodName),
      })),
    };
  }

  async getOrderByIdForUser(userId: number, orderId: number) {
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
      throw new NotFoundException('Nie znaleziono zamówienia.');
    }

    return {
      ...order,
      carrier: this.detectCarrier(order.deliveryMethodName),
    };
  }

  async getOrderSegmentsForUser(userId: number, query: GetOrdersQuery) {
    const limit = this.toPositiveInt(query.limit, 50, 100);

    const lists: Record<OrderListKey, any[]> = {
      inpost: [],
      dpd: [],
      ups: [],
      dhl: [],
      unpaid: [],
      cancelled: [],
      other: [],
    };

    const summary: Record<OrderListKey, number> = {
      inpost: 0,
      dpd: 0,
      ups: 0,
      dhl: 0,
      unpaid: 0,
      cancelled: 0,
      other: 0,
    };

    for (const listKey of Object.keys(lists) as OrderListKey[]) {
      const where = this.buildWhere(userId, {
        ...query,
        list: listKey,
      });

      const [orders, count] = await this.prisma.$transaction([
        this.prisma.order.findMany({
          where,
          orderBy: [
            {
              orderCreatedAt: 'desc',
            },
            {
              id: 'desc',
            },
          ],
          take: limit,
          include: {
            marketplaceAccount: {
              select: {
                id: true,
                accountName: true,
                marketplace: true,
                externalAccountId: true,
              },
            },
            items: {
              orderBy: {
                id: 'asc',
              },
            },
          },
        }),
        this.prisma.order.count({
          where,
        }),
      ]);

      lists[listKey] = orders.map((order) => ({
        ...order,
        carrier: this.detectCarrier(order.deliveryMethodName),
      }));

      summary[listKey] = count;
    }

    return {
      summary,
      lists,
    };
  }

  private buildWhere(userId: number, query: GetOrdersQuery) {
    const where: any = {
      userId,
      deletedAt: null,
    };

    if (query.marketplace) {
      const marketplace = query.marketplace.toUpperCase();

      if (!['ALLEGRO', 'ERLI'].includes(marketplace)) {
        throw new BadRequestException('Niepoprawna platforma marketplace.');
      }

      where.marketplace = marketplace;
    }

    if (query.marketplaceAccountId) {
      const marketplaceAccountId = Number(query.marketplaceAccountId);

      if (!Number.isInteger(marketplaceAccountId)) {
        throw new BadRequestException('Niepoprawne marketplaceAccountId.');
      }

      where.marketplaceAccountId = marketplaceAccountId;
    }

    if (query.search) {
      const search = query.search.trim();

      if (search.length > 0) {
        where.OR = [
          {
            externalOrderId: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            buyerLogin: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            buyerEmail: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            buyerFirstName: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            buyerLastName: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            deliveryMethodName: {
              contains: search,
              mode: 'insensitive',
            },
          },
        ];
      }
    }

    if (query.list) {
      const list = query.list.toLowerCase();

      if (
        ![
          'inpost',
          'dpd',
          'ups',
          'dhl',
          'unpaid',
          'cancelled',
          'other',
        ].includes(list)
      ) {
        throw new BadRequestException('Niepoprawna lista zamówień.');
      }

      const listWhere = this.buildListWhere(list as OrderListKey);

      where.AND = [...(where.AND ?? []), listWhere];
    }

    return where;
  }

  private buildListWhere(list: OrderListKey) {
  if (list === 'unpaid') {
    return {
      externalOrderStatus: {
        in: UNPAID_ORDER_STATUSES,
      },
    };
  }

  if (list === 'cancelled') {
    return {
      OR: [
        {
          externalOrderStatus: {
            contains: 'CANCELLED',
            mode: 'insensitive',
          },
        },
        {
          externalFulfillmentStatus: {
            contains: 'CANCELLED',
            mode: 'insensitive',
          },
        },
      ],
    };
  }

  const activeBaseWhere = {
    externalOrderStatus: ACTIVE_ORDER_STATUS,
    externalFulfillmentStatus: {
      in: ACTIVE_FULFILLMENT_STATUSES,
    },
  };

  if (list === 'other') {
    return {
      AND: [
        activeBaseWhere,
        {
          OR: [
            {
              deliveryMethodName: null,
            },
            {
              NOT: CARRIER_KEYS.map((carrier) => ({
                deliveryMethodName: {
                  contains: carrier,
                  mode: 'insensitive',
                },
              })),
            },
          ],
        },
      ],
    };
  }

  return {
    AND: [
      activeBaseWhere,
      {
        deliveryMethodName: {
          contains: list,
          mode: 'insensitive',
        },
      },
    ],
  };
  }

  private detectCarrier(deliveryMethodName?: string | null) {
    if (!deliveryMethodName) {
      return 'other';
    }

    const name = deliveryMethodName.toLowerCase();

    if (name.includes('inpost')) {
      return 'inpost';
    }

    if (name.includes('dpd')) {
      return 'dpd';
    }

    if (name.includes('ups')) {
      return 'ups';
    }

    if (name.includes('dhl')) {
      return 'dhl';
    }

    return 'other';
  }

  private toPositiveInt(value: unknown, fallback: number, max: number) {
    const numberValue = Number(value ?? fallback);

    if (!Number.isInteger(numberValue) || numberValue <= 0) {
      return fallback;
    }

    return Math.min(numberValue, max);
  }
}