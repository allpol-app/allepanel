import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { ShipmentsService } from './shipments.service';

@Controller('shipments')
@UseGuards(AuthGuard)
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post('orders/:orderId/prepare-inpost')
  async prepareInpostShipment(
    @Req() req: Request,
    @Param('orderId') orderId: string,
    @Body()
    body: {
      shippingAccountId?: number;
      parcelSize?: string;
      weightKg?: number;
      lengthCm?: number;
      widthCm?: number;
      heightCm?: number;
      labelFormat?: string;
    },
  ) {
    const user = (req as any).user;

    return this.shipmentsService.prepareInpostShipmentForOrder(
      user.id,
      Number(orderId),
      body,
    );
  }

  // POST /shipments/orders/:orderId/create-inpost
  // Służy do REALNEGO nadania przesyłki przez InPost ShipX.
  @Post('orders/:orderId/create-inpost')
  async createInpostShipment(
    @Req() req: Request,
    @Param('orderId') orderId: string,
    @Body()
    body: {
      shippingAccountId?: number;
      parcelSize?: string;
      weightKg?: number;
      lengthCm?: number;
      widthCm?: number;
      heightCm?: number;
      labelFormat?: string;
    },
  ) {
    const user = (req as any).user;

    return this.shipmentsService.createInpostShipmentForOrder(
      user.id,
      Number(orderId),
      body,
    );
  }

  // GET /shipments/:shipmentId/label?format=pdf
  // Służy do pobrania etykiety przesyłki InPost ShipX.
  @Get(':shipmentId/label')
  async getInpostShipmentLabel(
    @Req() req: Request,
    @Param('shipmentId') shipmentId: string,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    const user = (req as any).user;

    const label = await this.shipmentsService.getInpostShipmentLabelForUser(
      user.id,
      Number(shipmentId),
      format || 'pdf',
    );

    res.setHeader('Content-Type', label.contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${label.filename}"`,
    );

    return res.send(label.buffer);
  }
}