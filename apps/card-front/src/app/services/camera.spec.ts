import { TestBed } from '@angular/core/testing';

import { Camera, PHOTO_WAIT_MILLISECONDS } from './camera';

describe('taking a photo with the camera in the page', () => {
    const stream = { getVideoTracks: () => [{}] } as unknown as MediaStream;
    const video = document.createElement('video');
    const frame = new Blob(['frame']);
    let taken: Promise<Blob>;

    beforeEach(() => {
        vi.useFakeTimers();
        HTMLCanvasElement.prototype.toBlob = (done: BlobCallback): void => done(frame);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('uses the full photo the browser takes', async () => {
        const photo = new Blob(['photo']);
        taken = Promise.resolve(photo);
        vi.stubGlobal('ImageCapture', class { public takePhoto = (): Promise<Blob> => taken; });

        expect(await TestBed.inject(Camera).takePhoto(stream, video)).toBe(photo);
    });

    it('falls back to the video frame when the browser never delivers the photo', async () => {
        taken = new Promise<Blob>(() => undefined);
        vi.stubGlobal('ImageCapture', class { public takePhoto = (): Promise<Blob> => taken; });

        const result = TestBed.inject(Camera).takePhoto(stream, video);
        await vi.advanceTimersByTimeAsync(PHOTO_WAIT_MILLISECONDS);

        expect(await result).toBe(frame);
    });

    it('takes the video frame where the browser cannot take a photo, or the photo fails', async () => {
        expect(await TestBed.inject(Camera).takePhoto(stream, video)).toBe(frame);

        taken = Promise.reject(new Error('camera busy'));
        vi.stubGlobal('ImageCapture', class { public takePhoto = (): Promise<Blob> => taken; });

        expect(await TestBed.inject(Camera).takePhoto(stream, video)).toBe(frame);
    });
});
