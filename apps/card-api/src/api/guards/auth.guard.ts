import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { OWNER_ROUTE } from './owner.decorator';
import { PUBLIC_ROUTE } from './public.decorator';
import { AppConfig } from '../../config/app.config';
import { SessionService } from '../../core/services/session.service';
import { HttpRequest, cookieHeader } from '../http';

const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly config: AppConfig,
        private readonly sessions: SessionService,
        private readonly reflector: Reflector
    ) {
    }

    public canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<HttpRequest>();
        const targets = [context.getHandler(), context.getClass()];

        if (!this.config.loginEnabled) {
            return true;
        }
        if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets)) {
            return true;
        }

        const session = this.sessions.read(cookieHeader(request));
        if (!session) {
            throw new UnauthorizedException('Log in first');
        }
        if (this.reflector.getAllAndOverride<boolean>(OWNER_ROUTE, targets) && !this.sessions.isOwner(session.email)) {
            throw new ForbiddenException('Only for the owner');
        }

        const origin = request.headers['origin'];
        if (!READ_METHODS.includes(request.method) && origin && origin !== this.config.publicUrl) {
            throw new ForbiddenException('Request from another site');
        }

        return true;
    }
}
