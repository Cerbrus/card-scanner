import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import Database from 'better-sqlite3';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { Entities } from './entities';
import { InitialSchema1763100000000 } from './migrations/1763100000000-initial-schema';
import { OwnPrice1763200000000 } from './migrations/1763200000000-own-price';
import { DriveTrash1763300000000 } from './migrations/1763300000000-drive-trash';

export function databaseOptions(databasePath: string): TypeOrmModuleOptions {
    return {
        type: 'better-sqlite3',
        driver: Database,
        database: databasePath,
        entities: Entities,
        migrations: [InitialSchema1763100000000, OwnPrice1763200000000, DriveTrash1763300000000],
        migrationsRun: true,
        synchronize: false,
        namingStrategy: new SnakeNamingStrategy(),
        prepareDatabase: (database: Database.Database): void => {
            database.pragma('foreign_keys = ON');
            database.pragma('journal_mode = WAL');
        }
    };
}
