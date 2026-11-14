import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { CardSummary } from '../../models';
import { ApiService } from '../../services/api.service';

@Component({
    selector: 'app-card-tile',
    standalone: true,
    imports: [CurrencyPipe, RouterLink, TranslateModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <a class="tile" [routerLink]="['/cards', card().id]">
            @if (photo(); as src) {
                <img class="tile-photo" [src]="src" alt="" loading="lazy" />
            } @else {
                <span class="tile-photo"></span>
            }
            <span class="tile-name">{{ card().name ?? ('card.unknown' | translate) }}</span>
            <span class="tile-line muted">{{ card().setName ?? '' }}</span>
            @if (card().status !== 'confirmed') {
                <span class="badge">{{ 'state.' + state() | translate }}</span>
            } @else if (card().priceTrend; as price) {
                <span class="tile-price">{{ price | currency: 'EUR' }}</span>
            } @else {
                <span class="tile-line muted">{{ 'card.noPrice' | translate }}</span>
            }
        </a>
    `,
    styles: `
        .tile { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .tile-photo {
            display: block; width: 100%; aspect-ratio: 63 / 88; border: 1px solid var(--line); border-radius: 8px;
            background: var(--surface); object-fit: cover;
        }
        .tile-name { overflow: hidden; font-size: 0.82rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
        .tile-line { overflow: hidden; font-size: 0.72rem; text-overflow: ellipsis; white-space: nowrap; }
        .tile-price { color: var(--accent); font-size: 0.82rem; font-weight: 700; }
        .badge { align-self: flex-start; }
    `
})
export class CardTileComponent {
    public readonly card = input.required<CardSummary>();

    private readonly api = inject(ApiService);

    protected readonly photo = computed(() => {
        const front = this.card().photos.front;

        return front === undefined ? undefined : this.api.photoUrl(front, true);
    });

    protected readonly state = computed(() => cardState(this.card()));
}

export function cardState(card: CardSummary): string {
    if (card.status === 'confirmed') {
        return 'confirmed';
    }
    if (card.readingState === 'pending') {
        return 'reading';
    }
    if (card.readingState === 'failed') {
        return 'failed';
    }

    return card.status === 'identified' ? 'identified' : 'unknown';
}
