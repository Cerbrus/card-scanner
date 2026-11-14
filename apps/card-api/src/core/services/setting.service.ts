import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SettingEntity } from '../../data/entities';

@Injectable()
export class SettingService {
    constructor(@InjectRepository(SettingEntity) private readonly settings: Repository<SettingEntity>) {
    }

    public async get(key: string): Promise<string | undefined> {
        return (await this.settings.findOneBy({ key }))?.value;
    }

    public async set(key: string, value: string): Promise<void> {
        await this.settings.save({ key, value });
    }

    public async remove(key: string): Promise<void> {
        await this.settings.delete({ key });
    }
}
