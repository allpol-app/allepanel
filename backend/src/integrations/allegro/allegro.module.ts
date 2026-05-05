import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AllegroController } from './allegro.controller';
import { AllegroAuthService } from './services/allegro-auth/allegro-auth.service';
import { AllegroApiService } from './services/allegro-api/allegro-api.service';
import { AllegroOrdersService } from './services/allegro-orders/allegro-orders.service';
import { AllegroShipmentsService } from './services/allegro-shipments/allegro-shipments.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AllegroController],
  providers: [
    AllegroAuthService,
    AllegroApiService,
    AllegroOrdersService,
    AllegroShipmentsService,
  ],
})
export class AllegroModule {}