import { Injectable } from '@angular/core';

export const PHOTO_SIDE = 2400;
export const THUMB_SIDE = 480;

const PHOTO_QUALITY = 0.85;
const THUMB_QUALITY = 0.75;

export interface ScaledPhoto {
    photo: Blob;
    thumb: Blob;
}

export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
    const scale = Math.min(1, maxSide / Math.max(width, height));

    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

@Injectable({ providedIn: 'root' })
export class PhotoScaler {
    public async scale(file: Blob): Promise<ScaledPhoto> {
        const url = URL.createObjectURL(file);

        try {
            const image = new Image();
            image.src = url;
            await image.decode();

            return {
                photo: await draw(image, PHOTO_SIDE, PHOTO_QUALITY),
                thumb: await draw(image, THUMB_SIDE, THUMB_QUALITY)
            };
        } finally {
            URL.revokeObjectURL(url);
        }
    }
}

function draw(image: HTMLImageElement, maxSide: number, quality: number): Promise<Blob> {
    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);

    return new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The photo could not be made smaller'))), 'image/jpeg', quality)
    );
}
