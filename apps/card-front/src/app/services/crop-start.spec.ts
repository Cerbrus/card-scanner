import { TestBed } from '@angular/core/testing';

import { CropStart } from './crop-start';
import { startCorners } from './perspective';

describe('where the corners start', () => {
    const image = (width: number, height: number): HTMLImageElement => {
        const element = document.createElement('img');
        Object.defineProperties(element, { naturalWidth: { value: width }, naturalHeight: { value: height } });

        return element;
    };

    beforeEach(() => localStorage.clear());

    it('starts in the middle of the first photo when no card is found', () => {
        expect(TestBed.inject(CropStart).corners(image(3000, 4000))).toEqual({ corners: startCorners(3000, 4000), source: 'middle' });
    });

    it('starts from the corners of the previous crop, scaled to the new photo', () => {
        const start = TestBed.inject(CropStart);
        start.remember(
            [
                { x: 300, y: 400 },
                { x: 2700, y: 400 },
                { x: 2700, y: 3600 },
                { x: 300, y: 3600 }
            ],
            3000,
            4000
        );

        expect(start.corners(image(1500, 2000))).toEqual({
            corners: [
                { x: 150, y: 200 },
                { x: 1350, y: 200 },
                { x: 1350, y: 1800 },
                { x: 150, y: 1800 }
            ],
            source: 'last'
        });
    });

    it('ignores stored corners it cannot use', () => {
        localStorage.setItem('last-crop', '{"broken": true}');

        expect(TestBed.inject(CropStart).corners(image(100, 100)).source).toBe('middle');
    });
});
