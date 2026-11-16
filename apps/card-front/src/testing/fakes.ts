import { Signal, WritableSignal, computed, signal } from '@angular/core';
import { of } from 'rxjs';

import { CardDetail, CardSummary, SystemState } from '../app/models';
import { countCopies } from '../app/services/collection.store';

export function card(id: number, changes: Partial<CardSummary> = {}): CardSummary {
    return {
        id,
        status: 'confirmed',
        readingState: 'none',
        name: `Card ${id}`,
        setName: 'Base Set',
        number: String(id),
        worthGrading: false,
        createdAt: `2026-11-${String(id).padStart(2, '0')}T10:00:00.000Z`,
        photos: { front: id * 10, back: id * 10 + 1 },
        ...changes
    };
}

export function detail(id: number, changes: Partial<CardDetail> = {}): CardDetail {
    return { ...card(id), candidates: [], notes: '', priceHistory: [], ...changes };
}

export function system(changes: Partial<SystemState> = {}): SystemState {
    return {
        version: '1.2.3',
        login: true,
        vision: { enabled: false, model: 'claude-opus-5-5' },
        catalog: { sets: 221, cards: 23912, refreshedAt: '2026-11-14T08:00:00.000Z', refreshing: false },
        sync: { configured: false, connected: false, running: false, waitingPhotos: 0, folder: 'Documents/~Hobby/Pokémon' },
        ...changes
    };
}

export interface FakeStore {
    cards: WritableSignal<Array<CardSummary>>;
    loaded: WritableSignal<boolean>;
    failed: WritableSignal<boolean>;
    confirmed: Signal<Array<CardSummary>>;
    unconfirmed: Signal<Array<CardSummary>>;
    reading: Signal<boolean>;
    totalValue: Signal<number>;
    ownPricedCount: Signal<number>;
    copies: Signal<Map<string, number>>;
    copiesOf: (card: CardSummary) => Array<CardSummary>;
    refresh: ReturnType<typeof vi.fn>;
    followReadings: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    drop: ReturnType<typeof vi.fn>;
}

export function fakeStore(cards: Array<CardSummary> = []): FakeStore {
    const list = signal(cards);
    const confirmed = computed(() => list().filter((known) => known.status === 'confirmed'));

    return {
        cards: list,
        loaded: signal(true),
        failed: signal(false),
        confirmed,
        unconfirmed: computed(() => list().filter((known) => known.status !== 'confirmed')),
        reading: computed(() => list().some((known) => known.readingState === 'pending')),
        totalValue: computed(() => confirmed().reduce((total, known) => total + (known.value ?? 0), 0)),
        ownPricedCount: computed(() => confirmed().filter((known) => known.valueSource === 'own').length),
        copies: computed(() => countCopies(confirmed())),
        copiesOf: (wanted: CardSummary) => (wanted.catalogCardId ? confirmed().filter((known) => known.catalogCardId === wanted.catalogCardId) : []),
        refresh: vi.fn(() => of(list())),
        followReadings: vi.fn(() => of(list())),
        put: vi.fn(),
        drop: vi.fn()
    };
}

export function texts(root: Element, selector: string): Array<string> {
    return Array.from(root.querySelectorAll(selector), (element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim());
}

export function click(root: Element, selector: string, index = 0): void {
    (root.querySelectorAll(selector)[index] as HTMLElement).click();
}

export function choose(root: Element, selector: string, value: string, index = 0): void {
    const field = root.querySelectorAll(selector)[index] as HTMLSelectElement;
    field.value = value;
    field.dispatchEvent(new Event('change'));
}

export function type(root: Element, selector: string, text: string): void {
    const field = root.querySelector(selector) as HTMLInputElement;
    field.value = text;
    field.dispatchEvent(new Event('input'));
}
