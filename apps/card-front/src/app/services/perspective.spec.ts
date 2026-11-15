import { Corners, homography, project, rectangle, startCorners, straightSize, warp } from './perspective';

describe('straightening a photographed card', () => {
    const tilted: Corners = [
        { x: 120, y: 80 },
        { x: 820, y: 140 },
        { x: 760, y: 1100 },
        { x: 60, y: 1010 }
    ];
    const near = (point: { x: number; y: number }): Array<number> => [Math.round(point.x * 1000) / 1000 + 0, Math.round(point.y * 1000) / 1000 + 0];

    it('maps each corner of the card onto the matching corner of an upright rectangle', () => {
        const matrix = homography(tilted, rectangle(630, 880));

        expect(tilted.map((corner) => near(project(matrix, corner)))).toEqual([
            [0, 0],
            [630, 0],
            [630, 880],
            [0, 880]
        ]);
    });

    it('makes the result card shaped, as large as the card in the photo but not larger than allowed', () => {
        expect(straightSize(rectangle(630, 880), 2400)).toEqual({ width: 630, height: 880 });
        expect(straightSize(tilted, 2400).height).toBeGreaterThan(900);
        expect(straightSize(rectangle(6300, 8800), 2400)).toEqual({ width: 1718, height: 2400 });
    });

    it('starts with a card shaped frame in the middle of the photo', () => {
        const [topLeft, topRight, bottomRight] = startCorners(3000, 4000);

        expect([topLeft.y, bottomRight.y]).toEqual([400, 3600]);
        expect(topLeft.x + topRight.x).toBeCloseTo(3000);
        expect((topRight.x - topLeft.x) / (bottomRight.y - topRight.y)).toBeCloseTo(63 / 88);
    });

    it('copies the pixels inside the corners into the upright picture', () => {
        const width = 4;
        const height = 4;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let index = 0; index < width * height; index++) {
            const x = index % width;
            data.set(x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255], index * 4);
        }
        const target = { data: new Uint8ClampedArray(2 * 2 * 4), width: 2, height: 2 } as ImageData;

        warp({ data, width, height } as ImageData, rectangle(4, 4), { width: 2, height: 2 }, target);

        expect(Array.from(target.data.slice(0, 4))).toEqual([255, 0, 0, 255]);
        expect(Array.from(target.data.slice(4, 8))).toEqual([0, 0, 255, 255]);
    });
});
