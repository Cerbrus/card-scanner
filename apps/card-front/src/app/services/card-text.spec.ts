import { NAME_LINES, NUMBER_LINES, bestName, nameSettled, readDigits, readLanguage, readName, readNumber } from './card-text';

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

    it('keeps the digits of a number whose slash was not read, for the server to put it back', () => {
        expect(readDigits('7164')).toBe('7164');
        expect(readDigits('1999 Wizards 37164 *')).toBe('37164');
        expect(readDigits('2O1164')).toBe('201164');
        expect(readDigits('LV. 42 #71')).toBeUndefined();
        expect(readDigits('')).toBeUndefined();
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
        expect(readName('STAGENidorina 70 HP')).toBe('Nidorina');
    });

    it('settles on a name once a strip is sure of it or two strips agree, and prefers the name read most often', () => {
        expect(nameSettled([{ name: 'Pikachu', confidence: 0.95 }])).toBe(true);
        expect(nameSettled([{ name: 'Pilkachu', confidence: 0.9 }])).toBe(false);
        expect(nameSettled([{ name: 'Pikachu', confidence: 0.6 }, { name: 'Pilkachu', confidence: 0.9 }, { name: 'Pikachu', confidence: 0.7 }])).toBe(true);
        expect(nameSettled([])).toBe(false);

        expect(bestName([{ name: 'Buttertree', confidence: 0.92 }, { name: 'Butterfree', confidence: 0.8 }, { name: 'Butterfree', confidence: 0.85 }])).toBe('Butterfree');
        expect(bestName([{ name: 'Yenonat', confidence: 0.6 }, { name: 'Venonat', confidence: 0.9 }])).toBe('Venonat');
        expect(bestName([])).toBeUndefined();
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

    it('tells the language from a line read without spaces between the words', () => {
        expect(readLanguage('zwakteresistentieterugtrekkosten')).toBe('nl');
        expect(readLanguage('weaknessresistan')).toBe('en');
    });

    it('starts with the strips that most often hold the name and the number', () => {
        expect(NAME_LINES.map((line) => line.top)).toEqual([0.07, 0.08, 0.06, 0.09]);
        expect(NUMBER_LINES.map((line) => [line.left, line.top])).toEqual([[0.76, 0.934], [0.76, 0.942], [0.76, 0.926], [0.02, 0.944]]);
    });
});
