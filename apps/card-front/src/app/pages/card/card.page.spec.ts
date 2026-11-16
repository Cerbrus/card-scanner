import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { FakeStore, click, detail, fakeStore, system, texts } from '../../../testing/fakes';
import { TranslateTesting } from '../../../testing/translate';
import { Candidate, CardDetail } from '../../models';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { CollectionStore } from '../../services/collection.store';
import { PhotoScaler } from '../../services/photo-scaler';
import { ToastService } from '../../services/toast.service';
import { CardPage } from './card.page';

const charizard: Candidate = { catalogCardId: 'base1-4', name: 'Charizard', localId: '4', setId: 'base1', setName: 'Base Set', image: 'https://assets.example/base1/4', score: 13 };
const reprint: Candidate = { ...charizard, catalogCardId: 'base4-4', setId: 'base4', setName: 'Base Set 2', image: undefined };
const confirmed = detail(7, { name: 'Charizard', rarity: 'Rare', catalogCardId: 'base1-4', priceTrend: 385.83, priceAvg30: 407.53, priceLow: 90, value: 385.83, valueSource: 'trend', condition: 'good', variant: 'holo', priceBasis: 'print', cardmarketUrl: 'https://www.cardmarket.com/x' });
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
        searchCatalog: vi.fn(),
        getPhoto: vi.fn(),
        replacePhoto: vi.fn()
    };
    const scaled = { photo: new Blob(['photo']), thumb: new Blob(['thumb']) };
    const scaler = { scale: vi.fn(() => Promise.resolve(scaled)), straighten: vi.fn(() => Promise.resolve(scaled)) };

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
        URL.createObjectURL = vi.fn(() => 'blob:editing');
        URL.revokeObjectURL = vi.fn();
        store = fakeStore();
        TestBed.configureTestingModule({
            imports: [TranslateTesting],
            providers: [
                provideRouter([]),
                { provide: ApiService, useValue: api },
                { provide: CollectionStore, useValue: store },
                { provide: AuthService, useValue: { owner: () => true } },
                { provide: PhotoScaler, useValue: scaler }
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
        expect(texts(page, '.value')).toEqual(['€385.83']);
        expect(texts(page, '.value-label')).toEqual(['card.valueFrom.trend']);
        expect(texts(page, '.basis')).toEqual(['card.basis.print']);
        expect(page.querySelector('a[href="https://www.cardmarket.com/x"]')).not.toBeNull();
        expect(page.querySelector('app-candidate-list')).toBeNull();
    });

    it('opens a photo full screen, steps to the next ones and closes again', async () => {
        await open({ ...confirmed, image: 'https://assets.example/base1/4' });

        click(page, '.photo-open', 1);
        fixture.detectChanges();
        const shown = (): string | null | undefined => page.querySelector('app-photo-viewer .shown')?.getAttribute('src');
        expect(shown()).toBe('/photos/71');
        expect(texts(page, 'app-photo-viewer .label')).toEqual(['scan.back · 2 / 3']);

        click(page, 'app-photo-viewer .next');
        fixture.detectChanges();
        expect(shown()).toBe('https://assets.example/base1/4/high.webp');
        expect((page.querySelector('app-photo-viewer .next') as HTMLButtonElement).disabled).toBe(true);

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
        fixture.detectChanges();
        expect(shown()).toBe('/photos/71');

        click(page, 'app-photo-viewer .close');
        fixture.detectChanges();
        expect(page.querySelector('app-photo-viewer')).toBeNull();
    });

    it('crops a stored photo again and saves it in place of the old one', async () => {
        const stored = new Blob(['stored front']);
        api.getPhoto.mockReturnValue(of(stored));
        api.replacePhoto.mockReturnValue(of({ ...confirmed, photos: { front: 90, back: 71 } }));
        await open(confirmed);

        click(page, '.photo-actions .recrop');
        fixture.detectChanges();
        expect(api.getPhoto).toHaveBeenCalledWith(70, true);
        expect(page.querySelector('app-crop-editor')).not.toBeNull();
        expect(page.querySelector('.photos')).toBeNull();

        click(page, 'app-crop-editor .whole');
        await settle();

        expect(scaler.scale).toHaveBeenCalledWith(stored);
        expect(api.replacePhoto).toHaveBeenCalledWith(7, 'front', scaled, true);
        expect(Array.from(page.querySelectorAll('.photos img'), (image) => image.getAttribute('src'))).toEqual(['/photos/90?thumb', '/photos/71?thumb']);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:editing');
        expect(TestBed.inject(ToastService).toasts().map((toast) => toast.text)).toEqual(['card.photo.saved']);
    });

    it('keeps the photo and its crop when saving fails, so it can be tried again', async () => {
        api.getPhoto.mockReturnValue(of(new Blob(['stored front'])));
        api.replacePhoto.mockReturnValueOnce(throwError(() => new Error('offline'))).mockReturnValue(of(confirmed));
        await open(confirmed);
        click(page, '.photo-actions .recrop');
        fixture.detectChanges();

        click(page, 'app-crop-editor .whole');
        await settle();
        expect(page.querySelector('app-crop-editor')).not.toBeNull();
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        expect(TestBed.inject(ToastService).toasts().map((toast) => toast.text)).toEqual(['common.failed']);

        click(page, 'app-crop-editor .whole');
        await settle();
        expect(api.replacePhoto).toHaveBeenCalledTimes(2);
        expect(page.querySelector('app-crop-editor')).toBeNull();
    });

    it('starts clean when the route goes to another copy, and keeps a late answer for the first one away', async () => {
        const late = new Subject<CardDetail>();
        api.updateCard.mockReturnValue(late);
        api.searchCatalog.mockReturnValue(of([reprint]));
        await open(confirmed);
        click(page, 'button.danger');
        click(page, '.card .btn');
        fixture.detectChanges();
        click(page, 'form button');
        click(page, '.photo-open');
        const notes = page.querySelector('textarea') as HTMLTextAreaElement;
        notes.value = 'for copy 7';
        notes.dispatchEvent(new Event('change'));
        await settle();
        expect(texts(page, 'button.danger')).toEqual(['delete card.deleteSure']);
        expect(page.querySelector('app-photo-viewer')).not.toBeNull();
        expect(page.querySelector('.candidate')).not.toBeNull();

        api.getCard.mockReturnValue(of(detail(8, { name: 'Blastoise' })));
        fixture.componentRef.setInput('id', '8');
        await settle();
        expect(texts(page, 'h1')).toEqual(['Blastoise']);
        expect(texts(page, 'button.danger')).toEqual(['delete card.delete']);
        expect(page.querySelector('app-photo-viewer')).toBeNull();
        expect(page.querySelector('form')).toBeNull();
        expect(page.querySelector('.candidate')).toBeNull();

        late.next({ ...confirmed, notes: 'for copy 7' });
        await settle();
        expect(texts(page, 'h1')).toEqual(['Blastoise']);
        expect(store.put).toHaveBeenLastCalledWith({ ...confirmed, notes: 'for copy 7' });
    });

    it('takes a new photo for one side and lets it be cropped before saving', async () => {
        api.replacePhoto.mockReturnValue(of(confirmed));
        await open(confirmed);

        const input = page.querySelectorAll('.photo-actions input[type=file]')[1] as HTMLInputElement;
        const file = new File(['new back'], 'back.jpg', { type: 'image/jpeg' });
        Object.defineProperty(input, 'files', { configurable: true, value: [file] });
        input.dispatchEvent(new Event('change'));
        fixture.detectChanges();
        expect(texts(page, 'h2.section-title')[0]).toBe('card.photo.editTitle');

        click(page, 'app-crop-editor .cancel');
        fixture.detectChanges();
        expect(page.querySelector('app-crop-editor')).toBeNull();
        expect(api.replacePhoto).not.toHaveBeenCalled();
    });

    it('lists the other copies of the same card and says when this copy may be worth grading', async () => {
        store.cards.set([
            detail(7, { catalogCardId: 'base1-4' }),
            detail(8, { catalogCardId: 'base1-4', condition: 'poor', value: 40 }),
            detail(9, { catalogCardId: 'base1-58' }),
            detail(10, { catalogCardId: 'base1-4', language: 'nl' })
        ]);
        await open({ ...confirmed, condition: 'near_mint', worthGrading: true });

        expect(texts(page, '.copy-link')).toEqual(['condition.poor · €40.00']);
        expect(page.querySelector('.copy-link')?.getAttribute('href')).toBe('/cards/8');
        expect(texts(page, '.grading-note')).toEqual(['workspace_premiumcard.worthGrading']);
    });

    it('shows no copies or grading note for a single copy in played condition', async () => {
        await open(confirmed);

        expect(page.querySelector('.copies')).toBeNull();
        expect(page.querySelector('.grading-note')).toBeNull();
    });

    it('takes the price the user types for this copy, with a comma or a point, and clears it when emptied', async () => {
        api.updateCard.mockReturnValue(of({ ...confirmed, ownPrice: 120.5, value: 120.5, valueSource: 'own' }));
        await open(confirmed);
        const field = page.querySelector('.own-price') as HTMLInputElement;
        const enter = async (text: string): Promise<void> => {
            field.value = text;
            field.dispatchEvent(new Event('change'));
            await settle();
        };

        await enter('120,50');
        expect(texts(page, '.value')).toEqual(['€120.50']);
        expect(texts(page, '.value-label')).toEqual(['card.valueFrom.own']);

        await enter(' ');
        await enter('cheap');

        expect(api.updateCard.mock.calls.map((call) => call[1])).toEqual([{ ownPrice: 120.5 }, { ownPrice: null }]);
        expect(TestBed.inject(ToastService).toasts().map((toast) => toast.text)).toEqual(['common.failed']);
    });

    it('takes only plain amounts as a price, and marks a price or note that was not saved while keeping what was typed', async () => {
        api.updateCard.mockReturnValueOnce(throwError(() => new Error('offline'))).mockReturnValue(of({ ...confirmed, notes: 'sleeved' }));
        await open(confirmed);
        const price = page.querySelector('.own-price') as HTMLInputElement;
        const notes = page.querySelector('textarea') as HTMLTextAreaElement;
        const enter = async (field: HTMLInputElement | HTMLTextAreaElement, text: string): Promise<void> => {
            field.value = text;
            field.dispatchEvent(new Event('change'));
            await settle();
        };

        await enter(price, '1e999');
        await enter(price, '0x1F');
        expect(api.updateCard).not.toHaveBeenCalled();
        expect(price.classList.contains('unsaved')).toBe(true);
        expect(price.value).toBe('0x1F');

        await enter(notes, 'sleeved');
        expect(notes.classList.contains('unsaved')).toBe(true);
        expect(notes.value).toBe('sleeved');
        expect(texts(page, '.unsaved-note')).toEqual(['card.unsaved', 'card.unsaved']);

        await enter(notes, 'sleeved');
        expect(notes.classList.contains('unsaved')).toBe(false);
        expect(texts(page, '.unsaved-note')).toEqual(['card.unsaved']);
    });

    it('sends changes one after another, so the last one made is the last one stored', async () => {
        const first = new Subject<CardDetail>();
        api.updateCard.mockReturnValueOnce(first).mockReturnValue(of({ ...confirmed, notes: 'second' }));
        await open(confirmed);
        const notes = page.querySelector('textarea') as HTMLTextAreaElement;
        for (const text of ['first', 'second']) {
            notes.value = text;
            notes.dispatchEvent(new Event('change'));
        }
        await settle();
        expect(api.updateCard).toHaveBeenCalledTimes(1);

        first.next({ ...confirmed, notes: 'first' });
        first.complete();
        await settle();

        expect(api.updateCard.mock.calls.map((call) => call[1])).toEqual([{ notes: 'first' }, { notes: 'second' }]);
        expect(store.put).toHaveBeenLastCalledWith({ ...confirmed, notes: 'second' });
    });

    it('stays on the photo that was stepped to when the card is fetched again', async () => {
        api.updateCard.mockReturnValue(of({ ...confirmed, notes: 'again' }));
        await open(confirmed);
        click(page, '.photo-open');
        fixture.detectChanges();
        click(page, 'app-photo-viewer .next');
        fixture.detectChanges();
        expect(texts(page, 'app-photo-viewer .label')).toEqual(['scan.back · 2 / 2']);

        const notes = page.querySelector('textarea') as HTMLTextAreaElement;
        notes.value = 'again';
        notes.dispatchEvent(new Event('change'));
        await settle();

        expect(texts(page, 'app-photo-viewer .label')).toEqual(['scan.back · 2 / 2']);
    });

    it('tells when the price is the card\'s general one, and why', async () => {
        await open({ ...confirmed, priceBasis: 'general' });
        expect(texts(page, '.basis')).toEqual(['card.basis.general']);

        fixture.destroy();
        await open({ ...confirmed, variant: undefined, priceBasis: 'general' });
        expect(texts(page, '.basis')).toEqual(['card.basis.finishUnknown']);

        fixture.destroy();
        await open({ ...confirmed, variant: 'reverse', priceBasis: 'foil' });
        expect(texts(page, '.basis')).toEqual(['card.basis.foil']);
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

        expect(texts(page, '.detail-condition .toggle')).toEqual(['conditionShort.goodarrow_drop_down']);
        click(page, '.detail-condition .toggle');
        fixture.detectChanges();
        click(page, '.detail-condition .option[data-value="played"]');
        await settle();
        click(page, '.detail-finish .toggle');
        fixture.detectChanges();
        click(page, '.detail-finish .option');
        await settle();

        expect(api.updateCard.mock.calls.map((call) => call[1])).toEqual([{ condition: 'played' }, { variant: null }]);
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
        click(page, '.detail-condition .toggle');
        fixture.detectChanges();
        click(page, '.detail-condition .option[data-value="poor"]');
        await settle();

        expect(TestBed.inject(ToastService).toasts().map((toast) => toast.text)).toEqual(['common.failed']);
    });
});
