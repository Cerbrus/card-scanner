import { Pixels, findCard, refineCard } from './card-finder';
import { Corners, Point } from './perspective';

type Colour = [number, number, number];

const DARK_TABLE: Colour = [32, 30, 34];
const YELLOW_BORDER: Colour = [236, 200, 40];
const BLUE_BACK: Colour = [40, 80, 190];

function inside(point: Point, polygon: Corners): boolean {
    let crossings = 0;
    polygon.forEach((corner, index) => {
        const next = polygon[(index + 1) % polygon.length];
        if (corner.y > point.y !== next.y > point.y && point.x < ((next.x - corner.x) * (point.y - corner.y)) / (next.y - corner.y) + corner.x) {
            crossings++;
        }
    });

    return crossings % 2 === 1;
}

function photo(width: number, height: number, card: Corners | undefined, colour: Colour, artwork?: Corners): Pixels {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const point = { x: x + 0.5, y: y + 0.5 };
            const shade = artwork && inside(point, artwork) ? DARK_TABLE : card && inside(point, card) ? colour : DARK_TABLE;
            data.set([...shade, 255], (y * width + x) * 4);
        }
    }

    return { data, width, height };
}

function turned(centre: Point, width: number, height: number, degrees: number): Corners {
    const angle = (degrees * Math.PI) / 180;
    const corner = (dx: number, dy: number): Point => ({
        x: centre.x + dx * Math.cos(angle) - dy * Math.sin(angle),
        y: centre.y + dx * Math.sin(angle) + dy * Math.cos(angle)
    });

    return [corner(-width / 2, -height / 2), corner(width / 2, -height / 2), corner(width / 2, height / 2), corner(-width / 2, height / 2)];
}

const distance = (left: Point, right: Point): number => Math.hypot(left.x - right.x, left.y - right.y);

describe('finding the card in a photo', () => {
    const card = turned({ x: 160, y: 210 }, 180, 252, 8);

    it('puts the corners on a yellow card that lies a little turned on a dark table', () => {
        const found = findCard(photo(320, 427, card, YELLOW_BORDER)) as Corners;

        found.forEach((corner, index) => expect(distance(corner, card[index])).toBeLessThan(4));
    });

    it('finds the blue back just as well, also with dark artwork inside the border', () => {
        const artwork = turned({ x: 160, y: 190 }, 140, 110, 8);
        const found = findCard(photo(320, 427, card, BLUE_BACK, artwork)) as Corners;

        found.forEach((corner, index) => expect(distance(corner, card[index])).toBeLessThan(4));
    });

    it('puts the corners where the edges meet, outside the rounded corners, and ignores a light swirl on the back', () => {
        const width = 300;
        const height = 400;
        const card = { left: 60, top: 60, right: 240, bottom: 312, radius: 14 };
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const cornerX = Math.min(Math.max(x, card.left + card.radius), card.right - card.radius);
                const cornerY = Math.min(Math.max(y, card.top + card.radius), card.bottom - card.radius);
                const onCard = x >= card.left && x < card.right && y >= card.top && y < card.bottom && Math.hypot(x - cornerX, y - cornerY) <= card.radius;
                const swirl = onCard && Math.abs(Math.hypot(x - 150, y - 186) - 55 - (x - 150) * 0.3) < 4;
                data.set([...(swirl ? ([235, 235, 245] as Colour) : onCard ? BLUE_BACK : DARK_TABLE), 255], (y * width + x) * 4);
            }
        }
        const sharp: Corners = [
            { x: card.left, y: card.top },
            { x: card.right, y: card.top },
            { x: card.right, y: card.bottom },
            { x: card.left, y: card.bottom }
        ];

        const found = findCard({ data, width, height }) as Corners;

        found.forEach((corner, index) => expect(distance(corner, sharp[index])).toBeLessThan(3));
    });

        it('turns a card lying on its side so the result stays upright in shape', () => {
        const sideways = turned({ x: 213, y: 160 }, 252, 180, 3);
        const [topLeft, topRight, , bottomLeft] = findCard(photo(427, 320, sideways, YELLOW_BORDER)) as Corners;

        expect(distance(topLeft, topRight)).toBeLessThan(distance(topLeft, bottomLeft));
    });

    it('finds nothing in a photo without a card, or with a card too small to be the subject', () => {
        expect(findCard(photo(320, 427, undefined, YELLOW_BORDER))).toBeUndefined();
        expect(findCard(photo(320, 427, turned({ x: 160, y: 210 }, 30, 42, 0), YELLOW_BORDER))).toBeUndefined();
    });

    it('fits the edges closely to the card when the first corners are a few pixels off', () => {
        const exact = turned({ x: 300, y: 400 }, 430, 600, 4);
        const pixels = photo(600, 800, exact, YELLOW_BORDER);
        const rough = exact.map(({ x, y }, index) => ({ x: x + [6, -5, 4, -6][index], y: y + [-5, 6, 5, -4][index] })) as Corners;

        const refined = refineCard(pixels, rough);

        refined.forEach((corner, index) => expect(distance(corner, exact[index])).toBeLessThan(2));
    });

    it('keeps the first corners when no edge is near them', () => {
        const pixels = photo(600, 800, undefined, YELLOW_BORDER);
        const rough = turned({ x: 300, y: 400 }, 430, 600, 4);

        expect(refineCard(pixels, rough)).toEqual(rough);
    });
});
