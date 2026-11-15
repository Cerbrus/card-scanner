import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

import { findCard } from './card-finder';
import { Corners, Point, startCorners } from './perspective';

export type CropSource = 'found' | 'last' | 'middle';

export interface CropStartCorners {
    corners: Corners;
    source: CropSource;
}

const LAST_CROP_KEY = 'last-crop';
const SEARCH_SIDE = 400;

@Injectable({ providedIn: 'root' })
export class CropStart {
    private readonly document = inject(DOCUMENT);

    public corners(image: HTMLImageElement): CropStartCorners {
        const width = image.naturalWidth;
        const height = image.naturalHeight;
        const found = this.find(image);
        if (found) {
            return { corners: found, source: 'found' };
        }

        const last = this.last();

        return last
            ? { corners: last.map(({ x, y }) => ({ x: x * width, y: y * height })) as Corners, source: 'last' }
            : { corners: startCorners(width, height), source: 'middle' };
    }

    public remember(corners: Corners, width: number, height: number): void {
        try {
            localStorage.setItem(LAST_CROP_KEY, JSON.stringify(corners.map(({ x, y }) => ({ x: x / width, y: y / height }))));
        } catch {
            return;
        }
    }

    private find(image: HTMLImageElement): Corners | undefined {
        try {
            const scale = Math.min(1, SEARCH_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = this.document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) {
                return undefined;
            }
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const found = findCard(context.getImageData(0, 0, canvas.width, canvas.height));

            return found?.map(({ x, y }) => ({ x: x / scale, y: y / scale })) as Corners | undefined;
        } catch {
            return undefined;
        }
    }

    private last(): Corners | undefined {
        try {
            const stored = JSON.parse(localStorage.getItem(LAST_CROP_KEY) ?? 'null') as unknown;
            const valid = Array.isArray(stored) && stored.length === 4 && stored.every((point: Partial<Point> | null) => typeof point?.x === 'number' && typeof point?.y === 'number');

            return valid ? (stored as Corners) : undefined;
        } catch {
            return undefined;
        }
    }
}
