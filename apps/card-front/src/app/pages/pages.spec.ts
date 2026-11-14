import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { CollectionPage, visibleCards } from './collection/collection.page';
import { InboxPage } from './inbox/inbox.page';
import { LoginPage } from './login/login.page';
import { SettingsPage } from './settings/settings.page';
import { FakeStore, card, choose, click, fakeStore, system, texts, type } from '../../testing/fakes';
import { cardState, languageFlag } from '../components/card-tile/card-tile.component';
import { SystemState } from '../models';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { CollectionStore } from '../services/collection.store';
import { ToastService } from '../services/toast.service';

describe('the pages around the collection', () => {
    let store: FakeStore;
    let page: HTMLElement;
    const owner = { value: true };
    const api = {
        exportUrl: '/api/v1/export/cards.csv',
        googleConnectUrl: '/api/v1/google/connect',
        photoUrl: (id: number, thumb = false): string => `/photos/${id}${thumb ? '?thumb' : ''}`,
        getSystem: vi.fn(),
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
        store = fakeStore([
            card(1, { name: 'Pikachu', value: 2.5, valueSource: 'own' }),
            card(2, { name: 'Charizard', value: 385.83, valueSource: 'trend', setName: 'Jungle' }),
            card(3, { name: 'Abra' }),
            card(4, { name: 'Mystery', status: 'identified', readingState: 'done' }),
            card(5, { name: undefined, status: 'new', readingState: 'pending' })
        ]);
        vi.clearAllMocks();
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
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

        expect(ids(visibleCards(cards, '', 'newest'))).toEqual([3, 2, 1]);
        expect(ids(visibleCards(cards, '', 'name'))).toEqual([3, 2, 1]);
        expect(ids(visibleCards(cards, '', 'value'))).toEqual([2, 1, 3]);
        expect(ids(visibleCards(cards, '', 'set'))).toEqual([1, 3, 2]);
        expect(ids(visibleCards(cards, ' jungle ', 'newest'))).toEqual([2]);
        expect(ids(visibleCards(cards, 'PIKA', 'newest'))).toEqual([1]);
    });

    it('shows the total value, every card as a tile and a way to the inbox', () => {
        open(CollectionPage);

        expect(page.querySelector('.text-2xl')?.textContent).toContain('388.33');
        expect(page.querySelectorAll('app-card-tile').length).toBe(5);
        expect(page.querySelector('a.badge')?.getAttribute('href')).toBe('/inbox');
        expect(texts(page, '.tile-price')).toEqual(['≈ €385.83', '€2.50']);
        expect(page.querySelectorAll('.tile-price.rough').length).toBe(1);
    });

    it('marks language and condition on every tile, also when they are unknown', () => {
        store.cards.set([card(1, { language: 'nl', condition: 'near_mint' }), card(2, { language: 'other' }), card(3, { status: 'new', name: undefined })]);
        open(CollectionPage);

        const rows = Array.from(page.querySelectorAll('app-card-tile'), (tile) => texts(tile, '.tile-row > *'));

        expect(rows).toEqual([
            ['card.unknown', '?', 'Base Set', '?'],
            ['Card 2', languageFlag('other'), 'Base Set', '?'],
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

    it('lists only the unconfirmed cards in the inbox, each linking to its page', () => {
        open(InboxPage);

        expect(texts(page, 'a.card .font-semibold')).toEqual(['Mystery', 'card.unknown']);
        expect(texts(page, '.badge')).toEqual(['state.identified', 'state.reading']);
        expect(Array.from(page.querySelectorAll('a.card'), (link) => link.getAttribute('href'))).toEqual(['/cards/4', '/cards/5']);
    });

    it('says the inbox is empty when every card is confirmed', () => {
        store.cards.set([card(1)]);
        open(InboxPage);

        expect(texts(page, '.empty')).toEqual(['inbox.empty']);
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
