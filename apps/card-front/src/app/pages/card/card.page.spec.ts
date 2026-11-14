import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { CardPage } from './card.page';
import { FakeStore, choose, click, detail, fakeStore, system, texts } from '../../../testing/fakes';
import { Candidate, CardDetail } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { CollectionStore } from '../../services/collection.store';
import { ToastService } from '../../services/toast.service';

const charizard: Candidate = { catalogCardId: 'base1-4', name: 'Charizard', localId: '4', setId: 'base1', setName: 'Base Set', image: 'https://assets.example/base1/4', score: 13 };
const reprint: Candidate = { ...charizard, catalogCardId: 'base4-4', setId: 'base4', setName: 'Base Set 2', image: undefined };
const confirmed = detail(7, { name: 'Charizard', rarity: 'Rare', catalogCardId: 'base1-4', priceTrend: 385.83, priceAvg30: 407.53, priceLow: 90, estimatedValue: 231.5, valueFactor: 0.6, condition: 'good', cardmarketUrl: 'https://www.cardmarket.com/x' });
const waiting = detail(7, { status: 'identified', readingState: 'done', name: 'Charizard', candidates: [charizard, reprint] });

describe('CardPage', () => {
    let fixture: ComponentFixture<CardPage>;
    let page: HTMLElement;
    let store: FakeStore;
    const api = {
        photoUrl: (id: number, thumb = false): string => `/photos/${id}${thumb ? '?thumb' : ''}`,
        getCard: vi.fn(),
        getSystem: vi.fn(),
        updateCard: vi.fn(),
        confirmCard: vi.fn(),
        readCard: vi.fn(),
        deleteCard: vi.fn(),
        searchCatalog: vi.fn()
    };

    const open = async (card: CardDetail, vision = false): Promise<void> => {
        api.getCard.mockReturnValue(of(card));
        api.getSystem.mockReturnValue(of(system({ vision: { enabled: vision, model: 'claude-opus-5-5' } })));
        fixture = TestBed.createComponent(CardPage);
        fixture.componentRef.setInput('id', String(card.id));
        page = fixture.nativeElement as HTMLElement;
        await settle();
    };
    const settle = async (): Promise<void> => {
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(10);
        fixture.detectChanges();
    };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        store = fakeStore();
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                provideRouter([]),
                { provide: ApiService, useValue: api },
                { provide: CollectionStore, useValue: store },
                { provide: AuthService, useValue: { owner: () => true } }
            ]
        });
    });

    afterEach(() => {
        fixture.destroy();
        vi.useRealTimers();
    });

    it('shows a confirmed card with its photos, the catalogue picture, price and a link to Cardmarket', async () => {
        await open({ ...confirmed, image: 'https://assets.example/base1/4' });

        expect(texts(page, 'h1')).toEqual(['Charizard']);
        expect(Array.from(page.querySelectorAll('.photos img'), (image) => image.getAttribute('src'))).toEqual(['/photos/70?thumb', '/photos/71?thumb', 'https://assets.example/base1/4/low.webp']);
        expect(page.textContent).toContain('€231.50');
        expect(page.textContent).toContain('€385.83');
        expect(page.textContent).toContain('card.estimateNote');
        expect(page.querySelector('a[href="https://www.cardmarket.com/x"]')).not.toBeNull();
        expect(page.querySelector('app-candidate-list')).toBeNull();
    });

    it('says that the estimate is the full price while the condition is not set', async () => {
        await open({ ...confirmed, condition: undefined, estimatedValue: 385.83, valueFactor: 1 });

        expect(page.textContent).toContain('card.estimateUnknown');
        expect(page.textContent).not.toContain('card.estimateNote');
    });

    it('offers the catalogue cards that fit and confirms the one that is tapped', async () => {
        api.confirmCard.mockReturnValue(of(confirmed));
        await open(waiting);

        expect(texts(page, '.candidate .font-semibold')).toEqual(['Charizard', 'Charizard']);
        expect(texts(page, '.badge')).toEqual(['state.identified']);

        click(page, '.candidate', 1);
        await settle();

        expect(api.confirmCard).toHaveBeenCalledWith(7, 'base4-4');
        expect(store.put).toHaveBeenLastCalledWith(confirmed);
        expect(page.querySelector('.candidate')).toBeNull();
    });

    it('searches the catalogue with the name and number the user types', async () => {
        api.searchCatalog.mockReturnValueOnce(of([])).mockReturnValueOnce(of([reprint]));
        await open(detail(7, { status: 'new', name: undefined }));
        const fields = page.querySelectorAll<HTMLInputElement>('form input');

        fields[0].value = 'Mewtwo';
        click(page, 'form button');
        await settle();
        expect(texts(page, 'app-candidate-list p')).toEqual(['card.noResults']);

        fields[0].value = 'Charizard';
        fields[1].value = '4/130';
        click(page, 'form button');
        await settle();

        expect(api.searchCatalog).toHaveBeenLastCalledWith('Charizard', '4/130');
        expect(texts(page, '.candidate .muted')).toEqual(['Base Set 2 · 4']);
    });

    it('saves each detail as it is changed', async () => {
        api.updateCard.mockReturnValue(of({ ...confirmed, condition: 'played', conditionSource: 'user' }));
        await open({ ...confirmed, condition: 'good', conditionSource: 'model', conditionNotes: 'White edges.' });

        expect(page.textContent).toContain('White edges.');

        choose(page, 'select', 'played', 0);
        choose(page, 'select', '', 1);
        (page.querySelector('input[type=checkbox]') as HTMLInputElement).click();
        await settle();

        expect(api.updateCard.mock.calls.map((call) => call[1])).toEqual([{ condition: 'played' }, { variant: null }, { firstEdition: true }]);
        expect(page.textContent).not.toContain('White edges.');
    });

    it('keeps asking while the photos are being read, and stops when the reading is done', async () => {
        api.getCard.mockReturnValueOnce(of(detail(7, { status: 'new', readingState: 'pending', name: undefined }))).mockReturnValue(of(waiting));
        api.getSystem.mockReturnValue(of(system()));
        fixture = TestBed.createComponent(CardPage);
        fixture.componentRef.setInput('id', '7');
        page = fixture.nativeElement as HTMLElement;
        await settle();
        expect(texts(page, '.badge')).toEqual(['state.reading']);

        await vi.advanceTimersByTimeAsync(2500);
        fixture.detectChanges();
        await vi.advanceTimersByTimeAsync(10000);

        expect(texts(page, '.badge')).toEqual(['state.identified']);
        expect(api.getCard).toHaveBeenCalledTimes(2);
    });

    it('offers a second reading only when reading photos is switched on', async () => {
        await open(waiting);
        expect(page.textContent).not.toContain('card.readAgain');

        fixture.destroy();
        api.readCard.mockReturnValue(of(waiting));
        await open(waiting, true);
        click(page, 'button.btn.mt-3');
        await settle();

        expect(api.readCard).toHaveBeenCalledWith(7);
        expect(api.getCard).toHaveBeenCalledTimes(3);
    });

    it('deletes only after a second tap, then goes back to the collection', async () => {
        api.deleteCard.mockReturnValue(of(undefined));
        const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
        await open(confirmed);

        click(page, 'button.danger');
        fixture.detectChanges();
        expect(api.deleteCard).not.toHaveBeenCalled();

        click(page, 'button.danger');
        await settle();

        expect(api.deleteCard).toHaveBeenCalledWith(7);
        expect(store.drop).toHaveBeenCalledWith(7);
        expect(navigate).toHaveBeenCalledWith('/collection');
    });

    it('says so when the card does not exist, and when a change fails', async () => {
        api.getCard.mockReturnValue(throwError(() => new Error('404')));
        api.getSystem.mockReturnValue(of(system()));
        fixture = TestBed.createComponent(CardPage);
        fixture.componentRef.setInput('id', '99');
        page = fixture.nativeElement as HTMLElement;
        await settle();
        expect(texts(page, '.empty')).toEqual(['card.missing']);

        fixture.destroy();
        api.updateCard.mockReturnValue(throwError(() => new Error('down')));
        await open(confirmed);
        choose(page, 'select', 'poor', 0);
        await settle();

        expect(TestBed.inject(ToastService).toasts().map((toast) => toast.text)).toEqual(['common.failed']);
    });
});
