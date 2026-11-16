import { TextWord, bestNumber, localThreshold, nameFromWords, readLanguage, readName, readNumber } from './card-text';

describe('reading name and number from the text on a card', () => {
    it('finds the card number, also when the copyright year runs into it', () => {
        expect(readNumber('Illus. Ken Sugimori © 1995 Nintendo. © 1999 Wizards. 12/102 *')).toBe('12/102');
        expect(readNumber('19997/64')).toBe('7/64');
        expect(readNumber('199958/102\n')).toBe('58/102');
        expect(readNumber('4 / 102')).toBe('4/102');
        expect(readNumber('TG05/TG30')).toBe('TG05/TG30');
        expect(readNumber('2O/1O2')).toBe('20/102');
    });

    it('finds no number where there is none, or where it cannot fit the total', () => {
        expect(readNumber('LV. 42 #71')).toBeUndefined();
        expect(readNumber('©1995, 96, 98')).toBeUndefined();
        expect(readNumber('900/64')).toBeUndefined();
        expect(readNumber('')).toBeUndefined();
    });

    it('takes the Pokémon name and leaves out the stage, the hit points and stray letters', () => {
        expect(readName('STAGE 2 Victreebel 80 HP')).toBe('Victreebel');
        expect(readName('Na Jolteon')).toBe('Jolteon');
        expect(readName('Mr. Mime 40 HP')).toBe('Mr. Mime');
        expect(readName('Basic Pokémon Pikachu 40 HP')).toBe('Pikachu');
        expect(readName('Dark Charizard 60 HP')).toBe('Dark Charizard');
        expect(readName('80 HP\n')).toBeUndefined();
        expect(readName('ENGI')).toBeUndefined();
        expect(readName('')).toBeUndefined();
    });

    it('takes the name from the tallest sure words on the name line, leaving out the small print around it', () => {
        const word = (text: string, left: number, height: number, confidence = 90, top = 100 - height / 2): TextWord => ({ text, left, right: left + text.length * height * 0.5, top, height, confidence });

        expect(nameFromWords([word('Evolves', 200, 20, 90, 40), word('STAGE', 10, 22, 90, 40), word('2', 70, 22), word('Dragonite', 260, 60), word('100', 600, 58), word('HP', 680, 50)])?.name).toBe('Dragonite');
        expect(nameFromWords([word('Mime', 140, 50), word('Mr.', 60, 48)])?.name).toBe('Mr. Mime');
        expect(nameFromWords([word('Fal', 20, 62, 30), word('Dragonite', 260, 60)])?.name).toBe('Dragonite');
        expect(nameFromWords([word('ENGI', 40, 60)])).toBeUndefined();
        expect(nameFromWords([])).toBeUndefined();
        expect(nameFromWords([word('Yeh', 40, 58, 20), word('Marowak', 200, 60, 92)])).toEqual({ name: 'Marowak', confidence: 92 });
    });

    it('takes the name from the row of the tallest word, not from the evolves-from line above it, and joins a split name', () => {
        const word = (text: string, left: number, right: number, top: number, height: number): TextWord => ({ text, left, right, top, height, confidence: 90 });

        expect(nameFromWords([word('Evolves', 200, 300, 20, 40), word('Mankey', 330, 420, 22, 44), word('Primeape', 330, 520, 70, 60)])?.name).toBe('Primeape');
        expect(nameFromWords([word('Ontwikkeld', 200, 340, 18, 46), word('Vilepl', 330, 470, 70, 62), word('ume', 472, 540, 82, 40)])?.name).toBe('Vileplume');
    });

    it('tells the language from the weakness line, also with a misread letter', () => {
        expect(readLanguage('weakness resistance retreat cost')).toBe('en');
        expect(readLanguage('wcakness   resistanee\n retreat cost')).toBe('en');
        expect(readLanguage('zwakheid resistentie terugtrekkosten')).toBe('nl');
        expect(readLanguage('Schwache Resistenz Ruckzugskosten')).toBe('de');
        expect(readLanguage('faiblesse résistance coût de retraite')).toBe('fr');
        expect(readLanguage('-30')).toBeUndefined();
        expect(readLanguage('')).toBeUndefined();
    });

    it('prefers a number that two readings agree on, otherwise the first one found', () => {
        expect(bestNumber(['4/64', undefined, '54/64', '54/64'])).toBe('54/64');
        expect(bestNumber([undefined, '12/102'])).toBe('12/102');
        expect(bestNumber([undefined, undefined])).toBeUndefined();
    });

    it('turns text black against its own surroundings, also where the background changes colour', () => {
        const width = 40;
        const height = 10;
        const data = new Uint8ClampedArray(width * height * 4);
        const shade = (x: number, y: number): number => {
            const background = x < 20 ? 90 : 220;
            const text = y >= 4 && y < 6 && x % 10 >= 4 && x % 10 < 6;

            return text ? background - 60 : background;
        };
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                data.fill(shade(x, y), (y * width + x) * 4, (y * width + x) * 4 + 3);
                data[(y * width + x) * 4 + 3] = 255;
            }
        }

        localThreshold({ data, width, height }, 3, 0.15);

        const black = (x: number, y: number): boolean => data[(y * width + x) * 4] === 0;
        expect([black(5, 4), black(15, 5), black(25, 4), black(35, 5)]).toEqual([true, true, true, true]);
        expect([black(1, 1), black(12, 8), black(22, 1), black(38, 8)]).toEqual([false, false, false, false]);
    });
});
