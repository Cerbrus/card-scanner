import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { CardSummary, Language } from '../../models';
import { ApiService } from '../../services/api.service';

export const UNKNOWN_MARK = '?';

const FLAGS: Record<Language, string> = {
    en: '🇬🇧',
    nl: '🇳🇱',
    de: '🇩🇪',
    fr: '🇫🇷',
    it: '🇮🇹',
    es: '🇪🇸',
    pt: '🇵🇹',
    ja: '🇯🇵',
    ko: '🇰🇷',
    zh: '🇨🇳',
    other: '🏳️'
};

@Component({
    selector: 'app-card-tile',
    standalone: true,
    imports: [CurrencyPipe, RouterLink, TranslateModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <a class="tile" [routerLink]="['/cards', card().id]">
            <span class="tile-frame">
                @if (photo(); as src) {
                    <img class="tile-photo" [src]="src" alt="" loading="lazy" />
                } @else {
                    <span class="tile-photo"></span>
                }
                @if (finish(); as finish) {
                    <span class="finish" [class]="finish" [title]="'variant.' + finish | translate">
                        <i class="material-symbols-outlined">star</i>
                    </span>
                }
            </span>
            <span class="tile-row">
                <span class="tile-name">{{ card().name ?? ('card.unknown' | translate) }}</span>
                @if (card().language; as language) {
                    <span class="flag" [title]="'language.' + language | translate">{{ flag() }}</span>
                } @else {
                    <span class="pill unknown" [title]="'mark.language' | translate">{{ unknown }}</span>
                }
            </span>
            <span class="tile-row">
                <span class="tile-line muted">{{ card().setName ?? '' }}</span>
                @if (card().condition; as condition) {
                    <span class="pill" [class]="condition" [title]="'condition.' + condition | translate">
                        {{ 'conditionShort.' + condition | translate }}
                    </span>
                } @else {
                    <span class="pill unknown" [title]="'mark.condition' | translate">{{ unknown }}</span>
                }
            </span>
            @if (card().status !== 'confirmed') {
                <span class="badge">{{ 'state.' + state() | translate }}</span>
            } @else if (card().estimatedValue; as price) {
                <span class="tile-price">{{ price | currency: 'EUR' }}</span>
            } @else {
                <span class="tile-line muted">{{ 'card.noPrice' | translate }}</span>
            }
        </a>
    `,
    styles: `
        :host { display: block; min-width: 0; }
        .tile { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .tile-photo {
            display: block; width: 100%; aspect-ratio: 63 / 88; border: 1px solid var(--line); border-radius: 8px;
            background: var(--surface); object-fit: cover;
        }
        .tile-frame { position: relative; display: block; }
        .finish {
            position: absolute; top: 4px; right: 4px; display: flex; padding: 2px; border-radius: 50%;
            background: var(--finish-back); color: var(--finish-star);
        }
        .finish i { font-size: 15px; font-variation-settings: 'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 20; }
        .finish.reverse i { font-variation-settings: 'FILL' 0, 'wght' 600, 'GRAD' 0, 'opsz' 20; }
        .tile-row { display: flex; align-items: center; gap: 4px; min-width: 0; height: 18px; }
        .tile-name { flex: 1 1 auto; min-width: 0; overflow: hidden; font-size: 0.82rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
        .tile-line { flex: 1 1 auto; min-width: 0; overflow: hidden; font-size: 0.72rem; text-overflow: ellipsis; white-space: nowrap; }
        .flag { flex: 0 0 auto; font-size: 0.85rem; line-height: 1; }
        .pill {
            flex: 0 0 auto; min-width: 22px; padding: 0 4px; border-radius: 4px; color: var(--condition-text);
            font-size: 0.62rem; font-weight: 700; line-height: 15px; text-align: center;
        }
        .pill.mint { background: var(--condition-mint); }
        .pill.near_mint { background: var(--condition-near-mint); }
        .pill.excellent { background: var(--condition-excellent); }
        .pill.good { background: var(--condition-good); color: var(--condition-text-dark); }
        .pill.light_played { background: var(--condition-light-played); }
        .pill.played { background: var(--condition-played); }
        .pill.poor { background: var(--condition-poor); }
        .pill.unknown { border: 1px dashed var(--warning); color: var(--text-muted); line-height: 13px; }
        .tile-price { color: var(--accent); font-size: 0.82rem; font-weight: 700; }
        .badge { align-self: flex-start; }
    `
})
export class CardTileComponent {
    public readonly card = input.required<CardSummary>();

    protected readonly unknown = UNKNOWN_MARK;

    private readonly api = inject(ApiService);

    protected readonly photo = computed(() => {
        const front = this.card().photos.front;

        return front === undefined ? undefined : this.api.photoUrl(front, true);
    });

    protected readonly state = computed(() => cardState(this.card()));
    protected readonly flag = computed(() => languageFlag(this.card().language));
    protected readonly finish = computed(() => {
        const variant = this.card().variant;

        return variant === 'holo' || variant === 'reverse' ? variant : undefined;
    });
}

export function languageFlag(language?: Language): string {
    return language ? FLAGS[language] : UNKNOWN_MARK;
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
