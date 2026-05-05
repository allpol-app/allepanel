import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { InpostController } from './inpost.controller';
import { InpostShipxService } from './services/inpost-shipx/inpost-shipx.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [InpostController],
  providers: [InpostShipxService],
  exports: [InpostShipxService],
})
export class InpostModule {}