import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';

import { LogLine, LogService } from '../../core/services/log.service';
import { OwnerOnly } from '../guards/owner.decorator';

const MAX_LINES = 500;

@Controller({ path: 'logs', version: '1' })
export class LogController {
    constructor(private readonly logs: LogService) {
    }

    @OwnerOnly()
    @Get()
    public latest(@Query('limit', new DefaultValuePipe(200), ParseIntPipe) limit: number): Array<LogLine> {
        return this.logs.latest(Math.min(Math.max(limit, 1), MAX_LINES));
    }
}
