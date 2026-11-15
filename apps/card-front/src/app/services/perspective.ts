export interface Point {
    x: number;
    y: number;
}

export type Corners = [Point, Point, Point, Point];
export type Matrix = [number, number, number, number, number, number, number, number, number];

export const CARD_RATIO = 63 / 88;

const DEFAULT_COVER = 0.8;

export function homography(from: Corners, to: Corners): Matrix {
    const rows: Array<Array<number>> = [];
    from.forEach(({ x, y }, index) => {
        const { x: u, y: v } = to[index];
        rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
        rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    });
    const [a, b, c, d, e, f, g, h] = solve(rows);

    return [a, b, c, d, e, f, g, h, 1];
}

export function project(matrix: Matrix, { x, y }: Point): Point {
    const [a, b, c, d, e, f, g, h, i] = matrix;
    const w = g * x + h * y + i;

    return { x: (a * x + b * y + c) / w, y: (d * x + e * y + f) / w };
}

export function straightSize(corners: Corners, maxHeight: number): { width: number; height: number } {
    const [topLeft, topRight, bottomRight, bottomLeft] = corners;
    const measured = Math.max(distance(topLeft, bottomLeft), distance(topRight, bottomRight), (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2 / CARD_RATIO);
    const height = Math.max(1, Math.round(Math.min(maxHeight, measured)));

    return { width: Math.max(1, Math.round(height * CARD_RATIO)), height };
}

export function startCorners(width: number, height: number): Corners {
    const cardHeight = Math.min(height * DEFAULT_COVER, (width * DEFAULT_COVER) / CARD_RATIO);
    const cardWidth = cardHeight * CARD_RATIO;
    const left = (width - cardWidth) / 2;
    const top = (height - cardHeight) / 2;

    return [
        { x: left, y: top },
        { x: left + cardWidth, y: top },
        { x: left + cardWidth, y: top + cardHeight },
        { x: left, y: top + cardHeight }
    ];
}

export function warp(source: ImageData, corners: Corners, size: { width: number; height: number }, target: ImageData): void {
    const toSource = homography(rectangle(size.width, size.height), corners);
    const { data: input, width: sourceWidth, height: sourceHeight } = source;
    const output = target.data;

    for (let row = 0; row < size.height; row++) {
        for (let column = 0; column < size.width; column++) {
            const { x, y } = project(toSource, { x: column + 0.5, y: row + 0.5 });
            const left = Math.min(sourceWidth - 1, Math.max(0, Math.floor(x - 0.5)));
            const top = Math.min(sourceHeight - 1, Math.max(0, Math.floor(y - 0.5)));
            const right = Math.min(sourceWidth - 1, left + 1);
            const bottom = Math.min(sourceHeight - 1, top + 1);
            const across = Math.min(1, Math.max(0, x - 0.5 - left));
            const down = Math.min(1, Math.max(0, y - 0.5 - top));
            const at = (row * size.width + column) * 4;

            for (let channel = 0; channel < 4; channel++) {
                const upper = input[(top * sourceWidth + left) * 4 + channel] * (1 - across) + input[(top * sourceWidth + right) * 4 + channel] * across;
                const lower = input[(bottom * sourceWidth + left) * 4 + channel] * (1 - across) + input[(bottom * sourceWidth + right) * 4 + channel] * across;
                output[at + channel] = upper * (1 - down) + lower * down;
            }
        }
    }
}

export function rectangle(width: number, height: number): Corners {
    return [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height }
    ];
}

function distance(from: Point, to: Point): number {
    return Math.hypot(to.x - from.x, to.y - from.y);
}

function solve(rows: Array<Array<number>>): Array<number> {
    const size = rows.length;
    for (let column = 0; column < size; column++) {
        let pivot = column;
        for (let row = column + 1; row < size; row++) {
            if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) {
                pivot = row;
            }
        }
        [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
        if (Math.abs(rows[column][column]) < 1e-12) {
            throw new Error('The corners do not form a shape');
        }
        for (let row = 0; row < size; row++) {
            if (row !== column) {
                const factor = rows[row][column] / rows[column][column];
                for (let index = column; index <= size; index++) {
                    rows[row][index] -= factor * rows[column][index];
                }
            }
        }
    }

    return rows.map((row, index) => row[size] / row[index]);
}
