import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/printer')
  async getMyPrinter(@Req() req: Request) {
    const user = (req as any).user;

    return this.usersService.getPrinterSettings(user.id);
  }

  @Patch('me/printer')
  async updateMyPrinter(
    @Req() req: Request,
    @Body()
    body: {
      labelPrinterName?: string | null;
      labelPrinterFormat?: string | null;
      labelPrinterDpi?: number | string | null;
      labelPrinterWidthMm?: number | string | null;
      labelPrinterHeightMm?: number | string | null;
    },
  ) {
    const user = (req as any).user;

    return this.usersService.updatePrinterSettings(user.id, body);
  }
}