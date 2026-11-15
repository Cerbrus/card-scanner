import { Injectable } from '@angular/core';

import { Corners, straightSize, warp } from './perspective';

export const PHOTO_SIDE = 2400;
export const THUMB_SIDE = 480;

const PHOTO_QUALITY = 0.85;
const THUMB_QUALITY = 0.75;
const SOURCE_SIDE = 3200;

export interface ScaledPhoto {
    photo: Blob;
    thumb: Blob;
}

type Drawable = HTMLImageElement | HTMLCanvasElement;

export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
    const scale = Math.min(1, maxSide / Math.max(width, height));

    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

@Injectable({ providedIn: 'root' })
export class PhotoScaler {
    public scale(file: Blob): Promise<ScaledPhoto> {
        return this.withImage(file, async (image) => ({
            photo: await draw(image, image.naturalWidth, image.naturalHeight, PHOTO_SIDE, PHOTO_QUALITY),
            thumb: await draw(image, image.naturalWidth, image.naturalHeight, THUMB_SIDE, THUMB_QUALITY)
        }));
    }

    public straighten(file: Blob, corners: Corners): Promise<ScaledPhoto> {
        return this.withImage(file, async (image) => {
            const source = canvasOf(fitWithin(image.naturalWidth, image.naturalHeight, SOURCE_SIDE));
            const sourceContext = context(source);
            sourceContext.drawImage(image, 0, 0, source.width, source.height);
            const factor = source.width / image.naturalWidth;
            const scaled = corners.map(({ x, y }) => ({ x: x * factor, y: y * factor })) as Corners;

            const size = straightSize(scaled, PHOTO_SIDE);
            const card = canvasOf(size);
            const cardContext = context(card);
            const target = cardContext.createImageData(size.width, size.height);
            warp(sourceContext.getImageData(0, 0, source.width, source.height), scaled, size, target);
            cardContext.putImageData(target, 0, 0);

            return {
                photo: await draw(card, size.width, size.height, PHOTO_SIDE, PHOTO_QUALITY),
                thumb: await draw(card, size.width, size.height, THUMB_SIDE, THUMB_QUALITY)
            };
        });
    }

    private async withImage<T>(file: Blob, use: (image: HTMLImageElement) => Promise<T>): Promise<T> {
        const url = URL.createObjectURL(file);

        try {
            const image = new Image();
            image.src = url;
            await image.decode();

            return await use(image);
        } finally {
            URL.revokeObjectURL(url);
        }
    }
}

function canvasOf(size: { width: number; height: number }): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    return canvas;
}

function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const found = canvas.getContext('2d', { willReadFrequently: true });
    if (!found) {
        throw new Error('This browser cannot draw the photo');
    }

    return found;
}

function draw(source: Drawable, sourceWidth: number, sourceHeight: number, maxSide: number, quality: number): Promise<Blob> {
    const canvas = canvasOf(fitWithin(sourceWidth, sourceHeight, maxSide));
    context(canvas).drawImage(source, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The photo could not be made smaller'))), 'image/jpeg', quality)
    );
}
