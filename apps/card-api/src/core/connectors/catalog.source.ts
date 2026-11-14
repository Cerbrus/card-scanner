import { Injectable } from '@nestjs/common';

import { AppConfig } from '../../config/app.config';
import { SourceCard } from '../rules/pricing';

export interface SourceSet {
    id: string;
    name: string;
    logo?: string;
    symbol?: string;
    cardCount?: { total?: number; official?: number };
}

export interface SourceCardBrief {
    id: string;
    localId: string;
    name: string;
    image?: string;
}

const TIMEOUT_MILLISECONDS = 60000;

@Injectable()
export class CatalogSource {
    constructor(private readonly config: AppConfig) {
    }

    public sets(): Promise<Array<SourceSet>> {
        return this.fetchJson<Array<SourceSet>>('/sets');
    }

    public cards(): Promise<Array<SourceCardBrief>> {
        return this.fetchJson<Array<SourceCardBrief>>('/cards');
    }

    public card(id: string): Promise<SourceCard> {
        return this.fetchJson<SourceCard>(`/cards/${encodeURIComponent(id)}`);
    }

    private async fetchJson<T>(path: string): Promise<T> {
        const answer = await fetch(`${this.config.catalogUrl}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MILLISECONDS) });
        if (!answer.ok) {
            throw new Error(`catalogue answered ${answer.status} for ${path}`);
        }

        return (await answer.json()) as T;
    }
}
