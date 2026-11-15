export interface CardText {
    name?: string;
    number?: string;
}

export interface TextWord {
    text: string;
    left: number;
    height: number;
    confidence: number;
}

export interface Region {
    left: number;
    top: number;
    width: number;
    height: number;
}

export const NAME_REGION: Region = { left: 0.05, top: 0.062, width: 0.62, height: 0.058 };
export const NUMBER_CORNERS: Array<Region> = [
    { left: 0.82, top: 0.946, width: 0.17, height: 0.04 },
    { left: 0.02, top: 0.944, width: 0.32, height: 0.048 }
];
export const NUMBER_REGION: Region = { left: 0.03, top: 0.885, width: 0.94, height: 0.1 };

const CARD_NUMBER = /([A-Z]{0,3})(\d+)\s*[/|]\s*([A-Z]{0,3})(\d{2,3})(?!\d)/g;
const SECRET_RARE_ROOM = 1.3;
const MAX_NUMBER_DIGITS = 3;
const NAME_WORD = /^[A-ZÀ-Ý][A-Za-zÀ-ÿ.'’♀♂-]*$/;
const NOT_NAME = new Set(['basic', 'stage', 'pokemon', 'pokémon', 'evolves', 'from', 'put', 'hp', 'lv', 'level', 'trainer', 'energy', 'item', 'supporter', 'ex', 'gx', 'v']);
const MIN_NAME_LETTERS = 3;
const NAME_SIZE_SHARE = 0.7;
const MIN_WORD_CONFIDENCE = 50;
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

export function nameFromWords(words: Array<TextWord>): string | undefined {
    const usable = words
        .map((word) => ({ ...word, text: word.text.replace(/^[^A-Za-zÀ-ÿ]+|[^A-Za-zÀ-ÿ.'’♀♂]+$/g, '') }))
        .filter((word) => word.confidence >= MIN_WORD_CONFIDENCE && NAME_WORD.test(word.text) && !NOT_NAME.has(word.text.toLowerCase()) && !ALL_CAPITALS.test(word.text));
    const tallest = Math.max(0, ...usable.map((word) => word.height));
    const name = usable
        .filter((word) => word.height >= tallest * NAME_SIZE_SHARE)
        .sort((left, right) => left.left - right.left)
        .map((word) => word.text)
        .join(' ');

    return readName(name);
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
