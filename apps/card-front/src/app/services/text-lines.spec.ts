import { characterList, decodeLine, lineInput } from './text-lines';

describe('turning the output of the text model into a line', () => {
    const characters = characterList('a\r\nb\r\n/\r\n');

    it('puts the blank first and the space last around the characters of the model', () => {
        expect(characters).toEqual(['', 'a', 'b', '/', ' ']);
        expect(characterList('a\nb')).toEqual(['', 'a', 'b', ' ']);
    });

    it('drops blanks and repeats, and keeps a letter that returns after a blank', () => {
        const step = (best: number, score: number): Array<number> => characters.map((_, index) => (index === best ? score : 0.01));
        const scores = [step(1, 0.9), step(1, 0.8), step(0, 0.99), step(1, 0.7), step(4, 0.6), step(2, 1), step(0, 0.99)].flat();

        const line = decodeLine(scores, 7, characters.length, characters);

        expect(line.text).toBe('aa b');
        expect(line.confidence).toBeCloseTo((0.9 + 0.7 + 0.6 + 1) / 4);
    });

    it('reads nothing with no confidence from blanks alone', () => {
        expect(decodeLine([0.9, 0.1, 0, 0, 0, 0.8, 0.2, 0, 0, 0], 2, 5, characters)).toEqual({ text: '', confidence: 0 });
    });

    it('hands the pixels to the model as blue, green and red planes between -1 and 1', () => {
        const input = lineInput({ data: new Uint8ClampedArray([255, 0, 127.5, 255, 0, 255, 0, 255]), width: 2, height: 1 });

        expect(Array.from(input, (value) => Math.round(value * 100) / 100)).toEqual([0, -1, -1, 1, 1, -1]);
    });
});
