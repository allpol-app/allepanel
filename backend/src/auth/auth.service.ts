import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto, userAgent?: string, ipAddress?: string) {
    const email = dto.email.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Użytkownik z takim adresem email już istnieje.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        companyName: dto.companyName,
        taxId: dto.taxId,
        phone: dto.phone,
      },
    });

    const sessionToken = await this.createSession(user.id, userAgent, ipAddress);

    return {
      sessionToken,
      user: this.safeUser(user),
    };
  }

  async login(dto: LoginDto, userAgent?: string, ipAddress?: string) {
    const email = dto.email.toLowerCase().trim();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Nieprawidłowy email lub hasło.');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordValid) {
      throw new UnauthorizedException('Nieprawidłowy email lub hasło.');
    }

    const sessionToken = await this.createSession(user.id, userAgent, ipAddress);

    return {
      sessionToken,
      user: this.safeUser(user),
    };
  }

  async logout(sessionToken?: string) {
    if (!sessionToken) {
      return { success: true };
    }

    const tokenHash = this.hashToken(sessionToken);

    await this.prisma.session.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { success: true };
  }

  async getCurrentUser(sessionToken?: string) {
    if (!sessionToken) {
      return null;
    }

    const tokenHash = this.hashToken(sessionToken);

    const session = await this.prisma.session.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: true,
      },
    });

    if (!session) {
      return null;
    }

    if (session.revokedAt) {
      return null;
    }

    if (session.expiresAt < new Date()) {
      return null;
    }

    if (session.user.deletedAt) {
      return null;
    }

    return this.safeUser(session.user);
  }

  private async createSession(userId: number, userAgent?: string, ipAddress?: string) {
    const sessionToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(sessionToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        userAgent,
        ipAddress,
      },
    });

    return sessionToken;
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private safeUser(user: {
    id: number;
    email: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    taxId: string | null;
    phone: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      companyName: user.companyName,
      taxId: user.taxId,
      phone: user.phone,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}