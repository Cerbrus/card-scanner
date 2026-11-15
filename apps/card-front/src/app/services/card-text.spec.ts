import { TextWord, bestNumber, nameFromWords, readName, readNumber } from './card-text';

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
        const word = (text: string, left: number, height: number, confidence = 90): TextWord => ({ text, left, height, confidence });

        expect(nameFromWords([word('Evolves', 200, 20), word('STAGE', 10, 22), word('2', 70, 22), word('Dragonite', 260, 60), word('100', 600, 58), word('HP', 680, 50)])).toBe('Dragonite');
        expect(nameFromWords([word('Mime', 140, 50), word('Mr.', 60, 48)])).toBe('Mr. Mime');
        expect(nameFromWords([word('Fal', 20, 62, 30), word('Dragonite', 260, 60)])).toBe('Dragonite');
        expect(nameFromWords([word('ENGI', 40, 60)])).toBeUndefined();
        expect(nameFromWords([])).toBeUndefined();
    });

    it('prefers a number that two readings agree on, otherwise the first one found', () => {
        expect(bestNumber(['4/64', undefined, '54/64', '54/64'])).toBe('54/64');
        expect(bestNumber([undefined, '12/102'])).toBe('12/102');
        expect(bestNumber([undefined, undefined])).toBeUndefined();
    });
});
