import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../../auth/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { InpostShipxService } from './services/inpost-shipx/inpost-shipx.service';
import {
  ShippingAccountStatus,
  ShippingProvider,
} from '../../generated/prisma/enums';

@Controller('integrations/inpost')
@UseGuards(AuthGuard)
export class InpostController {
  constructor(
    private readonly inpostShipxService: InpostShipxService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('shipx/test-credentials')
  async testShipxCredentials(
    @Req() req: Request,
    @Body()
    body: {
      organizationId?: string;
      apiToken?: string;
    },
  ) {
    const user = (req as any).user;

    const organizationId = String(body.organizationId || '').trim();
    const apiToken = String(body.apiToken || '').trim();

    if (!organizationId) {
      throw new BadRequestException('Brak organizationId.');
    }

    if (!apiToken) {
      throw new BadRequestException('Brak apiToken.');
    }

    const organization =
      await this.inpostShipxService.getOrganizationByCredentials(
        organizationId,
        apiToken,
      );

    return {
      ok: true,
      allePanelUserId: user.id,
      organization: {
        id: organization.id ?? organizationId,
        name: organization.name ?? null,
        email: organization.email ?? null,
        status: organization.status ?? null,
        taxId: organization.tax_id ?? null,
      },
    };
  }

  @Post('shipx/connect')
  async connectShipxAccount(
    @Req() req: Request,
    @Body()
    body: {
      accountName?: string;
      organizationId?: string;
      apiToken?: string;
    },
  ) {
    const user = (req as any).user;

    const accountName = String(body.accountName || '').trim();
    const organizationId = String(body.organizationId || '').trim();
    const apiToken = String(body.apiToken || '').trim();

    if (!organizationId) {
      throw new BadRequestException('Brak organizationId.');
    }

    if (!apiToken) {
      throw new BadRequestException('Brak apiToken.');
    }

    const organization =
      await this.inpostShipxService.getOrganizationByCredentials(
        organizationId,
        apiToken,
      );

    const existingAccount = await this.prisma.shippingAccount.findFirst({
      where: {
        provider: ShippingProvider.INPOST_SHIPX,
        organizationId,
        deletedAt: null,
      },
    });

    if (existingAccount && existingAccount.userId !== user.id) {
      throw new ConflictException(
        'To konto InPost ShipX jest już połączone z innym kontem AllePanel.',
      );
    }

    const savedAccount = existingAccount
      ? await this.prisma.shippingAccount.update({
          where: {
            id: existingAccount.id,
          },
          data: {
            accountName:
              accountName ||
              organization.name ||
              existingAccount.accountName ||
              'InPost ShipX',
            apiToken,
            organizationName: organization.name ?? null,
            organizationEmail: organization.email ?? null,
            status: ShippingAccountStatus.ACTIVE,
            errorMessage: null,
          },
        })
      : await this.prisma.shippingAccount.create({
          data: {
            userId: user.id,
            provider: ShippingProvider.INPOST_SHIPX,
            accountName: accountName || organization.name || 'InPost ShipX',
            organizationId,
            apiToken,
            organizationName: organization.name ?? null,
            organizationEmail: organization.email ?? null,
            status: ShippingAccountStatus.ACTIVE,
            errorMessage: null,
          },
        });

    return {
      ok: true,
      message: 'Konto InPost ShipX zostało połączone.',
      shippingAccount: {
        id: savedAccount.id,
        userId: savedAccount.userId,
        provider: savedAccount.provider,
        accountName: savedAccount.accountName,
        organizationId: savedAccount.organizationId,
        organizationName: savedAccount.organizationName,
        organizationEmail: savedAccount.organizationEmail,
        status: savedAccount.status,
        createdAt: savedAccount.createdAt,
        updatedAt: savedAccount.updatedAt,
      },
    };
  }
}