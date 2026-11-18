import { TestBed } from '@angular/core/testing';

import { CardTextReader } from './card-text-reader';
import { LineText } from './text-lines';
import { TextRecogniser } from './text-recogniser';

const CARD = { width: 1000, height: 1000, close: vi.fn() };

describe('CardTextReader', () => {
    let reader: CardTextReader;
    let lines: Record<string, LineText>;
    let asked: Array<string>;
    let drawn = '';
    const recogniser = {
        prepare: vi.fn(() => Promise.resolve()),
        stop: vi.fn(),
        recognise: vi.fn((): Promise<LineText> => {
            asked.push(drawn);

            return Promise.resolve(lines[drawn] ?? { text: '', confidence: 0 });
        })
    };
    const context = {
        drawImage: (_card: unknown, left: number, top: number): void => {
            drawn = `${Math.round(left)},${Math.round(top)}`;
        },
        getImageData: (): { data: Uint8ClampedArray } => ({ data: new Uint8ClampedArray(4) })
    };

    beforeEach(() => {
        lines = {};
        asked = [];
        recogniser.recognise.mockClear();
        recogniser.prepare.mockClear();
        recogniser.stop.mockClear();
        vi.stubGlobal('createImageBitmap', () => Promise.resolve(CARD));
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
        TestBed.configureTestingModule({ providers: [{ provide: TextRecogniser, useValue: recogniser }] });
        reader = TestBed.inject(CardTextReader);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('stops at the first strip that is sure of the name and the first that holds a number', async () => {
        lines = {
            '50,70': { text: 'Charizard 120 HP', confidence: 0.97 },
            '760,934': { text: '4/102', confidence: 0.9 },
            '40,805': { text: 'weaknessresistance', confidence: 0.9 }
        };

        expect(await reader.read(new Blob())).toEqual({ name: 'Charizard', number: '4/102', language: 'en' });
        expect(asked).toEqual(['50,70', '760,934', '40,805']);
        expect(CARD.close).toHaveBeenCalled();
    });

    it('reads on while unsure of the name, and takes the strip that was surest', async () => {
        lines = {
            '50,70': { text: 'Yenonat', confidence: 0.6 },
            '50,80': { text: 'Venonat', confidence: 0.9 },
            '50,90': { text: 'Venom', confidence: 0.7 }
        };

        expect((await reader.read(new Blob())).name).toBe('Venonat');
        expect(asked.slice(0, 4)).toEqual(['50,70', '50,80', '50,60', '50,90']);
    });

    it('stops once two strips agree on the name, and takes that name over a surer misreading', async () => {
        lines = {
            '50,70': { text: 'Buttertree', confidence: 0.92 },
            '50,80': { text: 'Butterfree', confidence: 0.8 },
            '50,60': { text: 'Butterfree', confidence: 0.85 }
        };

        expect((await reader.read(new Blob())).name).toBe('Butterfree');
        expect(asked.slice(0, 4)).toEqual(['50,70', '50,80', '50,60', '760,934']);
    });

    it('looks under the banner for the title of a Trainer card when the name strips hold none, and takes no unsure scribble', async () => {
        lines = {
            '50,70': { text: 'TRAINER', confidence: 0.99 },
            '50,170': { text: 'Energy Rmoval', confidence: 0.77 },
            '50,185': { text: 'Energy Removal', confidence: 0.91 },
            '50,155': { text: 'Energy Removal', confidence: 0.89 }
        };
        expect((await reader.read(new Blob())).name).toBe('Energy Removal');
        expect(asked.slice(0, 7)).toEqual(['50,70', '50,80', '50,60', '50,90', '50,170', '50,185', '50,155']);

        lines = { '50,70': { text: 'ENERGY', confidence: 0.98 }, '50,170': { text: 'Remem', confidence: 0.32 } };
        expect((await reader.read(new Blob())).name).toBeUndefined();
    });

    it('tries the next number strip, down to the left corner of newer cards', async () => {
        lines = { '760,934': { text: '1999 Wizards', confidence: 0.9 }, '20,944': { text: '025/165', confidence: 0.9 } };

        expect(await reader.read(new Blob())).toEqual({ name: undefined, number: '025/165', language: undefined });
        expect(asked.slice(7, 11)).toEqual(['760,934', '760,942', '760,926', '20,944']);
    });

    it('hands over the digits of a number whose slash was not read, and drops them when a later strip has the number', async () => {
        lines = { '760,934': { text: '37164', confidence: 0.9 } };
        expect(await reader.read(new Blob())).toEqual({ name: undefined, number: undefined, digits: '37164', language: undefined });

        lines = { '760,934': { text: '37164', confidence: 0.9 }, '760,942': { text: '37/64', confidence: 0.9 } };
        expect(await reader.read(new Blob())).toEqual({ name: undefined, number: '37/64', language: undefined });
    });

    it('loads the model ahead of the first card, and lets it go after three minutes without one', async () => {
        vi.useFakeTimers();
        reader.prepare();
        expect(recogniser.prepare).toHaveBeenCalledTimes(1);

        await reader.read(new Blob());
        vi.advanceTimersByTime(179_000);
        expect(recogniser.stop).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1_000);
        expect(recogniser.stop).toHaveBeenCalledTimes(1);
    });
});
