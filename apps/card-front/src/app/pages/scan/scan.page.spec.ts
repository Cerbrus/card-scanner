import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { FakeStore, card, click, detail, fakeStore, texts } from '../../../testing/fakes';
import { TranslateTesting } from '../../../testing/translate';
import { LiveCameraComponent } from '../../components/live-camera/live-camera.component';
import { ApiService } from '../../services/api.service';
import { Camera } from '../../services/camera';
import { CardTextReader } from '../../services/card-text-reader';
import { CollectionStore } from '../../services/collection.store';
import { PhotoScaler } from '../../services/photo-scaler';
import { ToastService } from '../../services/toast.service';
import { ScanPage } from './scan.page';

const scaler = {
    fail: false,
    scale: vi.fn((file: Blob): Promise<{ photo: Blob; thumb: Blob }> =>
        scaler.fail ? Promise.reject(new Error('not a picture')) : Promise.resolve({ photo: file, thumb: new Blob(['thumb']) })
    ),
    straighten: vi.fn((file: Blob, _corners: Array<{ x: number; y: number }>): Promise<{ photo: Blob; thumb: Blob; source: Blob }> =>
        Promise.resolve({ photo: new Blob(['straight']), thumb: new Blob(['straight thumb']), source: file })
    )
};

const camera = { live: false, available: (): boolean => camera.live, open: vi.fn(() => new Promise<MediaStream>(() => undefined)), takePhoto: vi.fn() };

const reader = { read: vi.fn(() => Promise.resolve({ name: 'Charizard', number: '4/102' })) };

describe('ScanPage', () => {
    let fixture: ComponentFixture<ScanPage>;
    let page: HTMLElement;
    let store: FakeStore;
    const charizard = { catalogCardId: 'base1-4', name: 'Charizard', localId: '4', setId: 'base1', setName: 'Base Set', score: 13 };
    const api = { createCard: vi.fn(), getCard: vi.fn(), updateCard: vi.fn(), confirmCard: vi.fn(), searchCatalog: vi.fn(), deleteCard: vi.fn() };

    const pick = (index: number): void => {
        const input = page.querySelectorAll('input[type=file]')[index] as HTMLInputElement;
        Object.defineProperty(input, 'files', { configurable: true, value: [new File([`side ${index}`], 'photo.jpg', { type: 'image/jpeg' })] });
        input.dispatchEvent(new Event('change'));
        fixture.detectChanges();
    };
    const settle = async (): Promise<void> => {
        for (let round = 0; round < 4; round++) {
            await fixture.whenStable();
            await Promise.resolve();
            fixture.detectChanges();
        }
    };
    const photograph = async (index: number, button = '.whole'): Promise<void> => {
        pick(index);
        click(page, `app-crop-editor ${button}`);
        await settle();
    };
    const create = (): void => {
        fixture = TestBed.createComponent(ScanPage);
        fixture.detectChanges();
        page = fixture.nativeElement as HTMLElement;
    };
    const liveCamera = (): LiveCameraComponent => fixture.debugElement.query(By.directive(LiveCameraComponent)).componentInstance as LiveCameraComponent;
    const toasts = (): Array<string> =>
        TestBed.inject(ToastService)
            .toasts()
            .map((toast) => `${toast.kind}: ${toast.text}`);

    beforeEach(() => {
        scaler.fail = false;
        camera.live = false;
        localStorage.clear();
        scaler.scale.mockClear();
        scaler.straighten.mockClear();
        reader.read.mockClear();
        store = fakeStore();
        api.createCard.mockReset();
        api.getCard.mockReset().mockImplementation((id: number) => of(detail(id, { status: 'identified', candidates: [charizard] })));
        api.updateCard.mockReset().mockImplementation((id: number) => of(detail(id, { status: 'identified' })));
        api.confirmCard.mockReset().mockImplementation((id: number) => of(detail(id, { name: 'Charizard' })));
        URL.createObjectURL = vi.fn(() => 'blob:preview');
        URL.revokeObjectURL = vi.fn();
        TestBed.configureTestingModule({
            imports: [TranslateTesting],
            providers: [
                provideRouter([]),
                { provide: ApiService, useValue: api },
                { provide: CollectionStore, useValue: store },
                { provide: PhotoScaler, useValue: scaler },
                { provide: CardTextReader, useValue: reader },
                { provide: Camera, useValue: camera }
            ]
        });
        create();
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

        const form = api.createCard.mock.calls[0][0] as FormData;
        expect([form.get('name'), form.get('number')]).toEqual(['Charizard', '4/102']);
        expect(Array.from(form.keys()).filter((key) => key.endsWith('Source'))).toEqual(['frontSource']);
        expect(page.querySelector('.read-result')).toBeNull();
    });

    it('does not read a front that was kept whole, because the card can be anywhere on it', async () => {
        api.createCard.mockReturnValue(of(card(7, { status: 'new' })));
        await photograph(0);
        await photograph(1);

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

    it('saves the card by itself as soon as both sides are photographed', async () => {
        api.createCard.mockReturnValue(of(card(7, { status: 'new' })));
        expect(page.querySelector('button.save')).toBeNull();

        await photograph(0);
        expect(api.createCard).not.toHaveBeenCalled();
        expect(page.querySelectorAll('.side.filled').length).toBe(1);

        await photograph(1);
        expect(api.createCard).toHaveBeenCalledTimes(1);
        expect(page.querySelector('app-card-details')).not.toBeNull();
    });

    it('sends both photos, then asks right away which card it is with its condition, finish and language', async () => {
        api.createCard.mockReturnValue(of(card(7, { status: 'new' })));
        await photograph(0);
        await photograph(1);

        const form = api.createCard.mock.calls[0][0] as FormData;
        expect(Array.from(form.keys())).toEqual(['front', 'frontThumb', 'back', 'backThumb']);
        expect(store.put).toHaveBeenCalledWith(card(7, { status: 'new' }));
        expect(page.querySelector('.sides')).toBeNull();
        expect(texts(page, 'app-card-details .chosen .font-semibold')).toEqual(['Charizard']);

        click(page, 'app-card-details .choice.condition', 1);
        click(page, 'app-card-details .choice.finish', 1);
        click(page, 'app-card-details .choice.language', 1);
        fixture.detectChanges();
        click(page, 'app-card-details .next');
        await fixture.whenStable();
        fixture.detectChanges();

        expect(api.updateCard).toHaveBeenCalledWith(7, { condition: 'near_mint', variant: 'holo', language: 'nl' });
        expect(api.confirmCard).toHaveBeenCalledWith(7, 'base1-4');
        expect(toasts()).toEqual(['ok: scan.saved']);
        expect(page.querySelector('app-card-details')).toBeNull();
        expect(page.querySelectorAll('.side.filled').length).toBe(0);
        expect(texts(page, 'p.muted.mt-4')[0]).toContain('scan.count');
        expect(localStorage.getItem('last-card-language')).toBe('nl');
        expect(localStorage.getItem('last-card-condition')).toBe('near_mint');
    });

    it('starts from the last language and condition, and stops to the collection after saving', async () => {
        localStorage.setItem('last-card-language', 'de');
        localStorage.setItem('last-card-condition', 'excellent');
        api.createCard.mockReturnValue(of(card(8, { status: 'new' })));
        api.getCard.mockReturnValue(of(detail(8, { status: 'new', candidates: [] })));
        await photograph(0);
        await photograph(1);

        expect(page.querySelector('app-card-details .choice.language.on')?.textContent).toContain('language.de');
        expect(texts(page, 'app-card-details .choice.condition.on')).toEqual(['conditionShort.excellent']);
        expect(texts(page, 'app-card-details .choice.finish.on')).toEqual(['variant.normal']);
        expect(texts(page, 'app-card-details .keep')).toEqual(['save details.next', 'save details.stop']);

        const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
        click(page, 'app-card-details .stop');
        await settle();
        expect(api.updateCard).toHaveBeenCalledWith(8, { condition: 'excellent', variant: 'normal', language: 'de' });
        expect(api.confirmCard).not.toHaveBeenCalled();
        expect(navigate).toHaveBeenCalledWith('/collection');
    });

    it('throws a scanned card away from the details step and goes back to scanning', async () => {
        api.createCard.mockReturnValue(of(card(9, { status: 'new' })));
        api.deleteCard.mockReturnValue(of(undefined));
        await photograph(0);
        await photograph(1);

        click(page, 'app-card-details .discard');
        await settle();

        expect(api.deleteCard).toHaveBeenCalledWith(9);
        expect(store.drop).toHaveBeenCalledWith(9);
        expect(api.updateCard).not.toHaveBeenCalled();
        expect(page.querySelector('app-card-details')).toBeNull();
        expect(page.querySelectorAll('.side.filled').length).toBe(0);
        expect(toasts()).toEqual(['ok: scan.discarded']);
    });

    it('keeps the photos when saving fails, so the user can try again', async () => {
        api.createCard.mockReturnValue(throwError(() => new Error('offline')));
        await photograph(0);
        await photograph(1);

        expect(toasts()).toEqual(['error: scan.failed']);
        expect(page.querySelectorAll('.side.filled').length).toBe(2);

        api.createCard.mockReturnValue(of(card(7, { status: 'new' })));
        click(page, 'button.save');
        await settle();
        expect(api.createCard).toHaveBeenCalledTimes(2);
        expect(page.querySelector('app-card-details')).not.toBeNull();
    });

    it('says so when a chosen file is not a usable photo', async () => {
        scaler.fail = true;
        await photograph(0);

        expect(toasts()).toEqual(['error: scan.unreadable']);
        expect(page.querySelectorAll('.side.filled').length).toBe(0);
    });

    it('throws the photos away on request', async () => {
        await photograph(0);
        click(page, 'button.again');
        fixture.detectChanges();

        expect(page.querySelectorAll('.side.filled').length).toBe(0);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    });

    describe('with the camera in the app', () => {
        const found = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 130 }, { x: 10, y: 130 }];
        const shot = (corners?: typeof found): void => {
            liveCamera().captured.emit({ file: new Blob(['frame']), corners: corners as never });
        };

        beforeEach(() => {
            camera.live = true;
            fixture.destroy();
            create();
        });

        it('shows the camera instead of the phone camera buttons', () => {
            expect(page.querySelector('app-live-camera')).not.toBeNull();
            expect(page.querySelectorAll('input[type=file]').length).toBe(0);
            expect(page.querySelector('.side.next')?.textContent).toContain('scan.front');
        });

        it('straightens a photo where the card was found without asking, and saves after the back', async () => {
            api.createCard.mockReturnValue(of(card(7, { status: 'new' })));
            shot(found);
            await settle();

            expect(scaler.straighten).toHaveBeenCalledWith(expect.any(Blob), found);
            expect(page.querySelector('app-crop-editor')).toBeNull();
            expect(page.querySelector('.side.next')?.textContent).toContain('scan.back');

            shot(found);
            await settle();
            expect(api.createCard).toHaveBeenCalledTimes(1);
            expect(page.querySelector('app-card-details')).not.toBeNull();
            expect(page.querySelector('app-live-camera')?.classList).toContain('hidden');
        });

        it('asks for the corners when the card was not found, and takes a side again after a tap on it', async () => {
            shot();
            await settle();
            expect(page.querySelector('app-crop-editor')).not.toBeNull();
            click(page, 'app-crop-editor .whole');
            await settle();
            expect(page.querySelectorAll('.side.filled').length).toBe(1);

            click(page, '.side.filled');
            fixture.detectChanges();
            expect(page.querySelectorAll('.side.filled').length).toBe(0);
            expect(page.querySelector('.side.next')?.textContent).toContain('scan.front');
            expect(page.querySelector('app-crop-editor')).toBeNull();
        });

        it('falls back to the phone camera when the camera cannot be opened', () => {
            liveCamera().unavailable.emit();
            fixture.detectChanges();

            expect(page.querySelectorAll('input[type=file]').length).toBe(2);
            expect(toasts()).toEqual(['error: scan.camera.unavailable']);
        });

        it('remembers when the phone camera is chosen instead', () => {
            click(page, 'button.camera-choice');
            fixture.detectChanges();

            expect(page.querySelectorAll('input[type=file]').length).toBe(2);
            expect(localStorage.getItem('scan-camera')).toBe('phone');

            fixture.destroy();
            create();
            expect(page.querySelector('app-live-camera')).toBeNull();
        });
    });
});
