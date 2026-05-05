import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  async getOrders(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;

    return this.ordersService.getOrdersForUser(user.id, query);
  }

  @Get('segments')
  async getSegments(@Req() req: Request, @Query() query: any) {
    const user = (req as any).user;

    return this.ordersService.getOrderSegmentsForUser(user.id, query);
  }

  @Get(':id')
  async getOrderById(@Req() req: Request, @Param('id') id: string) {
    const user = (req as any).user;

    return this.ordersService.getOrderByIdForUser(user.id, Number(id));
  }
}