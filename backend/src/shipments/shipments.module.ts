import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { InpostModule } from '../integrations/inpost/inpost.module';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';

@Module({
  imports: [AuthModule, PrismaModule, InpostModule],
  controllers: [ShipmentsController],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}