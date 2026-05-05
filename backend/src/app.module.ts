import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllegroAuthService } from './integrations/allegro/services/allegro-auth/allegro-auth.service';
import { AllegroApiService } from './integrations/allegro/services/allegro-api/allegro-api.service';
import { AllegroOrdersService } from './integrations/allegro/services/allegro-orders/allegro-orders.service';
import { AllegroShipmentsService } from './integrations/allegro/services/allegro-shipments/allegro-shipments.service';
import { AllegroModule } from './integrations/allegro/allegro.module';

import { OrdersModule } from './orders/orders.module';
import { InpostModule } from './integrations/inpost/inpost.module';
import { ShipmentsModule } from './shipments/shipments.module';

@Module({
  imports: [
    OrdersModule,
    InpostModule,
    ShipmentsModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AllegroModule,
    PrismaModule,
    UsersModule,
    AuthModule,
  ],
  controllers: [AppController],
   providers: [
    AppService,
    AllegroAuthService,
    AllegroApiService,
    AllegroOrdersService,
    AllegroShipmentsService,
  ],
})
export class AppModule {}
