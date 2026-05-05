import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const SESSION_COOKIE_NAME = 'session';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(
      dto,
      req.headers['user-agent'],
      req.ip,
    );

    this.setSessionCookie(res, result.sessionToken);

    return {
      user: result.user,
    };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(
      dto,
      req.headers['user-agent'],
      req.ip,
    );

    this.setSessionCookie(res, result.sessionToken);

    return {
      user: result.user,
    };
  }

  @Get('me')
  async me(@Req() req: Request) {
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];

    const user = await this.authService.getCurrentUser(sessionToken);

    return {
      user,
    };
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];

    await this.authService.logout(sessionToken);

    res.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
    });

    return {
      success: true,
    };
  } 

  private setSessionCookie(res: Response, sessionToken: string) {
    res.cookie(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 30,
      path: '/',
    });
  }
}