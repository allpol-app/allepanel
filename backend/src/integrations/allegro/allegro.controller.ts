import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AllegroAuthService } from './services/allegro-auth/allegro-auth.service';
import { AuthGuard } from '../../auth/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Marketplace,
  MarketplaceAccountStatus,
} from '../../generated/prisma/enums';

import { AllegroOrdersService } from './services/allegro-orders/allegro-orders.service';
import { AllegroShipmentsService } from './services/allegro-shipments/allegro-shipments.service';

//pod controllerem wszystko jest po route integrations/allegro/
@Controller('integrations/allegro')
export class AllegroController {
  constructor(
    private readonly allegroAuthService: AllegroAuthService,
    private readonly allegroOrdersService: AllegroOrdersService,
    private readonly prisma: PrismaService,
    private readonly allegroShipmentsService: AllegroShipmentsService,
  ) {}

  //ochroniarz jakis niewiem idk XDDD, kod jest w auth/auth.guard chroni przed nieautoryzowana integracja
  @UseGuards(AuthGuard)
  //endpoint /start
  @Get('start')
  //przekierowuje metoda 302 - tymczasowo na link ktory zwraca funkcja pod redirectem czyli funkcja async startauth
  @Redirect('', 302)
  async startAuth(@Req() req: Request) {
    const user = (req as any).user;

    //jak nie jest aktywnuy jakis marketplaceid-status dla tego userid to bierze to
    let marketplaceAccount = await this.prisma.marketplaceAccount.findFirst({
      where: {
        userId: user.id,
        marketplace: Marketplace.ALLEGRO,
        deletedAt: null,
        status: {
          in: [
            MarketplaceAccountStatus.DISCONNECTED,
            MarketplaceAccountStatus.ERROR,
          ],
        },
      },
      orderBy: {
        id: 'desc',
      },
    });

    //jak nie ma niekatywnego marketplaceid dla tego userid to tworzy nowy
    if (!marketplaceAccount) {
      marketplaceAccount = await this.prisma.marketplaceAccount.create({
        data: {
          userId: user.id,
          marketplace: Marketplace.ALLEGRO,
          status: MarketplaceAccountStatus.DISCONNECTED,
          accountName: 'Allegro',
        },
      });
    }  

    //korzystanie z funkcji z allegroauthservice do stworzenia url
    const authUrl = this.allegroAuthService.createAuthUrl(
      marketplaceAccount.id,
    );

    //zwrot url i przekierowanie, user moze sie logowac
    return {
      url: authUrl,
    };
  }


@UseGuards(AuthGuard)
@Get('orders/fetch-test/:marketplaceAccountId')
async fetchOrdersTest(
  @Param('marketplaceAccountId') marketplaceAccountId: string,
  @Req() req: Request,
) {
  const user = (req as any).user;

  const parsedMarketplaceAccountId = Number(marketplaceAccountId);

  if (!Number.isInteger(parsedMarketplaceAccountId)) {
    throw new BadRequestException('Niepoprawne marketplaceAccountId.');
  }

  const data = await this.allegroOrdersService.fetchOrdersForAccount(
    user.id,
    parsedMarketplaceAccountId,
  );

  const checkoutForms = data.checkoutForms ?? [];

  return {
    ok: true,
    allePanelUserId: user.id,
    marketplaceAccountId: parsedMarketplaceAccountId,
    fetched: checkoutForms.length,
    totalCount: data.totalCount ?? checkoutForms.length,
    firstOrders: checkoutForms.slice(0, 5).map((order) => ({
      id: order.id,
      status: order.status,
      buyerLogin: order.buyer?.login ?? null,
      fulfillmentStatus: order.fulfillment?.status ?? null,
      lineItems: order.lineItems?.length ?? 0,
    })),
  };
}


@UseGuards(AuthGuard)
@Post('orders/sync/:marketplaceAccountId')
async syncOrders(
  @Param('marketplaceAccountId') marketplaceAccountId: string,
  @Req() req: Request,
) {
  const user = (req as any).user;

  const parsedMarketplaceAccountId = Number(marketplaceAccountId);

  if (!Number.isInteger(parsedMarketplaceAccountId)) {
    throw new BadRequestException('Niepoprawne marketplaceAccountId.');
  }

  const result = await this.allegroOrdersService.syncOrdersForAccount(
    user.id,
    parsedMarketplaceAccountId,
  );

  return {
    ok: true,
    allePanelUserId: user.id,
    ...result,
  };
}


@UseGuards(AuthGuard)
@Post('orders/sync-all')
async syncAllOrders(@Req() req: Request) {
  const user = (req as any).user;

  const result = await this.allegroOrdersService.syncAllOrdersForUser(user.id);

  return {
    allePanelUserId: user.id,
    ...result,
  };
}

@UseGuards(AuthGuard)
@Get('shipments/delivery-services/:marketplaceAccountId')
async getAllegroDeliveryServices(
  @Param('marketplaceAccountId') marketplaceAccountId: string,
  @Req() req: Request,
) {
  const user = (req as any).user;

  return this.allegroShipmentsService.getDeliveryServicesForAccount(
    user.id,
    Number(marketplaceAccountId),
  );
}

@UseGuards(AuthGuard)
@Get('shipments/orders/:orderId/service-match')
async getAllegroServiceMatchForOrder(
  @Param('orderId') orderId: string,
  @Req() req: Request,
) {
  const user = (req as any).user;

  return this.allegroShipmentsService.findDeliveryServiceForOrder(
    user.id,
    Number(orderId),
  );
}

@UseGuards(AuthGuard)
@Post('shipments/orders/:orderId/prepare')
async prepareAllegroShipmentForOrder(
  @Param('orderId') orderId: string,
  @Req() req: Request,
  @Body()
  body: {
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    labelFormat?: string;
  },
) {
  const user = (req as any).user;

  return this.allegroShipmentsService.prepareAllegroShipmentForOrder(
    user.id,
    Number(orderId),
    body,
  );
}

// POST /integrations/allegro/shipments/orders/:orderId/create-command
// REALNIE tworzy komendę nadania paczki przez Wysyłam z Allegro.
@UseGuards(AuthGuard)
@Post('shipments/orders/:orderId/create-command')
async createAllegroShipmentCommand(
  @Param('orderId') orderId: string,
  @Req() req: Request,
  @Body()
  body: {
    weightKg?: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    labelFormat?: string;
  },
) {
  const user = (req as any).user;

  return this.allegroShipmentsService.createAllegroShipmentCommandForOrder(
    user.id,
    Number(orderId),
    body,
  );
}

// GET /integrations/allegro/shipments/:shipmentId/command
// Sprawdza status komendy nadania Wysyłam z Allegro.
@UseGuards(AuthGuard)
@Get('shipments/:shipmentId/command')
async getAllegroShipmentCommand(
  @Param('shipmentId') shipmentId: string,
  @Req() req: Request,
) {
  const user = (req as any).user;

  return this.allegroShipmentsService.getAllegroShipmentCommandForUser(
    user.id,
    Number(shipmentId),
  );
}

// GET /integrations/allegro/shipments/:shipmentId/details
// Pobiera szczegóły paczki Wysyłam z Allegro.
@UseGuards(AuthGuard)
@Get('shipments/:shipmentId/details')
async getAllegroShipmentDetails(
  @Param('shipmentId') shipmentId: string,
  @Req() req: Request,
) {
  const user = (req as any).user;

  return this.allegroShipmentsService.getAllegroShipmentDetailsForUser(
    user.id,
    Number(shipmentId),
  );
}

// GET /integrations/allegro/shipments/:shipmentId/label?pageSize=A4&cutLine=true
// Pobiera etykietę PDF dla paczki Wysyłam z Allegro.
@UseGuards(AuthGuard)
@Get('shipments/:shipmentId/label')
async getAllegroShipmentLabel(
  @Param('shipmentId') shipmentId: string,
  @Query('pageSize') pageSize: string,
  @Query('cutLine') cutLine: string,
  @Req() req: Request,
  @Res() res: Response,
) {
  const user = (req as any).user;

  const label = await this.allegroShipmentsService.getAllegroShipmentLabelForUser(
    user.id,
    Number(shipmentId),
    {
      pageSize: pageSize || 'A4',
      cutLine: cutLine !== 'false',
    },
  );

  res.setHeader('Content-Type', label.contentType);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${label.filename}"`,
  );

  return res.send(label.buffer);
}













  // Callback z Allegro.
  // Allegro wraca tutaj z code + state.
  // State = marketplaceAccountId.
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string) {
    if (!code) {
      return {
        error: 'Brak code w callbacku',
      };
    }

    if (!state) {
      return {
        error: 'Brak state/account_id w callbacku',
      };
    }

    const marketplaceAccountId = Number(state);

    if (!Number.isInteger(marketplaceAccountId)) {
      return {
        error: 'Niepoprawny state/account_id w callbacku',
      };
    }

    const marketplaceAccount = await this.prisma.marketplaceAccount.findFirst({
      where: {
        id: marketplaceAccountId,
        marketplace: Marketplace.ALLEGRO,
        deletedAt: null,
      },
    });

    if (!marketplaceAccount) {
      return {
        error: 'Nie znaleziono konta marketplace dla tego callbacku.',
      };
    }

    // 1. Wymiana code na tokeny
    const tokens = await this.allegroAuthService.exchangeCodeForTokens(code);

    // 2. Pobranie danych konta Allegro z access_token
    const allegroUser = await this.allegroAuthService.getCurrentAllegroUser(
      tokens.access_token,
    );

    console.log('ALLEGRO USER FROM /ME:', allegroUser);

    if (!allegroUser || !allegroUser.id) {
      await this.prisma.marketplaceAccount.update({
        where: {
          id: marketplaceAccountId,
        },
        data: {
          status: MarketplaceAccountStatus.ERROR,
          errorMessage: 'Nie udało się pobrać ID konta Allegro z /me.',
          accessToken: null,
          refreshToken: null,
          tokenType: null,
          tokenExpiresAt: null,
        },
      });

      return {
        error: 'Nie udało się pobrać ID konta Allegro z /me.',
      };
    }

    const allegroExternalAccountId = String(allegroUser.id);
    const allegroAccountName =
      allegroUser.login || allegroUser.email || `Allegro ${allegroExternalAccountId}`;

    // 3. Sprawdzenie, czy to konto Allegro nie jest już połączone z innym userem AllePanel
    const accountAlreadyConnectedToAnotherUser =
      await this.prisma.marketplaceAccount.findFirst({
        where: {
          marketplace: Marketplace.ALLEGRO,
          externalAccountId: allegroExternalAccountId,
          deletedAt: null,
          userId: {
            not: marketplaceAccount.userId,
          },
        },
      });

    if (accountAlreadyConnectedToAnotherUser) {
      await this.prisma.marketplaceAccount.update({
        where: {
          id: marketplaceAccountId,
        },
        data: {
          status: MarketplaceAccountStatus.ERROR,
          accountName: allegroAccountName,
          externalAccountId: allegroExternalAccountId,
          errorMessage:
            'To konto Allegro jest już połączone z innym kontem AllePanel.',
          accessToken: null,
          refreshToken: null,
          tokenType: null,
          tokenExpiresAt: null,
        },
      });

      return {
        error: 'To konto Allegro jest już połączone z innym kontem AllePanel.',
        marketplaceAccountId,
        accountName: allegroAccountName,
        externalAccountId: allegroExternalAccountId,
      };
    }

    // 4. Wyliczenie daty wygaśnięcia tokena
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + tokens.expires_in);

    // 5. Zapis tokenów + loginu + ID konta Allegro do PostgreSQL
    const updatedMarketplaceAccount = await this.prisma.marketplaceAccount.update({
      where: {
        id: marketplaceAccountId,
      },
      data: {
        status: MarketplaceAccountStatus.ACTIVE,

        accountName: allegroAccountName,
        externalAccountId: allegroExternalAccountId,

        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenType: tokens.token_type,
        tokenExpiresAt,

        errorMessage: null,
      },
    });

    return {
      message: 'Konto Allegro zostało połączone.',
      marketplaceAccountId: updatedMarketplaceAccount.id,
      status: updatedMarketplaceAccount.status,
      accountName: updatedMarketplaceAccount.accountName,
      externalAccountId: updatedMarketplaceAccount.externalAccountId,
    };
  }
}