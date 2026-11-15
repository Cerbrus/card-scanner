import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { CardTileComponent } from '../../components/card-tile/card-tile.component';
import { CONDITIONS, CardSummary, LANGUAGES } from '../../models';
import { CollectionStore } from '../../services/collection.store';

export const SORTS = ['newest', 'name', 'value', 'set'] as const;
export type Sort = (typeof SORTS)[number];

export const UNKNOWN = 'unknown';

export interface CardFilter {
    search: string;
    set: string;
    condition: string;
    language: string;
    grading: boolean;
}

export interface FilterOptions {
    sets: Array<string>;
    conditions: Array<string>;
    languages: Array<string>;
}

export const NO_FILTER: CardFilter = { search: '', set: '', condition: '', language: '', grading: false };

const SORTERS: Record<Sort, (left: CardSummary, right: CardSummary) => number> = {
    newest: (left, right) => right.createdAt.localeCompare(left.createdAt) || right.id - left.id,
    name: (left, right) => (left.name ?? '').localeCompare(right.name ?? ''),
    value: (left, right) => (right.value ?? -1) - (left.value ?? -1),
    set: (left, right) => (left.setName ?? '').localeCompare(right.setName ?? '') || (left.number ?? '').localeCompare(right.number ?? '', undefined, { numeric: true })
};

const sameAs = (wanted: string, value?: string): boolean => !wanted || (wanted === UNKNOWN ? !value : wanted === value);

function fits(card: CardSummary, filter: CardFilter): boolean {
    const wanted = filter.search.trim().toLowerCase();
    const found = !wanted || [card.name, card.setName, card.number, card.rarity].some((text) => text?.toLowerCase().includes(wanted));

    return (
        found &&
        sameAs(filter.set, card.setName) &&
        sameAs(filter.condition, card.condition) &&
        sameAs(filter.language, card.language) &&
        (!filter.grading || card.worthGrading)
    );
}

export function visibleCards(cards: Array<CardSummary>, filter: CardFilter, sort: Sort): Array<CardSummary> {
    return cards.filter((card) => fits(card, filter)).sort(SORTERS[sort]);
}

export function filterOptions(cards: Array<CardSummary>): FilterOptions {
    const present = (all: ReadonlyArray<string>, pick: (card: CardSummary) => string | undefined): Array<string> => {
        const values = cards.map(pick);
        const known = all.filter((value) => values.includes(value));

        return values.includes(undefined) ? [...known, UNKNOWN] : known;
    };
    const setNames = [...new Set(cards.map((card) => card.setName).filter((name): name is string => !!name))].sort((left, right) => left.localeCompare(right));

    return {
        sets: present(setNames, (card) => card.setName || undefined),
        conditions: present(CONDITIONS, (card) => card.condition),
        languages: present(LANGUAGES, (card) => card.language)
    };
}

@Component({
    selector: 'app-collection-page',
    standalone: true,
    imports: [CurrencyPipe, RouterLink, TranslatePipe, CardTileComponent],
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

            <div class="mb-2 flex gap-2">
                <input
                    class="field"
                    type="search"
                    [placeholder]="'collection.search' | translate"
                    [value]="filter().search"
                    (input)="narrow('search', $any($event.target).value)"
                />
                <select class="sort field !w-auto" [attr.aria-label]="'collection.sort' | translate" (change)="sort.set($any($event.target).value)">
                    @for (option of sorts; track option) {
                        <option [value]="option" [selected]="option === sort()">{{ 'collection.sortBy.' + option | translate }}</option>
                    }
                </select>
            </div>

            <div class="filters mb-2">
                <select class="filter-set field" [class.active]="filter().set" [attr.aria-label]="'collection.filter.set' | translate" (change)="narrow('set', $any($event.target).value)">
                    <option value="" [selected]="!filter().set">{{ 'collection.filter.allSets' | translate }}</option>
                    @for (option of options().sets; track option) {
                        <option [value]="option" [selected]="option === filter().set">{{ option === unknown ? ('collection.filter.unknown' | translate) : option }}</option>
                    }
                </select>
                <select
                    class="filter-condition field"
                    [class.active]="filter().condition"
                    [attr.aria-label]="'collection.filter.condition' | translate"
                    (change)="narrow('condition', $any($event.target).value)"
                >
                    <option value="" [selected]="!filter().condition">{{ 'collection.filter.allConditions' | translate }}</option>
                    @for (option of options().conditions; track option) {
                        <option [value]="option" [selected]="option === filter().condition">
                            {{ (option === unknown ? 'collection.filter.unknown' : 'condition.' + option) | translate }}
                        </option>
                    }
                </select>
                <select
                    class="filter-language field"
                    [class.active]="filter().language"
                    [attr.aria-label]="'collection.filter.language' | translate"
                    (change)="narrow('language', $any($event.target).value)"
                >
                    <option value="" [selected]="!filter().language">{{ 'collection.filter.allLanguages' | translate }}</option>
                    @for (option of options().languages; track option) {
                        <option [value]="option" [selected]="option === filter().language">
                            {{ (option === unknown ? 'collection.filter.unknown' : 'language.' + option) | translate }}
                        </option>
                    }
                </select>
            </div>

            @if (gradingCount() || filtered()) {
                <div class="filter-actions mb-3">
                    @if (gradingCount(); as count) {
                        <button type="button" class="grading-filter btn" [class.primary]="filter().grading" (click)="narrow('grading', !filter().grading)">
                            <i class="material-symbols-outlined">workspace_premium</i>
                            {{ 'collection.filter.grading' | translate: { count } }}
                        </button>
                    }
                    @if (filtered()) {
                        <button type="button" class="clear-filters btn" (click)="filter.set(none)">
                            <i class="material-symbols-outlined">filter_alt_off</i>
                            {{ 'collection.filter.clear' | translate: { shown: visible().length, count: store.cards().length } }}
                        </button>
                    }
                </div>
            }

            @if (!store.loaded()) {
                <p class="empty">{{ 'common.loading' | translate }}</p>
            } @else {
                <div class="card-grid">
                    @for (card of visible(); track card.id) {
                        <app-card-tile [card]="card" [copies]="copiesOf(card)" />
                    } @empty {
                        <p class="empty col-span-full">
                            {{ (store.cards().length ? 'collection.noMatch' : 'collection.empty') | translate }}
                        </p>
                    }
                </div>
            }
        </div>
    `,
    styles: `
        .filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
        .filters .field { min-width: 0; padding-right: 4px; font-size: 0.8rem; text-overflow: ellipsis; }
        .filters .field.active { border-color: var(--accent); }
        .filter-actions { display: flex; flex-wrap: wrap; gap: 6px; }
        .filter-actions .btn { font-size: 0.8rem; }
    `
})
export class CollectionPage {
    protected readonly store = inject(CollectionStore);
    protected readonly sorts = SORTS;
    protected readonly unknown = UNKNOWN;
    protected readonly none = NO_FILTER;
    protected readonly filter = signal<CardFilter>(NO_FILTER);
    protected readonly sort = signal<Sort>('newest');
    protected readonly visible = computed(() => visibleCards(this.store.cards(), this.filter(), this.sort()));
    protected readonly options = computed(() => filterOptions(this.store.cards()));
    protected readonly gradingCount = computed(() => this.store.cards().filter((card) => card.worthGrading).length);
    protected readonly filtered = computed(() => {
        const { set, condition, language, grading } = this.filter();

        return set || condition || language || grading;
    });

    protected copiesOf(card: CardSummary): number {
        return card.status === 'confirmed' && card.catalogCardId ? (this.store.copies().get(card.catalogCardId) ?? 1) : 1;
    }

    protected narrow<K extends keyof CardFilter>(key: K, value: CardFilter[K]): void {
        this.filter.update((filter) => ({ ...filter, [key]: value }));
    }
}
