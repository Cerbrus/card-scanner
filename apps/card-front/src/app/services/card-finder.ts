import { CARD_RATIO, Corners, Point } from './perspective';

export interface Pixels {
    data: ArrayLike<number>;
    width: number;
    height: number;
}

interface Edges {
    strength: Float32Array;
    direction: Float32Array;
    width: number;
    height: number;
    threshold: number;
}

interface Line {
    angle: number;
    distance: number;
    votes: number;
}

const ANGLES = 180;
const DIRECTION_SLACK = 12;
const EDGE_SHARE = 0.18;
const FAINT_EDGE = 0.5;
const PEAK_RADIUS = 4;
const LINES_PER_SIDE = 20;
const TILT = 32;
const MIN_AREA_SHARE = 0.12;
const MIN_SIDE_SUPPORT = 0.55;
const SAMPLES = 48;
const CORNER_SKIP = 0.1;
const MIN_RATIO = CARD_RATIO * 0.7;
const MAX_RATIO = CARD_RATIO / 0.7;
const OUTSIDE_SLACK = 0.01;
const REFINE_REACH = 0.025;
const REFINE_SAMPLES = 60;
const REFINE_CORNER_SKIP = 0.12;
const REFINE_MIN_STEP = 60;
const REFINE_OUTLIER = 2.5;

export function findCard(pixels: Pixels): Corners | undefined {
    const edges = findEdges(pixels);
    const lines = strongestLines(edges);
    const across = lines.filter((line) => Math.abs(line.angle - 90) <= TILT).slice(0, LINES_PER_SIDE);
    const down = lines.filter((line) => line.angle <= TILT || line.angle >= 180 - TILT).slice(0, LINES_PER_SIDE);

    let best: { corners: Corners; score: number } | undefined;
    for (const [top, bottom] of pairs(across)) {
        for (const [left, right] of pairs(down)) {
            const corners = outline(top, bottom, left, right);
            const score = corners ? judge(corners, edges) : 0;
            if (corners && score > (best?.score ?? 0)) {
                best = { corners, score };
            }
        }
    }

    return best ? portrait(best.corners) : undefined;
}

export function refineCard(pixels: Pixels, corners: Corners): Corners {
    const reach = Math.max(4, Math.round(Math.max(pixels.width, pixels.height) * REFINE_REACH));
    const sides = corners.map((from, index) => fitSide(pixels, from, corners[(index + 1) % 4], reach));
    const refined = corners.map((corner, index) => {
        const before = sides[(index + 3) % 4];
        const after = sides[index];

        return before && after ? (meet(before, after) ?? corner) : corner;
    });

    return refined.every((point, index) => distance(point, corners[index]) <= reach * 2) ? (refined as Corners) : corners;
}

interface FittedLine {
    point: Point;
    direction: Point;
}

function fitSide(pixels: Pixels, from: Point, to: Point, reach: number): FittedLine | undefined {
    const length = distance(from, to);
    const along = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    const across = { x: -along.y, y: along.x };
    const points: Array<Point> = [];
    for (let sample = 0; sample < REFINE_SAMPLES; sample++) {
        const share = REFINE_CORNER_SKIP + ((1 - 2 * REFINE_CORNER_SKIP) * sample) / (REFINE_SAMPLES - 1);
        const base = { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
        let best = REFINE_MIN_STEP;
        let offset: number | undefined;
        for (let step = -reach; step <= reach; step++) {
            const before = colourAt(pixels, base.x + across.x * (step - 1), base.y + across.y * (step - 1));
            const after = colourAt(pixels, base.x + across.x * (step + 1), base.y + across.y * (step + 1));
            const change = before && after ? Math.abs(before[0] - after[0]) + Math.abs(before[1] - after[1]) + Math.abs(before[2] - after[2]) : 0;
            if (change > best) {
                best = change;
                offset = step;
            }
        }
        if (offset !== undefined) {
            points.push({ x: base.x + across.x * offset, y: base.y + across.y * offset });
        }
    }

    const first = fitLine(points);
    const close = first ? points.filter((point) => lineDistance(first, point) <= REFINE_OUTLIER) : [];

    return close.length >= REFINE_SAMPLES / 2 ? fitLine(close) : undefined;
}

function colourAt({ data, width, height }: Pixels, x: number, y: number): [number, number, number] | undefined {
    const column = Math.round(x);
    const row = Math.round(y);
    if (column < 0 || row < 0 || column >= width || row >= height) {
        return undefined;
    }
    const index = (row * width + column) * 4;

    return [data[index], data[index + 1], data[index + 2]];
}

function fitLine(points: Array<Point>): FittedLine | undefined {
    if (points.length < 2) {
        return undefined;
    }
    const mean = { x: points.reduce((total, point) => total + point.x, 0) / points.length, y: points.reduce((total, point) => total + point.y, 0) / points.length };
    let xx = 0;
    let xy = 0;
    let yy = 0;
    for (const point of points) {
        xx += (point.x - mean.x) ** 2;
        xy += (point.x - mean.x) * (point.y - mean.y);
        yy += (point.y - mean.y) ** 2;
    }
    const angle = Math.atan2(2 * xy, xx - yy) / 2;

    return { point: mean, direction: { x: Math.cos(angle), y: Math.sin(angle) } };
}

function lineDistance(line: FittedLine, point: Point): number {
    return Math.abs((point.x - line.point.x) * line.direction.y - (point.y - line.point.y) * line.direction.x);
}

function meet(first: FittedLine, second: FittedLine): Point | undefined {
    const determinant = first.direction.x * second.direction.y - first.direction.y * second.direction.x;
    if (Math.abs(determinant) < 1e-6) {
        return undefined;
    }
    const share = ((second.point.x - first.point.x) * second.direction.y - (second.point.y - first.point.y) * second.direction.x) / determinant;

    return { x: first.point.x + first.direction.x * share, y: first.point.y + first.direction.y * share };
}

function blur({ data, width, height }: Pixels): Float32Array {
    const blurred = new Float32Array(width * height * 3);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            for (let channel = 0; channel < 3; channel++) {
                let total = 0;
                let count = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
                            total += data[(ny * width + nx) * 4 + channel];
                            count++;
                        }
                    }
                }
                blurred[(y * width + x) * 3 + channel] = total / count;
            }
        }
    }

    return blurred;
}

function findEdges(pixels: Pixels): Edges {
    const { width, height } = pixels;
    const blurred = blur(pixels);
    const strength = new Float32Array(width * height);
    const direction = new Float32Array(width * height);
    const at = (x: number, y: number, channel: number): number => blurred[(y * width + x) * 3 + channel];
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            for (let channel = 0; channel < 3; channel++) {
                const gx = at(x + 1, y - 1, channel) + 2 * at(x + 1, y, channel) + at(x + 1, y + 1, channel) - at(x - 1, y - 1, channel) - 2 * at(x - 1, y, channel) - at(x - 1, y + 1, channel);
                const gy = at(x - 1, y + 1, channel) + 2 * at(x, y + 1, channel) + at(x + 1, y + 1, channel) - at(x - 1, y - 1, channel) - 2 * at(x, y - 1, channel) - at(x + 1, y - 1, channel);
                const magnitude = Math.hypot(gx, gy);
                if (magnitude > strength[y * width + x]) {
                    strength[y * width + x] = magnitude;
                    direction[y * width + x] = ((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180;
                }
            }
        }
    }

    const sorted = Array.from(strength).sort((left, right) => right - left);

    return { strength, direction, width, height, threshold: sorted[Math.floor(sorted.length * EDGE_SHARE)] || 1 };
}

function strongestLines({ strength, direction, width, height, threshold }: Edges): Array<Line> {
    const diagonal = Math.ceil(Math.hypot(width, height));
    const span = diagonal * 2 + 1;
    const votes = new Float32Array(ANGLES * span);
    const cosines = Array.from({ length: ANGLES }, (_, angle) => Math.cos((angle * Math.PI) / 180));
    const sines = Array.from({ length: ANGLES }, (_, angle) => Math.sin((angle * Math.PI) / 180));
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            if (strength[index] < threshold) {
                continue;
            }
            const facing = Math.round(direction[index]);
            for (let offset = -DIRECTION_SLACK; offset <= DIRECTION_SLACK; offset++) {
                const angle = (facing + offset + ANGLES) % ANGLES;
                const distance = Math.round(x * cosines[angle] + y * sines[angle]);
                votes[angle * span + distance + diagonal]++;
            }
        }
    }

    const lines: Array<Line> = [];
    for (let angle = 0; angle < ANGLES; angle++) {
        for (let distance = 0; distance < span; distance++) {
            const count = votes[angle * span + distance];
            if (count >= Math.min(width, height) * 0.25 && isPeak(votes, span, angle, distance)) {
                lines.push({ angle, distance: distance - diagonal, votes: count });
            }
        }
    }

    return lines.sort((left, right) => right.votes - left.votes);
}

function isPeak(votes: Float32Array, span: number, angle: number, distance: number): boolean {
    const count = votes[angle * span + distance];
    for (let da = -PEAK_RADIUS; da <= PEAK_RADIUS; da++) {
        const other = (angle + da + ANGLES) % ANGLES;
        for (let dd = -PEAK_RADIUS; dd <= PEAK_RADIUS; dd++) {
            const near = distance + dd;
            if ((da || dd) && near >= 0 && near < span && votes[other * span + near] > count) {
                return false;
            }
        }
    }

    return true;
}

function pairs(lines: Array<Line>): Array<[Line, Line]> {
    return lines.flatMap((first, index) => lines.slice(index + 1).map((second): [Line, Line] => [first, second]));
}

function crossing(first: Line, second: Line): Point | undefined {
    const a = (first.angle * Math.PI) / 180;
    const b = (second.angle * Math.PI) / 180;
    const determinant = Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b);
    if (Math.abs(determinant) < 1e-6) {
        return undefined;
    }

    return {
        x: (first.distance * Math.sin(b) - second.distance * Math.sin(a)) / determinant,
        y: (second.distance * Math.cos(a) - first.distance * Math.cos(b)) / determinant
    };
}

function outline(first: Line, second: Line, third: Line, fourth: Line): Corners | undefined {
    const points = [crossing(first, third), crossing(first, fourth), crossing(second, third), crossing(second, fourth)];
    if (points.some((point) => !point)) {
        return undefined;
    }
    const known = points as Array<Point>;
    const centre = { x: known.reduce((total, point) => total + point.x, 0) / 4, y: known.reduce((total, point) => total + point.y, 0) / 4 };
    const corner = (above: boolean, onLeft: boolean): Point | undefined => known.find((point) => point.y < centre.y === above && point.x < centre.x === onLeft);
    const corners = [corner(true, true), corner(true, false), corner(false, false), corner(false, true)];

    return corners.every((point) => point) ? (corners as Corners) : undefined;
}

function judge(corners: Corners, edges: Edges): number {
    const { width, height } = edges;
    const slackX = width * OUTSIDE_SLACK;
    const slackY = height * OUTSIDE_SLACK;
    if (corners.some(({ x, y }) => x < -slackX || y < -slackY || x > width + slackX || y > height + slackY)) {
        return 0;
    }

    const [topLeft, topRight, bottomRight, bottomLeft] = corners;
    const across = (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2;
    const down = (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2;
    const ratio = Math.min(across, down) / Math.max(across, down);
    const area = Math.abs(corners.reduce((total, point, index) => total + point.x * corners[(index + 1) % 4].y - corners[(index + 1) % 4].x * point.y, 0)) / 2;
    if (ratio < MIN_RATIO || ratio > MAX_RATIO || area < width * height * MIN_AREA_SHARE) {
        return 0;
    }

    const support = corners.map((point, index) => sideSupport(point, corners[(index + 1) % 4], edges));
    if (Math.min(...support) < MIN_SIDE_SUPPORT) {
        return 0;
    }

    return area * (support.reduce((total, value) => total + value, 0) / 4);
}

function sideSupport(from: Point, to: Point, { strength, width, height, threshold }: Edges): number {
    let supported = 0;
    for (let sample = 0; sample < SAMPLES; sample++) {
        const share = CORNER_SKIP + ((1 - 2 * CORNER_SKIP) * sample) / (SAMPLES - 1);
        const x = Math.round(from.x + (to.x - from.x) * share);
        const y = Math.round(from.y + (to.y - from.y) * share);
        let found = false;
        for (let dy = -2; dy <= 2 && !found; dy++) {
            for (let dx = -2; dx <= 2 && !found; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                found = nx >= 0 && ny >= 0 && nx < width && ny < height && strength[ny * width + nx] >= threshold * FAINT_EDGE;
            }
        }
        if (found) {
            supported++;
        }
    }

    return supported / SAMPLES;
}

function distance(from: Point, to: Point): number {
    return Math.hypot(to.x - from.x, to.y - from.y);
}

function portrait(corners: Corners): Corners {
    const [topLeft, topRight, , bottomLeft] = corners;

    return distance(topLeft, topRight) > distance(topLeft, bottomLeft) ? [corners[3], corners[0], corners[1], corners[2]] : corners;
}
