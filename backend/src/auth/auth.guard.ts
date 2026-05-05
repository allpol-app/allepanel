import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

const SESSION_COOKIE_NAME = 'session';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME];

    const user = await this.authService.getCurrentUser(sessionToken);

    if (!user) {
      throw new UnauthorizedException('Musisz być zalogowany.');
    }

    (req as Request & { user: typeof user }).user = user;

    return true;
  }
}