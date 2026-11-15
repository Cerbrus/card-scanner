import { Corners, Point } from './perspective';

export interface Sighting {
    corners?: Corners;
    colour?: [number, number, number];
    time: number;
}

export const STEADY_MILLISECONDS = 700;
const STEADY_SHARE = 0.03;
const MISSES_TO_REARM = 2;
const COLOUR_CHANGE = 45;

export class CaptureTrigger {
    private previous?: Corners;
    private steadySince = 0;
    private misses = 0;
    private armed = true;
    private lastColour?: [number, number, number];

    public see({ corners, colour, time }: Sighting): boolean {
        if (!corners) {
            this.previous = undefined;
            this.misses++;
            if (this.misses >= MISSES_TO_REARM) {
                this.armed = true;
            }

            return false;
        }

        this.misses = 0;
        const turned = !this.armed && colour && this.lastColour && colourDistance(colour, this.lastColour) > COLOUR_CHANGE;
        if (turned) {
            this.armed = true;
        }
        if (turned || !this.previous || moved(this.previous, corners)) {
            this.steadySince = time;
        }
        this.previous = corners;

        return this.armed && time - this.steadySince >= STEADY_MILLISECONDS;
    }

    public taken(colour?: [number, number, number]): void {
        this.armed = false;
        this.lastColour = colour;
        this.previous = undefined;
    }

    public reset(): void {
        this.armed = true;
        this.lastColour = undefined;
        this.previous = undefined;
        this.misses = 0;
    }
}

function moved(before: Corners, after: Corners): boolean {
    return before.some((point, index) => distance(point, after[index]) > STEADY_SHARE);
}

function distance(from: Point, to: Point): number {
    return Math.hypot(to.x - from.x, to.y - from.y);
}

function colourDistance(first: [number, number, number], second: [number, number, number]): number {
    return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

export function middleColour(pixels: { data: ArrayLike<number>; width: number; height: number }, corners: Corners): [number, number, number] {
    const xs = corners.map(({ x }) => x);
    const ys = corners.map(({ y }) => y);
    const centreX = xs.reduce((total, x) => total + x, 0) / 4;
    const centreY = ys.reduce((total, y) => total + y, 0) / 4;
    const halfWidth = (Math.max(...xs) - Math.min(...xs)) / 4;
    const halfHeight = (Math.max(...ys) - Math.min(...ys)) / 4;
    const total: [number, number, number] = [0, 0, 0];
    let count = 0;
    for (let y = Math.max(0, Math.round(centreY - halfHeight)); y < Math.min(pixels.height, Math.round(centreY + halfHeight)); y++) {
        for (let x = Math.max(0, Math.round(centreX - halfWidth)); x < Math.min(pixels.width, Math.round(centreX + halfWidth)); x++) {
            const at = (y * pixels.width + x) * 4;
            total[0] += pixels.data[at];
            total[1] += pixels.data[at + 1];
            total[2] += pixels.data[at + 2];
            count++;
        }
    }

    return count ? [total[0] / count, total[1] / count, total[2] / count] : total;
}
