import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { FakeStore, card, choose, click, fakeStore, system, texts, type } from '../../testing/fakes';
import { TranslateTesting } from '../../testing/translate';
import { cardState, languageFlag } from '../components/card-tile/card-tile.component';
import { SystemState } from '../models';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { CollectionStore } from '../services/collection.store';
import { ToastService } from '../services/toast.service';
import { CollectionPage, NO_FILTER, filterOptions, visibleCards } from './collection/collection.page';
import { HelpPage } from './help/help.page';
import { LogPage } from './log/log.page';
import { LoginPage } from './login/login.page';
import { SettingsPage } from './settings/settings.page';

describe('the pages around the collection', () => {
    let store: FakeStore;
    let page: HTMLElement;
    const owner = { value: true };
    const api = {
        exportUrl: '/api/v1/export/cards.csv',
        googleConnectUrl: '/api/v1/google/connect',
        photoUrl: (id: number, thumb = false): string => `/photos/${id}${thumb ? '?thumb' : ''}`,
        getSystem: vi.fn(),
        getLogs: vi.fn(),
        refreshCatalog: vi.fn(() => of({})),
        refreshPrices: vi.fn(() => of({ priced: 1 })),
        runSync: vi.fn(() => of({})),
        disconnectGoogle: vi.fn(() => of({}))
    };
    const auth = { loginUrl: '/api/v1/auth/google', owner: (): boolean => owner.value, state: () => ({ enabled: true, email: 'me@example.com' }), logout: vi.fn(() => of(undefined)) };

    const open = <T>(component: new () => T, inputs: Record<string, unknown> = {}): ComponentFixture<T> => {
        const fixture = TestBed.createComponent(component);
        for (const [name, value] of Object.entries(inputs)) {
            fixture.componentRef.setInput(name, value);
        }
        fixture.detectChanges();
        page = fixture.nativeElement as HTMLElement;

        return fixture;
    };
    const settings = (state: SystemState): ComponentFixture<SettingsPage> => {
        api.getSystem.mockReturnValue(of(state));

        return open(SettingsPage);
    };

    beforeEach(() => {
        owner.value = true;
        localStorage.clear();
        store = fakeStore([
            card(1, { name: 'Pikachu', value: 2.5, valueSource: 'own' }),
            card(2, { name: 'Charizard', value: 385.83, valueSource: 'trend', setName: 'Jungle' }),
            card(3, { name: 'Abra' }),
            card(4, { name: 'Mystery', status: 'identified', readingState: 'done' }),
            card(5, { name: undefined, status: 'new', readingState: 'pending' })
        ]);
        vi.clearAllMocks();
        TestBed.configureTestingModule({
            imports: [TranslateTesting],
            providers: [
                provideRouter([]),
                { provide: CollectionStore, useValue: store },
                { provide: ApiService, useValue: api },
                { provide: AuthService, useValue: auth }
            ]
        });
    });

    it('sorts by newest, name, value and set, and searches in name, set and number', () => {
        const cards = store.cards().slice(0, 3);
        const ids = (sorted: ReturnType<typeof visibleCards>): Array<number> => sorted.map((known) => known.id);

        const searching = (search: string): typeof NO_FILTER => ({ ...NO_FILTER, search });

        expect(ids(visibleCards(cards, NO_FILTER, 'newest'))).toEqual([3, 2, 1]);
        expect(ids(visibleCards(cards, NO_FILTER, 'name'))).toEqual([3, 2, 1]);
        expect(ids(visibleCards(cards, NO_FILTER, 'value'))).toEqual([2, 1, 3]);
        expect(ids(visibleCards(cards, NO_FILTER, 'set'))).toEqual([1, 3, 2]);
        expect(ids(visibleCards(cards, NO_FILTER, 'name', true))).toEqual([1, 2, 3]);
        expect(ids(visibleCards(cards, NO_FILTER, 'newest', false))).toEqual([1, 2, 3]);
        expect(ids(visibleCards(cards, searching(' jungle '), 'newest'))).toEqual([2]);
        expect(ids(visibleCards(cards, searching('PIKA'), 'newest'))).toEqual([1]);
    });

    it('sorts on the card number within each set, the smaller sets first', () => {
        const cards = [
            card(1, { setName: 'Base Set', number: '63', setTotal: 102 }),
            card(2, { setName: 'Base Set', number: '7', setTotal: 102 }),
            card(3, { setName: 'Jungle', number: '63', setTotal: 64 }),
            card(4, { setName: undefined, number: undefined }),
            card(5, { setName: 'Fossil', number: '42', setTotal: 62 }),
            card(6, { setName: 'Jungle', number: '7', setTotal: 64 })
        ];

        expect(visibleCards(cards, NO_FILTER, 'number').map((known) => known.id)).toEqual([5, 6, 3, 2, 1, 4]);
        expect(visibleCards(cards, NO_FILTER, 'number', true).map((known) => known.id)).toEqual([1, 2, 3, 6, 5, 4]);
    });

    it('sorts on condition, the best first, and keeps the unknown ones last in both directions', () => {
        const cards = [card(1, { condition: 'poor' }), card(2), card(3, { condition: 'mint' }), card(4, { condition: 'excellent' })];

        expect(visibleCards(cards, NO_FILTER, 'condition').map((known) => known.id)).toEqual([3, 4, 1, 2]);
        expect(visibleCards(cards, NO_FILTER, 'condition', true).map((known) => known.id)).toEqual([1, 4, 3, 2]);
        expect(visibleCards([card(1), card(2, { value: 3 }), card(3, { value: 1 })], NO_FILTER, 'value', false).map((known) => known.id)).toEqual([3, 2, 1]);
    });

    it('filters on set, condition, language and finish, also on those that are not known, and on cards worth grading', () => {
        const cards = [
            card(1, { setName: 'Jungle', condition: 'near_mint', language: 'nl', variant: 'holo', worthGrading: true }),
            card(2, { setName: 'Base Set', condition: 'poor', language: 'en', variant: 'normal' }),
            card(3, { setName: undefined, condition: undefined, language: 'nl' })
        ];
        const ids = (filter: Partial<typeof NO_FILTER>): Array<number> => visibleCards(cards, { ...NO_FILTER, ...filter }, 'newest').map((known) => known.id);

        expect(ids({ set: 'Jungle' })).toEqual([1]);
        expect(ids({ set: 'unknown' })).toEqual([3]);
        expect(ids({ condition: 'unknown' })).toEqual([3]);
        expect(ids({ language: 'nl' })).toEqual([3, 1]);
        expect(ids({ language: 'nl', condition: 'near_mint' })).toEqual([1]);
        expect(ids({ grading: true })).toEqual([1]);
        expect(ids({ finish: 'holo' })).toEqual([1]);
        expect(ids({ finish: 'unknown' })).toEqual([3]);
        expect(filterOptions(cards)).toEqual({
            sets: ['Base Set', 'Jungle', 'unknown'],
            conditions: ['near_mint', 'poor', 'unknown'],
            languages: ['en', 'nl'],
            finishes: ['normal', 'holo', 'unknown']
        });
    });

    it('narrows the grid with the filter menus, showing pills and flags, and clears them in one tap', () => {
        store.cards.set([card(1, { condition: 'mint', language: 'nl', worthGrading: true }), card(2, { condition: 'poor' }), card(3)]);
        const fixture = open(CollectionPage);

        expect(texts(page, '.filter-condition .toggle')).toEqual(['verifiedarrow_drop_down']);
        click(page, '.filter-language .toggle');
        fixture.detectChanges();
        expect(texts(page, '.filter-language .option')).toEqual(['translate collection.filter.all.language', '🇳🇱 language.nl', '? collection.filter.unknown']);
        click(page, '.filter-language .toggle');
        click(page, '.filter-condition .toggle');
        fixture.detectChanges();
        click(page, '.filter-condition .option[data-value="poor"]');
        fixture.detectChanges();
        expect(texts(page, '.tile-name')).toEqual(['Card 2']);
        expect(page.querySelector('.filter-condition .menu')).toBeNull();
        expect(texts(page, '.filter-condition .toggle .pill.poor')).toEqual(['conditionShort.poor']);
        expect(texts(page, '.clear-filters')).toEqual(['filter_alt_off collection.filter.clear']);

        click(page, '.clear-filters');
        fixture.detectChanges();
        expect(page.querySelectorAll('app-card-tile').length).toBe(3);

        click(page, '.grading-filter');
        fixture.detectChanges();
        expect(texts(page, '.tile-name')).toEqual(['Card 1']);
    });

    it('keeps the filters and the sort for the next visit, but not the search', () => {
        store.cards.set([card(1, { condition: 'mint' }), card(2, { condition: 'poor' })]);
        let fixture = open(CollectionPage);
        click(page, '.filter-condition .toggle');
        fixture.detectChanges();
        click(page, '.filter-condition .option[data-value="poor"]');
        choose(page, 'select.sort', 'name');
        fixture.detectChanges();
        expect(page.querySelector('button.direction i.flipped')?.textContent).toBe('sort');
        click(page, 'button.direction');
        type(page, 'input[type=search]', 'Card');
        fixture.detectChanges();
        fixture.destroy();

        fixture = open(CollectionPage);
        expect(texts(page, '.tile-name')).toEqual(['Card 2']);
        expect((page.querySelector('select.sort') as HTMLSelectElement).value).toBe('name');
        expect(page.querySelector('button.direction i.flipped')).toBeNull();
        expect((page.querySelector('input[type=search]') as HTMLInputElement).value).toBe('');

        localStorage.setItem('collection-view', '{"filter":{"condition":7,"grading":"yes"},"sort":"nonsense"}');
        fixture.destroy();
        open(CollectionPage);
        expect(page.querySelectorAll('app-card-tile').length).toBe(2);
    });

    it('explains every condition with its pill and every finish', () => {
        open(HelpPage);

        expect(texts(page, '.condition dt .pill')).toEqual(['conditionShort.mint', 'conditionShort.near_mint', 'conditionShort.excellent', 'conditionShort.good', 'conditionShort.light_played', 'conditionShort.played', 'conditionShort.poor']);
        expect(texts(page, '.finish dd')).toEqual(['help.finish.normal', 'help.finish.holo', 'help.finish.reverse']);
    });

    it('marks cards worth grading and counts the copies of the same catalogue card', () => {
        store.cards.set([
            card(1, { catalogCardId: 'base1-4', worthGrading: true }),
            card(2, { catalogCardId: 'base1-4' }),
            card(3, { catalogCardId: 'base1-58' }),
            card(4, { catalogCardId: 'base1-4', status: 'identified' })
        ]);
        open(CollectionPage);

        const marks = Array.from(page.querySelectorAll('app-card-tile'), (tile) => [tile.querySelector('.grading') !== null, tile.querySelector('.copies')?.textContent ?? '']);

        expect(marks).toEqual([
            [false, ''],
            [false, ''],
            [false, '×2'],
            [true, '×2']
        ]);
    });

    it('shows the total value, every card as a tile, and the cards still to confirm on request', () => {
        const fixture = open(CollectionPage);

        expect(page.querySelector('.text-2xl')?.textContent).toContain('388.33');
        expect(page.querySelectorAll('app-card-tile').length).toBe(5);
        expect(texts(page, '.unconfirmed-filter')).toEqual(['collection.waiting']);

        click(page, '.unconfirmed-filter');
        fixture.detectChanges();
        expect(Array.from(page.querySelectorAll('app-card-tile a'), (link) => link.getAttribute('href'))).toEqual(['/cards/5', '/cards/4']);
        click(page, '.unconfirmed-filter');
        fixture.detectChanges();
        expect(texts(page, '.tile-price')).toEqual(['≈ €385.83', '€2.50']);
        expect(page.querySelectorAll('.tile-price.rough').length).toBe(1);
    });

    it('marks language and condition on every tile, also when they are unknown', () => {
        store.cards.set([card(1, { language: 'nl', condition: 'near_mint' }), card(2, { language: 'de' }), card(3, { status: 'new', name: undefined })]);
        open(CollectionPage);

        const rows = Array.from(page.querySelectorAll('app-card-tile'), (tile) => texts(tile, '.tile-row > *'));

        expect(rows).toEqual([
            ['card.unknown', '?', 'Base Set', '?'],
            ['Card 2', languageFlag('de'), 'Base Set', '?'],
            ['Card 1', languageFlag('nl'), 'Base Set', 'conditionShort.near_mint']
        ]);
        expect(page.querySelectorAll('.pill.unknown').length).toBe(3);
        expect(page.querySelector('.pill.near_mint')).not.toBeNull();
        expect([languageFlag('nl'), languageFlag(undefined)]).toEqual(['🇳🇱', '?']);
    });

    it('puts a star on holo cards, an open one on reverse holos, and none on the rest', () => {
        store.cards.set([card(1, { variant: 'holo' }), card(2, { variant: 'reverse' }), card(3, { variant: 'normal' }), card(4)]);
        open(CollectionPage);

        const stars = Array.from(page.querySelectorAll('app-card-tile'), (tile) => tile.querySelector('.finish')?.className ?? 'none');

        expect(stars).toEqual(['none', 'none', 'finish reverse', 'finish holo']);
        expect(page.querySelector('.finish.holo')?.getAttribute('title')).toBe('variant.holo');
    });

    it('filters while typing and changes the order with the sort choice', () => {
        const fixture = open(CollectionPage);

        type(page, 'input[type=search]', 'char');
        fixture.detectChanges();
        expect(texts(page, '.tile-name')).toEqual(['Charizard']);

        type(page, 'input[type=search]', 'zzz');
        fixture.detectChanges();
        expect(texts(page, '.empty')).toEqual(['collection.noMatch']);

        type(page, 'input[type=search]', '');
        choose(page, 'select', 'value');
        fixture.detectChanges();
        expect(texts(page, '.tile-name').slice(0, 2)).toEqual(['Charizard', 'Pikachu']);
    });

    it('shows the log with the newest line on top and says so when it cannot be read', async () => {
        api.getLogs.mockReturnValue(
            of([
                { id: 1, time: '2026-11-15T10:00:00.000Z', source: 'app', level: 'info', message: 'started' },
                { id: 2, time: '2026-11-15T10:01:00.000Z', source: 'app', level: 'warning', message: 'sync failed' }
            ])
        );
        const fixture = open(LogPage);
        await new Promise((resolve) => setTimeout(resolve, 0));
        fixture.detectChanges();

        expect(texts(page, '.message')).toEqual(['started', 'sync failed']);
        expect(page.querySelector('.line.warning')).not.toBeNull();

        api.getLogs.mockReturnValue(throwError(() => new Error('forbidden')));
        const refused = open(LogPage);
        await new Promise((resolve) => setTimeout(resolve, 0));
        refused.detectChanges();

        expect(texts(page, '.empty')).toEqual(['log.failed']);
    });

    it('invites to scan when there are no cards at all', () => {
        store.cards.set([]);
        open(CollectionPage);

        expect(texts(page, '.empty')).toEqual(['collection.empty']);
    });

    it('says in which state an unconfirmed card is', () => {
        expect(store.cards().map(cardState)).toEqual(['confirmed', 'confirmed', 'confirmed', 'identified', 'reading']);
        expect(cardState(card(9, { status: 'new', readingState: 'failed' }))).toBe('failed');
        expect(cardState(card(9, { status: 'new', readingState: 'none' }))).toBe('unknown');
    });

    it('offers the Google login and explains a refused account', () => {
        open(LoginPage, { error: 'not_allowed' });

        expect(page.querySelector('a.btn')?.getAttribute('href')).toBe('/api/v1/auth/google');
        expect(texts(page, '[role=alert]')).toEqual(['login.error.not_allowed']);
    });

    it('shows what is switched off and why, without buttons that cannot work', () => {
        settings(system());

        expect(texts(page, '.badge')).toEqual(['settings.off', 'settings.off']);
        expect(page.textContent).toContain('settings.reading.off');
        expect(page.textContent).toContain('settings.google.notConfigured');
        expect(page.querySelector('a[href="/api/v1/google/connect"]')).toBeNull();
        expect(page.textContent).toContain('settings.version');
    });

    it('offers the owner to connect Google Drive once the server is set up for it', () => {
        settings(system({ sync: { ...system().sync, configured: true } }));
        expect(page.querySelector('a[href="/api/v1/google/connect"]')).not.toBeNull();

        owner.value = false;
        settings(system({ sync: { ...system().sync, configured: true } }));
        expect(page.querySelector('a[href="/api/v1/google/connect"]')).toBeNull();
    });

    it('shows the state of a connected Drive, its last error, and starts a copy on request', () => {
        const connected = system({
            vision: { enabled: true, model: 'claude-opus-5-5' },
            sync: { ...system().sync, configured: true, connected: true, lastRunAt: '2026-11-14T09:00:00.000Z', lastError: 'Google answered 403', waitingPhotos: 2, sheetUrl: 'https://docs.google.com/spreadsheets/d/abc' }
        });
        const fixture = settings(connected);

        expect(texts(page, '.badge')).toEqual(['settings.on', 'settings.on']);
        expect(page.textContent).toContain('Google answered 403');
        expect(page.querySelector('a[href="https://docs.google.com/spreadsheets/d/abc"]')).not.toBeNull();

        click(page, 'button.primary');
        fixture.detectChanges();

        expect(api.runSync).toHaveBeenCalledTimes(1);
        expect(TestBed.inject(ToastService).toasts().map((toast) => toast.text)).toEqual(['settings.google.started']);
    });

    it('reports a failed action and keeps the page usable', () => {
        const fixture = settings(system());
        api.refreshCatalog.mockReturnValueOnce(throwError(() => new Error('down')) as never);

        click(page, 'button.btn');
        fixture.detectChanges();

        expect(TestBed.inject(ToastService).toasts().map((toast) => toast.kind)).toEqual(['error']);
        expect((page.querySelector('button.btn') as HTMLButtonElement).disabled).toBe(false);
    });

    it('tells how connecting Google Drive ended', () => {
        api.getSystem.mockReturnValue(of(system()));
        open(SettingsPage, { google: 'connected' });

        expect(texts(page, '[role=status]')).toEqual(['settings.google.outcome.connected']);
    });
});
