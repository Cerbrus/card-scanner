import { ComponentFixture, TestBed } from '@angular/core/testing';

import { click } from '../../../testing/fakes';
import { TranslateTesting } from '../../../testing/translate';
import { Camera } from '../../services/camera';
import { CropStart } from '../../services/crop-start';
import { CameraShot, LiveCameraComponent } from './live-camera.component';

describe('LiveCameraComponent', () => {
    let fixture: ComponentFixture<LiveCameraComponent>;
    let host: HTMLElement;
    let photo: (file: Blob) => void;
    const track = { stop: vi.fn(), addEventListener: vi.fn() };
    const camera = {
        open: vi.fn(() => Promise.resolve(Object.assign(new MediaStream(), { getTracks: () => [track] as unknown as Array<MediaStreamTrack> }))),
        takePhoto: vi.fn(() => new Promise<Blob>((resolve) => (photo = resolve)))
    };
    const shots: Array<CameraShot> = [];

    const settle = async (): Promise<void> => {
        for (let round = 0; round < 4; round++) {
            await fixture.whenStable();
            await Promise.resolve();
            fixture.detectChanges();
        }
    };

    beforeEach(async () => {
        shots.length = 0;
        vi.clearAllMocks();
        localStorage.clear();
        HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
        TestBed.configureTestingModule({
            imports: [TranslateTesting],
            providers: [
                { provide: Camera, useValue: camera },
                { provide: CropStart, useValue: { findIn: () => Promise.resolve(undefined) } }
            ]
        });
        fixture = TestBed.createComponent(LiveCameraComponent);
        fixture.componentRef.setInput('side', 'back');
        fixture.componentInstance.captured.subscribe((shot) => shots.push(shot));
        host = fixture.nativeElement as HTMLElement;
        fixture.detectChanges();
        await settle();
    });

    afterEach(() => fixture.destroy());

    it('opens the camera and stops it when the page is left', () => {
        expect(camera.open).toHaveBeenCalledTimes(1);
        expect(host.querySelector('.shutter')?.getAttribute('aria-disabled')).toBe('false');

        fixture.destroy();
        expect(track.stop).toHaveBeenCalledTimes(1);
    });

    it('stops looking for the card while it is paused, and looks again after', async () => {
        const frames = vi.spyOn(window, 'requestAnimationFrame');
        const cancelled = vi.spyOn(window, 'cancelAnimationFrame');
        const timers = vi.spyOn(window, 'clearTimeout');

        fixture.componentRef.setInput('paused', true);
        await settle();
        expect(cancelled).toHaveBeenCalled();
        expect(timers).toHaveBeenCalled();
        frames.mockClear();
        await new Promise((resolve) => setTimeout(resolve, 60));
        expect(frames).not.toHaveBeenCalled();
        expect(host.querySelector('.shutter')?.getAttribute('aria-disabled')).toBe('true');

        fixture.componentRef.setInput('paused', false);
        await settle();
        expect(frames).toHaveBeenCalled();
        expect(track.stop).not.toHaveBeenCalled();
    });

    it('lets go of the camera when the app goes to the background, and opens it again on return', async () => {
        const hide = async (hidden: boolean): Promise<void> => {
            Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
            document.dispatchEvent(new Event('visibilitychange'));
            await settle();
        };

        await hide(true);
        expect(track.stop).toHaveBeenCalledTimes(1);
        expect(host.querySelector('.shutter')?.getAttribute('aria-disabled')).toBe('true');

        await hide(false);
        expect(camera.open).toHaveBeenCalledTimes(2);
        expect(host.querySelector('.shutter')?.getAttribute('aria-disabled')).toBe('false');
        Reflect.deleteProperty(document, 'hidden');
    });

    it('opens the camera again when another app took it', async () => {
        const ended = track.addEventListener.mock.calls[0][1] as () => void;
        ended();
        await settle();

        expect(camera.open).toHaveBeenCalledTimes(2);
        expect(host.querySelector('.shutter')?.getAttribute('aria-disabled')).toBe('false');
    });

    it('keeps a quick second tap in the camera frame from zooming the page, and still passes it to the button', () => {
        const auto = host.querySelector('.auto') as HTMLButtonElement;
        const tap = (timeStamp: number): Event => {
            const touch = new Event('touchend', { bubbles: true, cancelable: true });
            Object.defineProperty(touch, 'timeStamp', { value: timeStamp });
            auto.dispatchEvent(touch);

            return touch;
        };

        expect(tap(1000).defaultPrevented).toBe(false);
        expect(tap(1200).defaultPrevented).toBe(true);
        fixture.detectChanges();
        expect(auto.getAttribute('aria-pressed')).toBe('true');
        expect(tap(2000).defaultPrevented).toBe(false);
    });

    it('remembers whether the photo is taken by itself', () => {
        const auto = host.querySelector('.auto') as HTMLButtonElement;
        expect(auto.getAttribute('aria-pressed')).toBe('false');

        auto.click();
        fixture.detectChanges();

        expect(auto.getAttribute('aria-pressed')).toBe('true');
        expect(localStorage.getItem('scan-auto-photo')).toBe('on');
    });

    it('hands a photo over for the side it was started for, also when the side changes while it is taken', async () => {
        click(host, '.shutter');
        fixture.detectChanges();
        expect(host.querySelector('.shutter')?.getAttribute('aria-disabled')).toBe('true');

        fixture.componentRef.setInput('side', 'front');
        const file = new Blob(['back']);
        photo(file);
        await settle();

        expect(shots).toEqual([{ side: 'back', file, corners: undefined }]);
        expect(host.querySelector('.shutter')?.getAttribute('aria-disabled')).toBe('false');
    });
});
