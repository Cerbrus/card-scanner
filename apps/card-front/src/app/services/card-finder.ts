import { CARD_RATIO, Corners, Point } from './perspective';

export interface Pixels {
    data: ArrayLike<number>;
    width: number;
    height: number;
}

const FRAME_SHARE = 0.04;
const MIN_AREA_SHARE = 0.08;
const MAX_AREA_SHARE = 0.97;
const MIN_DIFFERENCE = 20;
const MIN_FILL = 0.45;
const MIN_RATIO = CARD_RATIO * 0.6;
const MAX_RATIO = CARD_RATIO / 0.6;

export function otsuThreshold(histogram: ArrayLike<number>): number {
    const levels = Array.from(histogram);
    const count = levels.reduce((total, value) => total + value, 0);
    const sum = levels.reduce((total, value, level) => total + value * level, 0);
    let below = 0;
    let belowSum = 0;
    let best = 0;
    let threshold = 0;
    for (let level = 0; level < levels.length; level++) {
        below += levels[level];
        belowSum += levels[level] * level;
        const above = count - below;
        if (below && above) {
            const spread = below * above * (belowSum / below - (sum - belowSum) / above) ** 2;
            if (spread > best) {
                best = spread;
                threshold = level;
            }
        }
    }

    return threshold;
}

export function findCard(pixels: Pixels): Corners | undefined {
    const difference = differenceFromBackground(pixels);
    const histogram = new Array<number>(256).fill(0);
    difference.forEach((value) => histogram[value]++);
    const threshold = Math.max(MIN_DIFFERENCE, otsuThreshold(histogram));

    const region = largestRegion(difference, pixels.width, pixels.height, threshold);
    const total = pixels.width * pixels.height;
    if (region.length < total * MIN_AREA_SHARE || region.length > total * MAX_AREA_SHARE) {
        return undefined;
    }

    const corners = portrait(outerCorners(region, pixels.width));

    return plausible(corners, region.length) ? corners : undefined;
}

function differenceFromBackground({ data, width, height }: Pixels): Uint8Array {
    const frame = Math.max(1, Math.round(Math.min(width, height) * FRAME_SHARE));
    const edge: Array<Array<number>> = [[], [], []];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x < frame || y < frame || x >= width - frame || y >= height - frame) {
                const at = (y * width + x) * 4;
                edge.forEach((channel, index) => channel.push(data[at + index]));
            }
        }
    }
    const background = edge.map((channel) => channel.sort((left, right) => left - right)[channel.length >> 1]);

    const difference = new Uint8Array(width * height);
    for (let index = 0; index < difference.length; index++) {
        const at = index * 4;
        const distance = Math.abs(data[at] - background[0]) + Math.abs(data[at + 1] - background[1]) + Math.abs(data[at + 2] - background[2]);
        difference[index] = Math.min(255, Math.round(distance / 3));
    }

    return difference;
}

function largestRegion(difference: Uint8Array, width: number, height: number, threshold: number): Array<number> {
    const seen = new Uint8Array(difference.length);
    let largest: Array<number> = [];
    for (let start = 0; start < difference.length; start++) {
        if (seen[start] || difference[start] <= threshold) {
            continue;
        }
        const region: Array<number> = [];
        const stack = [start];
        seen[start] = 1;
        while (stack.length) {
            const index = stack.pop() as number;
            region.push(index);
            const x = index % width;
            const neighbours = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width];
            for (const next of neighbours) {
                if (next >= 0 && next < difference.length && !seen[next] && difference[next] > threshold) {
                    seen[next] = 1;
                    stack.push(next);
                }
            }
        }
        if (region.length > largest.length) {
            largest = region;
        }
    }

    return height ? largest : [];
}

function outerCorners(region: Array<number>, width: number): Corners {
    const points = region.map((index): Point => ({ x: index % width, y: Math.floor(index / width) }));
    const extreme = (score: (point: Point) => number): Point => points.reduce((best, point) => (score(point) > score(best) ? point : best));
    const edge = (point: Point, dx: number, dy: number): Point => ({ x: point.x + dx, y: point.y + dy });

    return [
        edge(extreme(({ x, y }) => -x - y), 0, 0),
        edge(extreme(({ x, y }) => x - y), 1, 0),
        edge(extreme(({ x, y }) => x + y), 1, 1),
        edge(extreme(({ x, y }) => y - x), 0, 1)
    ];
}

function portrait(corners: Corners): Corners {
    const [topLeft, topRight, , bottomLeft] = corners;
    const across = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
    const down = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);

    return across > down ? [corners[3], corners[0], corners[1], corners[2]] : corners;
}

function plausible(corners: Corners, regionArea: number): boolean {
    const area = Math.abs(corners.reduce((total, point, index) => {
        const next = corners[(index + 1) % corners.length];

        return total + point.x * next.y - next.x * point.y;
    }, 0)) / 2;
    const [topLeft, topRight, bottomRight, bottomLeft] = corners;
    const width = (Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y) + Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y)) / 2;
    const height = (Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y) + Math.hypot(bottomRight.x - topRight.x, bottomRight.y - topRight.y)) / 2;

    return area > 0 && regionArea / area >= MIN_FILL && width / height >= MIN_RATIO && width / height <= MAX_RATIO;
}
