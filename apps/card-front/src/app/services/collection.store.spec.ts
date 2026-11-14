import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ApiService } from './api.service';
import { CollectionStore } from './collection.store';
import { fitWithin } from './photo-scaler';
import { card } from '../../testing/fakes';

describe('the collection in the web app', () => {
    const api = { getCards: vi.fn() };
    let store: CollectionStore;

    beforeEach(() => {
        vi.useFakeTimers();
        api.getCards.mockReset();
        TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
        store = TestBed.inject(CollectionStore);
    });

    afterEach(() => vi.useRealTimers());

    it('splits the cards in confirmed ones and the inbox, and adds up the value of the confirmed ones', () => {
        api.getCards.mockReturnValue(of([card(1, { value: 10.5, valueSource: 'own' }), card(2, { value: 2, valueSource: 'trend' }), card(3), card(4, { status: 'identified', value: 99 })]));

        store.refresh().subscribe();

        expect(store.loaded()).toBe(true);
        expect(store.confirmed().map((known) => known.id)).toEqual([1, 2, 3]);
        expect(store.inbox().map((known) => known.id)).toEqual([4]);
        expect(store.totalValue()).toBe(12.5);
        expect(store.ownPricedCount()).toBe(1);
    });

    it('keeps the cards it had when the server cannot be reached, and says so', () => {
        api.getCards.mockReturnValueOnce(of([card(1)])).mockReturnValueOnce(throwError(() => new Error('offline')));

        store.refresh().subscribe();
        store.refresh().subscribe();

        expect(store.cards().length).toBe(1);
        expect(store.failed()).toBe(true);
    });

    it('puts a new card in front, replaces a known one and drops a removed one', () => {
        api.getCards.mockReturnValue(of([card(1), card(2)]));
        store.refresh().subscribe();

        store.put(card(3));
        store.put(card(1, { name: 'Renamed' }));
        store.drop(2);

        expect(store.cards().map((known) => [known.id, known.name])).toEqual([[3, 'Card 3'], [1, 'Renamed']]);
    });

    it('asks again every few seconds only while a card is being read', () => {
        api.getCards.mockReturnValueOnce(of([card(1, { status: 'new', readingState: 'pending' })])).mockReturnValue(of([card(1, { status: 'identified', readingState: 'done' })]));
        store.refresh().subscribe();
        const following = store.followReadings().subscribe();

        vi.advanceTimersByTime(3000);
        vi.advanceTimersByTime(9000);
        following.unsubscribe();

        expect(api.getCards).toHaveBeenCalledTimes(2);
        expect(store.reading()).toBe(false);
    });
});

describe('making a photo smaller', () => {
    it('keeps the proportions and never enlarges', () => {
        expect(fitWithin(4000, 3000, 2400)).toEqual({ width: 2400, height: 1800 });
        expect(fitWithin(3000, 4000, 480)).toEqual({ width: 360, height: 480 });
        expect(fitWithin(800, 600, 2400)).toEqual({ width: 800, height: 600 });
    });
});
