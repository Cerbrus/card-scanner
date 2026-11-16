import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

import { findCard, refineCard } from './card-finder';
import { Corners, Point, startCorners } from './perspective';

export type CropSource = 'found' | 'last' | 'middle';

export interface CropStartCorners {
    corners: Corners;
    source: CropSource;
}

const LAST_CROP_KEY = 'last-crop';
const SEARCH_SIDE = 400;
const REFINE_SIDE = 1200;

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

    public async findIn(file: Blob): Promise<Corners | undefined> {
        const url = URL.createObjectURL(file);
        try {
            const image = new Image();
            image.src = url;
            await image.decode();

            return this.find(image);
        } catch {
            return undefined;
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    private find(image: HTMLImageElement): Corners | undefined {
        try {
            const search = this.pixels(image, SEARCH_SIDE);
            const found = search && findCard(search.pixels);
            if (!found) {
                return undefined;
            }

            const fine = this.pixels(image, REFINE_SIDE);
            const rough = found.map(({ x, y }) => ({ x: x / search.scale, y: y / search.scale })) as Corners;

            return fine ? (refineCard(fine.pixels, rough.map(({ x, y }) => ({ x: x * fine.scale, y: y * fine.scale })) as Corners).map(({ x, y }) => ({ x: x / fine.scale, y: y / fine.scale })) as Corners) : rough;
        } catch {
            return undefined;
        }
    }

    private pixels(image: HTMLImageElement, side: number): { pixels: ImageData; scale: number } | undefined {
        const scale = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = this.document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
            return undefined;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        return { pixels: context.getImageData(0, 0, canvas.width, canvas.height), scale };
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
