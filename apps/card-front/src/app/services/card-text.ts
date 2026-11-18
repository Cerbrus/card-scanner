import { Language } from '../models';

export interface CardText {
    name?: string;
    number?: string;
    digits?: string;
    language?: Language;
}

export interface Region {
    left: number;
    top: number;
    width: number;
    height: number;
}

export const NAME_LINES: Array<Region> = [0.07, 0.08, 0.06, 0.09].map((top) => ({ left: 0.05, top, width: 0.61, height: 0.058 }));
const SURE_NAME = 0.93;
export const NUMBER_LINES: Array<Region> = [
    ...[0.934, 0.942, 0.926].map((top) => ({ left: 0.76, top, width: 0.167, height: 0.022 })),
    { left: 0.02, top: 0.944, width: 0.32, height: 0.048 }
];
export const LANGUAGE_REGION: Region = { left: 0.04, top: 0.805, width: 0.46, height: 0.045 };

const LANGUAGE_WORDS: Record<Language, Array<string>> = {
    en: ['weakness', 'resistance', 'retreat', 'cost'],
    nl: ['zwakheid', 'zwakte', 'resistentie', 'terugtrekkosten', 'terugtrekken', 'kosten'],
    de: ['schwäche', 'schwache', 'resistenz', 'rückzugskosten', 'ruckzugskosten', 'rückzug'],
    fr: ['faiblesse', 'résistance', 'retraite', 'coût']
};
const MIN_WORD_MATCH = 0.75;

const CARD_NUMBER = /([A-Z]{0,3})(\d+)\s*[/|]\s*([A-Z]{0,3})(\d{2,3})(?!\d)/g;
const LETTER_O_AS_ZERO = /[Oo](?=\d)|(?<=\d)[Oo]/g;
const LOOSE_DIGITS = /\d{4,10}/g;
const SECRET_RARE_ROOM = 1.3;
const MAX_NUMBER_DIGITS = 3;
const NAME_WORD = /^[A-ZÀ-Ý][A-Za-zÀ-ÿ.'’♀♂-]*$/;
const NOT_NAME = new Set(['basic', 'stage', 'pokemon', 'pokémon', 'evolves', 'from', 'put', 'hp', 'lv', 'level', 'trainer', 'energy', 'item', 'supporter', 'ex', 'gx', 'v', 'leg', 'ontwikkeld', 'uit', 'basis', 'fase']);
const MIN_NAME_LETTERS = 3;
const ALL_CAPITALS = /^[A-ZÀ-Ý]{2,}$/;
const GLUED_CAPITALS = /(^|\s)[A-ZÀ-Ý]{2,}(?=[A-ZÀ-Ý][a-zà-ÿ])/g;

export function readNumber(text: string): string | undefined {
    for (const [, prefix, digits, totalPrefix, total] of text.replace(LETTER_O_AS_ZERO, '0').matchAll(CARD_NUMBER)) {
        const number = numberBefore(digits, Number(total));
        if (number) {
            return `${prefix}${number}/${totalPrefix}${total}`;
        }
    }

    return undefined;
}

export function readDigits(text: string): string | undefined {
    return text
        .replace(LETTER_O_AS_ZERO, '0')
        .match(LOOSE_DIGITS)
        ?.at(-1);
}

export function readLanguage(text: string): Language | undefined {
    const lower = text.toLowerCase();
    const words = lower.split(/[^a-zà-ÿ]+/).filter((word) => word.length >= 4);
    const scores = (Object.keys(LANGUAGE_WORDS) as Array<Language>).map((language) => ({
        language,
        score: LANGUAGE_WORDS[language].filter((known) => lower.includes(known) || words.some((word) => likeness(word, known) >= MIN_WORD_MATCH)).length
    }));
    const [best, second] = scores.sort((left, right) => right.score - left.score);

    return best.score && best.score > (second?.score ?? 0) ? best.language : undefined;
}

function likeness(word: string, known: string): number {
    const previous = Array.from({ length: known.length + 1 }, (_, index) => index);
    for (let row = 1; row <= word.length; row++) {
        let diagonal = previous[0];
        previous[0] = row;
        for (let column = 1; column <= known.length; column++) {
            const above = previous[column];
            previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + (word[row - 1] === known[column - 1] ? 0 : 1));
            diagonal = above;
        }
    }

    return 1 - previous[known.length] / Math.max(word.length, known.length);
}

function numberBefore(digits: string, total: number): string | undefined {
    for (let length = Math.min(MAX_NUMBER_DIGITS, digits.length); length > 0; length--) {
        const number = digits.slice(-length);
        if (Number(number) > 0 && Number(number) <= total * SECRET_RARE_ROOM) {
            return number;
        }
    }

    return undefined;
}

export interface NameReading {
    name: string;
    confidence: number;
}

export function nameSettled(readings: Array<NameReading>): boolean {
    const last = readings.at(-1);

    return last !== undefined && (last.confidence >= SURE_NAME || timesRead(readings, last.name) > 1);
}

export function bestName(readings: Array<NameReading>): string | undefined {
    return [...readings].sort((left, right) => timesRead(readings, right.name) - timesRead(readings, left.name) || right.confidence - left.confidence)[0]?.name;
}

function timesRead(readings: Array<NameReading>, name: string): number {
    return readings.filter((reading) => reading.name === name).length;
}

export function readName(text: string): string | undefined {
    const lines = text
        .replace(GLUED_CAPITALS, '$1')
        .split('\n')
        .map((line) => nameIn(line))
        .filter((name): name is string => name !== undefined);

    return lines.sort((left, right) => letters(right) - letters(left))[0];
}

function nameIn(line: string): string | undefined {
    const groups: Array<Array<string>> = [[]];
    for (const raw of line.split(/\s+/)) {
        const word = raw.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ.'’♀♂]+$/g, '');
        if (word && NAME_WORD.test(word) && !NOT_NAME.has(word.toLowerCase()) && !ALL_CAPITALS.test(word)) {
            groups[groups.length - 1].push(word);
        } else if (groups[groups.length - 1].length) {
            groups.push([]);
        }
    }

    const best = groups
        .map((group) => trimShort(group).join(' '))
        .sort((left, right) => letters(right) - letters(left))[0];

    return best && letters(best) >= MIN_NAME_LETTERS ? best : undefined;
}

function trimShort(words: Array<string>): Array<string> {
    const short = (word?: string): boolean => word !== undefined && letters(word) < MIN_NAME_LETTERS && !word.endsWith('.');
    const kept = [...words];
    while (kept.length > 1 && short(kept[0])) {
        kept.shift();
    }
    while (kept.length > 1 && short(kept.at(-1))) {
        kept.pop();
    }

    return kept;
}

function letters(text: string): number {
    return text.replace(/[^A-Za-zÀ-ÿ]/g, '').length;
}
