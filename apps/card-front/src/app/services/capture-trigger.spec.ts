import { CaptureTrigger, STEADY_MILLISECONDS, middleColour } from './capture-trigger';
import { Corners } from './perspective';

const card = (shift = 0): Corners => [
    { x: 0.2 + shift, y: 0.1 },
    { x: 0.8 + shift, y: 0.1 },
    { x: 0.8 + shift, y: 0.9 },
    { x: 0.2 + shift, y: 0.9 }
];
const yellow: [number, number, number] = [240, 210, 70];
const blue: [number, number, number] = [40, 90, 210];

describe('taking the photo by itself', () => {
    it('waits until the card has held still for a moment', () => {
        const trigger = new CaptureTrigger();

        expect(trigger.see({ corners: card(), colour: yellow, time: 0 })).toBe(false);
        expect(trigger.see({ corners: card(0.1), colour: yellow, time: 400 })).toBe(false);
        expect(trigger.see({ corners: card(0.1), colour: yellow, time: 400 + STEADY_MILLISECONDS - 1 })).toBe(false);
        expect(trigger.see({ corners: card(0.105), colour: yellow, time: 400 + STEADY_MILLISECONDS })).toBe(true);
    });

    it('starts over when the card is lost', () => {
        const trigger = new CaptureTrigger();
        trigger.see({ corners: card(), colour: yellow, time: 0 });
        trigger.see({ time: 300 });

        expect(trigger.see({ corners: card(), colour: yellow, time: STEADY_MILLISECONDS + 1 })).toBe(false);
    });

    it('does not take the same side twice, and takes the next one once the card is turned over', () => {
        const trigger = new CaptureTrigger();
        expect(trigger.ready()).toBe(true);
        trigger.taken(yellow);

        expect(trigger.see({ corners: card(), colour: yellow, time: 0 })).toBe(false);
        expect(trigger.see({ corners: card(), colour: yellow, time: 5000 })).toBe(false);
        expect(trigger.ready()).toBe(false);
        expect(trigger.see({ corners: card(), colour: blue, time: 5100 })).toBe(false);
        expect(trigger.ready()).toBe(true);
        expect(trigger.see({ corners: card(), colour: blue, time: 5100 + STEADY_MILLISECONDS })).toBe(true);
    });

    it('does not take a side again when taking by itself is switched on after it was taken by hand', () => {
        const trigger = new CaptureTrigger();
        trigger.taken(yellow);
        trigger.startOver();

        expect(trigger.see({ corners: card(), colour: yellow, time: 0 })).toBe(false);
        expect(trigger.see({ corners: card(), colour: yellow, time: STEADY_MILLISECONDS * 3 })).toBe(false);
        expect(trigger.see({ corners: card(), colour: blue, time: STEADY_MILLISECONDS * 3 + 100 })).toBe(false);
        expect(trigger.see({ corners: card(), colour: blue, time: STEADY_MILLISECONDS * 4 + 100 })).toBe(true);
    });

    it('takes the next side after the card was out of sight for a moment', () => {
        const trigger = new CaptureTrigger();
        trigger.taken(yellow);
        trigger.see({ time: 0 });
        trigger.see({ time: 100 });
        trigger.see({ corners: card(), colour: yellow, time: 200 });

        expect(trigger.see({ corners: card(), colour: yellow, time: 200 + STEADY_MILLISECONDS })).toBe(true);
    });

    it('measures the colour in the middle of the card', () => {
        const width = 10;
        const height = 10;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const inside = x >= 2 && x < 8 && y >= 2 && y < 8;
                data.set(inside ? [200, 100, 50, 255] : [0, 0, 0, 255], (y * width + x) * 4);
            }
        }
        const corners: Corners = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

        expect(middleColour({ data, width, height }, corners)).toEqual([200, 100, 50]);
    });
});
