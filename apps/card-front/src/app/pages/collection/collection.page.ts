import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { CardTileComponent } from '../../components/card-tile/card-tile.component';
import { CardSummary } from '../../models';
import { CollectionStore } from '../../services/collection.store';

export const SORTS = ['newest', 'name', 'value', 'set'] as const;
export type Sort = (typeof SORTS)[number];

const SORTERS: Record<Sort, (left: CardSummary, right: CardSummary) => number> = {
    newest: (left, right) => right.createdAt.localeCompare(left.createdAt) || right.id - left.id,
    name: (left, right) => (left.name ?? '').localeCompare(right.name ?? ''),
    value: (left, right) => (right.value ?? -1) - (left.value ?? -1),
    set: (left, right) => (left.setName ?? '').localeCompare(right.setName ?? '') || (left.number ?? '').localeCompare(right.number ?? '', undefined, { numeric: true })
};

export function visibleCards(cards: Array<CardSummary>, search: string, sort: Sort): Array<CardSummary> {
    const wanted = search.trim().toLowerCase();
    const matches = (card: CardSummary): boolean => [card.name, card.setName, card.number, card.rarity].some((text) => text?.toLowerCase().includes(wanted));

    return cards.filter((card) => !wanted || matches(card)).sort(SORTERS[sort]);
}

@Component({
    selector: 'app-collection-page',
    standalone: true,
    imports: [CurrencyPipe, RouterLink, TranslateModule, CardTileComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="page">
            <h1 class="page-title">{{ 'collection.title' | translate }}</h1>

            <div class="card mb-3 flex items-end justify-between gap-3">
                <div>
                    <div class="text-2xl font-bold">{{ store.totalValue() | currency: 'EUR' }}</div>
                    <div class="muted text-xs">{{ 'collection.valueOf' | translate: { own: store.ownPricedCount(), count: store.confirmed().length } }}</div>
                </div>
                @if (store.inbox().length; as waiting) {
                    <a class="badge" routerLink="/inbox">{{ 'collection.waiting' | translate: { count: waiting } }}</a>
                }
            </div>

            <div class="mb-3 flex gap-2">
                <input
                    class="field"
                    type="search"
                    [placeholder]="'collection.search' | translate"
                    [value]="search()"
                    (input)="search.set($any($event.target).value)"
                />
                <select class="field !w-auto" [attr.aria-label]="'collection.sort' | translate" (change)="sort.set($any($event.target).value)">
                    @for (option of sorts; track option) {
                        <option [value]="option" [selected]="option === sort()">{{ 'collection.sortBy.' + option | translate }}</option>
                    }
                </select>
            </div>

            @if (!store.loaded()) {
                <p class="empty">{{ 'common.loading' | translate }}</p>
            } @else {
                <div class="card-grid">
                    @for (card of visible(); track card.id) {
                        <app-card-tile [card]="card" />
                    } @empty {
                        <p class="empty col-span-full">
                            {{ (store.cards().length ? 'collection.noMatch' : 'collection.empty') | translate }}
                        </p>
                    }
                </div>
            }
        </div>
    `
})
export class CollectionPage {
    protected readonly store = inject(CollectionStore);
    protected readonly sorts = SORTS;
    protected readonly search = signal('');
    protected readonly sort = signal<Sort>('newest');
    protected readonly visible = computed(() => visibleCards(this.store.cards(), this.search(), this.sort()));
}
