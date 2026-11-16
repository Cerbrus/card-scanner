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
    const track = { stop: vi.fn() };
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
        expect((host.querySelector('.shutter') as HTMLButtonElement).disabled).toBe(false);

        fixture.destroy();
        expect(track.stop).toHaveBeenCalledTimes(1);
    });

    it('hands a photo over for the side it was started for, also when the side changes while it is taken', async () => {
        click(host, '.shutter');
        fixture.detectChanges();
        expect((host.querySelector('.shutter') as HTMLButtonElement).disabled).toBe(true);

        fixture.componentRef.setInput('side', 'front');
        const file = new Blob(['back']);
        photo(file);
        await settle();

        expect(shots).toEqual([{ side: 'back', file, corners: undefined }]);
        expect((host.querySelector('.shutter') as HTMLButtonElement).disabled).toBe(false);
    });
});
