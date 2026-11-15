import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { ScanPage } from './scan.page';
import { FakeStore, card, click, fakeStore, texts } from '../../../testing/fakes';
import { ApiService } from '../../services/api.service';
import { CardTextReader } from '../../services/card-text-reader';
import { CollectionStore } from '../../services/collection.store';
import { PhotoScaler } from '../../services/photo-scaler';
import { ToastService } from '../../services/toast.service';

const scaler = {
    fail: false,
    scale: vi.fn((file: Blob): Promise<{ photo: Blob; thumb: Blob }> =>
        scaler.fail ? Promise.reject(new Error('not a picture')) : Promise.resolve({ photo: file, thumb: new Blob(['thumb']) })
    ),
    straighten: vi.fn((file: Blob, _corners: Array<{ x: number; y: number }>): Promise<{ photo: Blob; thumb: Blob; source: Blob }> =>
        Promise.resolve({ photo: new Blob(['straight']), thumb: new Blob(['straight thumb']), source: file })
    )
};

const reader = { read: vi.fn(() => Promise.resolve({ name: 'Charizard', number: '4/102' })) };

describe('ScanPage', () => {
    let fixture: ComponentFixture<ScanPage>;
    let page: HTMLElement;
    let store: FakeStore;
    const api = { createCard: vi.fn() };

    const pick = (index: number): void => {
        const input = page.querySelectorAll('input[type=file]')[index] as HTMLInputElement;
        Object.defineProperty(input, 'files', { configurable: true, value: [new File([`side ${index}`], 'photo.jpg', { type: 'image/jpeg' })] });
        input.dispatchEvent(new Event('change'));
        fixture.detectChanges();
    };
    const photograph = async (index: number, button = '.whole'): Promise<void> => {
        pick(index);
        click(page, `app-crop-editor ${button}`);
        await fixture.whenStable();
        await Promise.resolve();
        fixture.detectChanges();
    };
    const saveButton = (): HTMLButtonElement => page.querySelector('button.primary') as HTMLButtonElement;
    const toasts = (): Array<string> =>
        TestBed.inject(ToastService)
            .toasts()
            .map((toast) => `${toast.kind}: ${toast.text}`);

    beforeEach(() => {
        scaler.fail = false;
        localStorage.clear();
        scaler.scale.mockClear();
        scaler.straighten.mockClear();
        reader.read.mockClear();
        store = fakeStore();
        api.createCard.mockReset();
        URL.createObjectURL = vi.fn(() => 'blob:preview');
        URL.revokeObjectURL = vi.fn();
        TestBed.configureTestingModule({
            imports: [TranslateModule.forRoot()],
            providers: [
                provideRouter([]),
                { provide: ApiService, useValue: api },
                { provide: CollectionStore, useValue: store },
                { provide: PhotoScaler, useValue: scaler },
                { provide: CardTextReader, useValue: reader }
            ]
        });
        fixture = TestBed.createComponent(ScanPage);
        fixture.detectChanges();
        page = fixture.nativeElement as HTMLElement;
    });

    it('asks the phone for its back camera, once for each side', () => {
        const inputs = Array.from(page.querySelectorAll('input[type=file]'));

        expect(inputs.map((input) => [input.getAttribute('accept'), input.getAttribute('capture')])).toEqual([['image/*', 'environment'], ['image/*', 'environment']]);
    });

    it('asks for the corners of the card after a photo is taken, and can straighten it or keep it whole', async () => {
        pick(0);

        expect(page.querySelector('app-crop-editor')).not.toBeNull();
        expect(page.querySelector('.sides')).toBeNull();

        const image = page.querySelector('app-crop-editor img') as HTMLImageElement;
        Object.defineProperties(image, { naturalWidth: { value: 3000 }, naturalHeight: { value: 4000 } });
        image.dispatchEvent(new Event('load'));
        fixture.detectChanges();
        expect(page.querySelectorAll('app-crop-editor circle.grip').length).toBe(4);

        page.querySelectorAll('app-crop-editor circle.grip')[0].dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, cancelable: true }));
        fixture.detectChanges();
        expect(page.querySelector('app-crop-editor .loupe image')?.getAttribute('href')).toBe('blob:preview');
        expect(page.querySelector('app-crop-editor .handle.active')).not.toBeNull();

        page.querySelector('app-crop-editor svg')?.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true }));
        fixture.detectChanges();
        expect(page.querySelector('app-crop-editor .loupe')).toBeNull();

        click(page, 'app-crop-editor .use');
        await fixture.whenStable();
        fixture.detectChanges();

        const corners = scaler.straighten.mock.calls[0][1];
        expect(corners.map(({ x, y }) => [Math.round(x), Math.round(y)])).toEqual([[355, 400], [2645, 400], [2645, 3600], [355, 3600]]);
        expect(page.querySelector('app-crop-editor')).toBeNull();
        expect(page.querySelectorAll('.side.filled').length).toBe(1);

        await photograph(1);
        expect(scaler.scale).toHaveBeenCalledTimes(1);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    });

    it('reads name and number from a straightened front and sends them with the scan', async () => {
        api.createCard.mockReturnValue(of(card(7, { status: 'identified' })));
        pick(0);
        const image = page.querySelector('app-crop-editor img') as HTMLImageElement;
        Object.defineProperties(image, { naturalWidth: { value: 3000 }, naturalHeight: { value: 4000 } });
        image.dispatchEvent(new Event('load'));
        fixture.detectChanges();
        click(page, 'app-crop-editor .use');
        await fixture.whenStable();
        await Promise.resolve();
        fixture.detectChanges();

        expect(reader.read).toHaveBeenCalledTimes(1);
        expect(texts(page, '.read-result')).toEqual(['text_fields scan.read.found']);

        await photograph(1);
        saveButton().click();
        await fixture.whenStable();
        fixture.detectChanges();

        const form = api.createCard.mock.calls[0][0] as FormData;
        expect([form.get('name'), form.get('number')]).toEqual(['Charizard', '4/102']);
        expect(Array.from(form.keys()).filter((key) => key.endsWith('Source'))).toEqual(['frontSource']);
        expect(page.querySelector('.read-result')).toBeNull();
    });

    it('does not read a front that was kept whole, because the card can be anywhere on it', async () => {
        api.createCard.mockReturnValue(of(card(7, { status: 'new' })));
        await photograph(0);
        await photograph(1);
        saveButton().click();
        await fixture.whenStable();

        expect(reader.read).not.toHaveBeenCalled();
        expect((api.createCard.mock.calls[0][0] as FormData).has('name')).toBe(false);
    });

    it('drops the chosen photo when cropping is cancelled', () => {
        pick(0);
        click(page, 'app-crop-editor .cancel');
        fixture.detectChanges();

        expect(page.querySelector('app-crop-editor')).toBeNull();
        expect(page.querySelectorAll('.side.filled').length).toBe(0);
        expect(scaler.scale).not.toHaveBeenCalled();
    });

    it('only lets the card be saved once both sides are photographed', async () => {
        expect(saveButton().disabled).toBe(true);

        await photograph(0);
        expect(saveButton().disabled).toBe(true);
        expect(page.querySelectorAll('.side.filled').length).toBe(1);

        await photograph(1);
        expect(saveButton().disabled).toBe(false);
    });

    it('sends both photos with their small versions, then is ready for the next card', async () => {
        api.createCard.mockReturnValue(of(card(7, { status: 'new' })));
        await photograph(0);
        await photograph(1);

        saveButton().click();
        await fixture.whenStable();
        fixture.detectChanges();

        const form = api.createCard.mock.calls[0][0] as FormData;
        expect(Array.from(form.keys())).toEqual(['front', 'frontThumb', 'back', 'backThumb']);
        expect(store.put).toHaveBeenCalledWith(card(7, { status: 'new' }));
        expect(toasts()).toEqual(['ok: scan.saved']);
        expect(page.querySelectorAll('.side.filled').length).toBe(0);
        expect(texts(page, 'p.card')[0]).toContain('scan.count');
    });

    it('keeps the photos when saving fails, so the user can try again', async () => {
        api.createCard.mockReturnValue(throwError(() => new Error('offline')));
        await photograph(0);
        await photograph(1);

        saveButton().click();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(toasts()).toEqual(['error: scan.failed']);
        expect(page.querySelectorAll('.side.filled').length).toBe(2);
        expect(saveButton().disabled).toBe(false);
    });

    it('says so when a chosen file is not a usable photo', async () => {
        scaler.fail = true;
        await photograph(0);

        expect(toasts()).toEqual(['error: scan.unreadable']);
        expect(page.querySelectorAll('.side.filled').length).toBe(0);
    });

    it('throws the photos away on request', async () => {
        await photograph(0);
        click(page, 'button.btn:not(.primary)');
        fixture.detectChanges();

        expect(page.querySelectorAll('.side.filled').length).toBe(0);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    });
});
