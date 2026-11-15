import { writeFileSync } from 'node:fs';

const WIDTH = 480;
const HEIGHT = 360;
const FRAMES_PER_SECOND = 10;
const BACKGROUND: Colour = [32, 32, 32];
const FRONT: Colour = [242, 209, 75];
const BACK: Colour = [47, 95, 208];
const CARD = { left: 140, top: 30, width: 215, height: 300 };

type Colour = [number, number, number];

const luma = ([red, green, blue]: Colour): number => Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
const blueDifference = ([red, green, blue]: Colour): number => Math.round(-0.169 * red - 0.331 * green + 0.5 * blue + 128);
const redDifference = ([red, green, blue]: Colour): number => Math.round(0.5 * red - 0.419 * green - 0.081 * blue + 128);

function frame(card?: Colour): Buffer {
    const colourAt = (x: number, y: number): Colour =>
        card && x >= CARD.left && x < CARD.left + CARD.width && y >= CARD.top && y < CARD.top + CARD.height ? card : BACKGROUND;
    const lumaPlane = Buffer.alloc(WIDTH * HEIGHT);
    const blueDifferencePlane = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2));
    const redDifferencePlane = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2));
    for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
            lumaPlane[y * WIDTH + x] = luma(colourAt(x, y));
        }
    }
    for (let y = 0; y < HEIGHT / 2; y++) {
        for (let x = 0; x < WIDTH / 2; x++) {
            const colour = colourAt(x * 2, y * 2);
            blueDifferencePlane[y * (WIDTH / 2) + x] = blueDifference(colour);
            redDifferencePlane[y * (WIDTH / 2) + x] = redDifference(colour);
        }
    }

    return Buffer.concat([Buffer.from('FRAME\n'), lumaPlane, blueDifferencePlane, redDifferencePlane]);
}

export function writeFakeCamera(path: string): void {
    const front = frame(FRONT);
    const empty = frame();
    const back = frame(BACK);
    const scenes: Array<[Buffer, number]> = [
        [front, 3],
        [empty, 1],
        [back, 3],
        [empty, 1]
    ];
    const frames = scenes.flatMap(([picture, seconds]) => Array.from({ length: seconds * FRAMES_PER_SECOND }, () => picture));

    writeFileSync(path, Buffer.concat([Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F${FRAMES_PER_SECOND}:1 Ip A1:1 C420jpeg\n`), ...frames]));
}
