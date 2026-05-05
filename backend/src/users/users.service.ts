import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: {
        email: email.toLowerCase(),
      },
    });
  }

  findById(id: number) {
    return this.prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        companyName: true,
        taxId: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}