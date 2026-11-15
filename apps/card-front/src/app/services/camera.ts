import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

interface PhotoTaker {
    takePhoto(): Promise<Blob>;
}

type PhotoTakerType = new (track: MediaStreamTrack) => PhotoTaker;

const FRAME_QUALITY = 0.92;

@Injectable({ providedIn: 'root' })
export class Camera {
    private readonly document = inject(DOCUMENT);

    public available(): boolean {
        return typeof this.document.defaultView?.navigator.mediaDevices?.getUserMedia === 'function';
    }

    public open(): Promise<MediaStream> {
        const large = this.photoTaker() ? { width: { ideal: 1920 }, height: { ideal: 1080 } } : { width: { ideal: 3840 }, height: { ideal: 2160 } };

        return navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, ...large } });
    }

    public async takePhoto(stream: MediaStream, video: HTMLVideoElement): Promise<Blob> {
        const PhotoTaker = this.photoTaker();
        const [track] = stream.getVideoTracks();
        const photo = PhotoTaker && track ? await new PhotoTaker(track).takePhoto().catch(() => undefined) : undefined;

        return photo?.size ? photo : this.frame(video);
    }

    private frame(video: HTMLVideoElement): Promise<Blob> {
        const canvas = this.document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);

        return new Promise((resolve, reject) =>
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The camera gave no picture'))), 'image/jpeg', FRAME_QUALITY)
        );
    }

    private photoTaker(): PhotoTakerType | undefined {
        return (this.document.defaultView as (Window & { ImageCapture?: PhotoTakerType }) | null)?.ImageCapture;
    }
}
