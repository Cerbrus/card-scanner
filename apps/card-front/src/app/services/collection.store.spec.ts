import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { card } from '../../testing/fakes';
import { ApiService } from './api.service';
import { CollectionStore } from './collection.store';
import { fitWithin } from './photo-scaler';

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

    it('counts the confirmed copies of each catalogue card and finds the copies of a card', () => {
        api.getCards.mockReturnValue(
            of([
                card(1, { catalogCardId: 'base1-4', language: 'en' }),
                card(2, { catalogCardId: 'base1-4', language: 'en' }),
                card(3, { catalogCardId: 'base1-58' }),
                card(4, { catalogCardId: 'base1-4', language: 'en', status: 'identified' }),
                card(5, { status: 'new' }),
                card(6, { catalogCardId: 'base1-4', language: 'nl' })
            ])
        );

        store.refresh().subscribe();

        expect(Array.from(store.copies().entries())).toEqual([
            ['base1-4|en', 2],
            ['base1-58|', 1],
            ['base1-4|nl', 1]
        ]);
        expect(store.copiesOf(card(1, { catalogCardId: 'base1-4', language: 'en' })).map((known) => known.id)).toEqual([1, 2]);
        expect(store.copiesOf(card(5))).toEqual([]);
    });

    it('splits the cards in confirmed ones and those still to confirm', () => {
        api.getCards.mockReturnValue(of([card(1, { value: 10.5, valueSource: 'own' }), card(2, { value: 2, valueSource: 'trend' }), card(3), card(4, { status: 'identified', value: 99 })]));

        store.refresh().subscribe();

        expect(store.loaded()).toBe(true);
        expect(store.confirmed().map((known) => known.id)).toEqual([1, 2, 3]);
        expect(store.unconfirmed().map((known) => known.id)).toEqual([4]);
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
