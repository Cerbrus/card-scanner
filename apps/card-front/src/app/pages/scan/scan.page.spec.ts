import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';

import { ScanPage } from './scan.page';
import { FakeStore, card, click, fakeStore, texts } from '../../../testing/fakes';
import { ApiService } from '../../services/api.service';
import { CollectionStore } from '../../services/collection.store';
import { PhotoScaler } from '../../services/photo-scaler';
import { ToastService } from '../../services/toast.service';

const scaler = {
    fail: false,
    scale: (file: Blob): Promise<{ photo: Blob; thumb: Blob }> =>
        scaler.fail ? Promise.reject(new Error('not a picture')) : Promise.resolve({ photo: file, thumb: new Blob(['thumb']) })
};

describe('ScanPage', () => {
    let fixture: ComponentFixture<ScanPage>;
    let page: HTMLElement;
    let store: FakeStore;
    const api = { createCard: vi.fn() };

    const photograph = async (index: number): Promise<void> => {
        const input = page.querySelectorAll('input[type=file]')[index] as HTMLInputElement;
        Object.defineProperty(input, 'files', { configurable: true, value: [new File([`side ${index}`], 'photo.jpg', { type: 'image/jpeg' })] });
        input.dispatchEvent(new Event('change'));
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
                { provide: PhotoScaler, useValue: scaler }
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
