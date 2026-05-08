import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type UpdatePrinterSettingsBody = {
  labelPrinterName?: string | null;
  labelPrinterFormat?: string | null;
  labelPrinterDpi?: number | string | null;
  labelPrinterWidthMm?: number | string | null;
  labelPrinterHeightMm?: number | string | null;
};

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
        labelPrinterName: true,
        labelPrinterFormat: true,
        labelPrinterDpi: true,
        labelPrinterWidthMm: true,
        labelPrinterHeightMm: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getPrinterSettings(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      select: {
        id: true,
        labelPrinterName: true,
        labelPrinterFormat: true,
        labelPrinterDpi: true,
        labelPrinterWidthMm: true,
        labelPrinterHeightMm: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Nie znaleziono użytkownika.');
    }

    return {
      ok: true,
      printer: {
        labelPrinterName: user.labelPrinterName,
        labelPrinterFormat: user.labelPrinterFormat || 'zpl',
        labelPrinterDpi: user.labelPrinterDpi || 203,
        labelPrinterWidthMm: user.labelPrinterWidthMm || 100,
        labelPrinterHeightMm: user.labelPrinterHeightMm || 150,
      },
    };
  }

  async updatePrinterSettings(userId: number, body: UpdatePrinterSettingsBody) {
    const labelPrinterName = this.normalizeNullableString(body.labelPrinterName);
    const labelPrinterFormat = this.normalizePrinterFormat(body.labelPrinterFormat);
    const labelPrinterDpi = this.normalizePositiveInt(body.labelPrinterDpi, 203, 'labelPrinterDpi');
    const labelPrinterWidthMm = this.normalizePositiveInt(
      body.labelPrinterWidthMm,
      100,
      'labelPrinterWidthMm',
    );
    const labelPrinterHeightMm = this.normalizePositiveInt(
      body.labelPrinterHeightMm,
      150,
      'labelPrinterHeightMm',
    );

    const updatedUser = await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        labelPrinterName,
        labelPrinterFormat,
        labelPrinterDpi,
        labelPrinterWidthMm,
        labelPrinterHeightMm,
      },
      select: {
        id: true,
        labelPrinterName: true,
        labelPrinterFormat: true,
        labelPrinterDpi: true,
        labelPrinterWidthMm: true,
        labelPrinterHeightMm: true,
      },
    });

    return {
      ok: true,
      message: labelPrinterName
        ? 'Ustawienia drukarki etykiet zostały zapisane.'
        : 'Drukarka etykiet została usunięta z profilu.',
      printer: {
        labelPrinterName: updatedUser.labelPrinterName,
        labelPrinterFormat: updatedUser.labelPrinterFormat || 'zpl',
        labelPrinterDpi: updatedUser.labelPrinterDpi || 203,
        labelPrinterWidthMm: updatedUser.labelPrinterWidthMm || 100,
        labelPrinterHeightMm: updatedUser.labelPrinterHeightMm || 150,
      },
    };
  }

  private normalizeNullableString(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized = String(value).trim();

    return normalized.length > 0 ? normalized : null;
  }

  private normalizePrinterFormat(value: unknown) {
    const normalized = String(value || 'zpl').trim().toLowerCase();

    if (!['zpl', 'pdf-a6', 'pdf-a4', 'epl'].includes(normalized)) {
      throw new BadRequestException(
        'Niepoprawny format drukarki. Dozwolone: zpl, pdf-a6, pdf-a4, epl.',
      );
    }

    return normalized;
  }

  private normalizePositiveInt(value: unknown, fallback: number, fieldName: string) {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    const numberValue = Number(value);

    if (!Number.isInteger(numberValue) || numberValue <= 0) {
      throw new BadRequestException(`${fieldName} musi być dodatnią liczbą całkowitą.`);
    }

    return numberValue;
  }
}