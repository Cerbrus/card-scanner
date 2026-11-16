import { Language } from '../models';

export interface CardText {
    name?: string;
    number?: string;
    language?: Language;
}

export interface TextWord {
    text: string;
    left: number;
    height: number;
    right: number;
    top: number;
    confidence: number;
}

export interface Region {
    left: number;
    top: number;
    width: number;
    height: number;
}

export const NAME_LINES: Array<Region> = [0.06, 0.07, 0.08, 0.09].map((top) => ({ left: 0.05, top, width: 0.61, height: 0.058 }));
export const NUMBER_CORNERS: Array<Region> = [
    { left: 0.76, top: 0.926, width: 0.167, height: 0.038 },
    { left: 0.76, top: 0.936, width: 0.167, height: 0.038 },
    { left: 0.02, top: 0.944, width: 0.32, height: 0.048 }
];
export const NUMBER_REGION: Region = { left: 0.03, top: 0.885, width: 0.94, height: 0.1 };
export const LANGUAGE_REGION: Region = { left: 0.04, top: 0.805, width: 0.92, height: 0.045 };

const LANGUAGE_WORDS: Record<Language, Array<string>> = {
    en: ['weakness', 'resistance', 'retreat', 'cost'],
    nl: ['zwakheid', 'zwakte', 'resistentie', 'terugtrekkosten', 'terugtrekken', 'kosten'],
    de: ['schwäche', 'schwache', 'resistenz', 'rückzugskosten', 'ruckzugskosten', 'rückzug'],
    fr: ['faiblesse', 'résistance', 'retraite', 'coût']
};
const MIN_WORD_MATCH = 0.75;
const MIN_TEXT_CONTRAST = 55;

const CARD_NUMBER = /([A-Z]{0,3})(\d+)\s*[/|]\s*([A-Z]{0,3})(\d{2,3})(?!\d)/g;
const SECRET_RARE_ROOM = 1.3;
const MAX_NUMBER_DIGITS = 3;
const NAME_WORD = /^[A-ZÀ-Ý][A-Za-zÀ-ÿ.'’♀♂-]*$/;
const NOT_NAME = new Set(['basic', 'stage', 'pokemon', 'pokémon', 'evolves', 'from', 'put', 'hp', 'lv', 'level', 'trainer', 'energy', 'item', 'supporter', 'ex', 'gx', 'v', 'leg', 'ontwikkeld', 'uit', 'basis', 'fase']);
const MIN_NAME_LETTERS = 3;
const NAME_SIZE_SHARE = 0.7;
const MIN_WORD_CONFIDENCE = 50;
const FRAGMENT_SIZE_SHARE = 0.5;
const JOIN_GAP_SHARE = 0.15;
const ALL_CAPITALS = /^[A-ZÀ-Ý]{2,}$/;

export function readNumber(text: string): string | undefined {
    for (const [, prefix, digits, totalPrefix, total] of text.replace(/[Oo](?=\d)|(?<=\d)[Oo]/g, '0').matchAll(CARD_NUMBER)) {
        const number = numberBefore(digits, Number(total));
        if (number) {
            return `${prefix}${number}/${totalPrefix}${total}`;
        }
    }

    return undefined;
}

export function localThreshold(image: { data: Uint8ClampedArray; width: number; height: number }, radius: number, darker: number): void {
    const { data, width, height } = image;
    const sums = new Float64Array((width + 1) * (height + 1));
    for (let y = 0; y < height; y++) {
        let row = 0;
        for (let x = 0; x < width; x++) {
            row += data[(y * width + x) * 4];
            sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + row;
        }
    }
    for (let y = 0; y < height; y++) {
        const top = Math.max(0, y - radius);
        const bottom = Math.min(height, y + radius + 1);
        for (let x = 0; x < width; x++) {
            const left = Math.max(0, x - radius);
            const right = Math.min(width, x + radius + 1);
            const total = sums[bottom * (width + 1) + right] - sums[top * (width + 1) + right] - sums[bottom * (width + 1) + left] + sums[top * (width + 1) + left];
            const mean = total / ((bottom - top) * (right - left));
            const index = (y * width + x) * 4;
            const shade = data[index] < mean * (1 - darker) && mean - data[index] > MIN_TEXT_CONTRAST ? 0 : 255;
            data[index] = data[index + 1] = data[index + 2] = shade;
        }
    }
}

export function readLanguage(text: string): Language | undefined {
    const words = text
        .toLowerCase()
        .split(/[^a-zà-ÿ]+/)
        .filter((word) => word.length >= 4);
    const scores = (Object.keys(LANGUAGE_WORDS) as Array<Language>).map((language) => ({
        language,
        score: LANGUAGE_WORDS[language].filter((known) => words.some((word) => likeness(word, known) >= MIN_WORD_MATCH)).length
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

export function bestNumber(readings: Array<string | undefined>): string | undefined {
    const found = readings.filter((reading): reading is string => reading !== undefined);

    return found.find((reading, index) => found.indexOf(reading) !== index) ?? found[0];
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

export function readName(text: string): string | undefined {
    const lines = text
        .split('\n')
        .map((line) => nameIn(line))
        .filter((name): name is string => name !== undefined);

    return lines.sort((left, right) => letters(right) - letters(left))[0];
}

export interface NameReading {
    name: string;
    confidence: number;
}

export function nameFromWords(words: Array<TextWord>): NameReading | undefined {
    const cleaned = words.map((word) => ({ ...word, text: word.text.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ.'’♀♂]+$/g, '') })).filter((word) => letters(word.text));
    const anchor = cleaned
        .filter((word) => word.confidence >= MIN_WORD_CONFIDENCE && isNameWord(word.text))
        .sort((left, right) => right.height - left.height)[0];
    if (!anchor) {
        return undefined;
    }

    const row = cleaned
        .filter((word) => word.height >= anchor.height * FRAGMENT_SIZE_SHARE && Math.abs(middle(word) - middle(anchor)) <= anchor.height / 2)
        .sort((left, right) => left.left - right.left);
    const joined: Array<TextWord> = [];
    for (const word of row) {
        const previous = joined.at(-1);
        const gap = previous ? word.left - previous.right : Infinity;
        if (previous && gap < -anchor.height * JOIN_GAP_SHARE) {
            joined[joined.length - 1] = word.confidence > previous.confidence ? word : previous;
        } else if (previous && gap <= anchor.height * JOIN_GAP_SHARE && /^[a-zà-ÿ]/.test(word.text)) {
            joined[joined.length - 1] = { ...previous, text: previous.text + word.text, right: word.right, height: Math.max(previous.height, word.height), confidence: Math.min(previous.confidence, word.confidence) };
        } else {
            joined.push(word);
        }
    }
    const kept = joined.filter((word) => word.height >= anchor.height * NAME_SIZE_SHARE && word.confidence >= MIN_WORD_CONFIDENCE && isNameWord(word.text));
    const name = readName(kept.map((word) => word.text).join(' '));

    return name ? { name, confidence: kept.reduce((total, word) => total + word.confidence, 0) / kept.length } : undefined;
}

function isNameWord(text: string): boolean {
    return NAME_WORD.test(text) && !NOT_NAME.has(text.toLowerCase()) && !ALL_CAPITALS.test(text);
}

function middle(word: TextWord): number {
    return word.top + word.height / 2;
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
