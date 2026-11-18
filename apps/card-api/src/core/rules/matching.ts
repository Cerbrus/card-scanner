export interface MatchQuery {
    name?: string | null;
    number?: string | null;
    setName?: string | null;
}

export interface MatchCard {
    id: string;
    setId: string;
    localId: string;
    name: string;
    image?: string | null;
}

export interface MatchSet {
    id: string;
    name: string;
    officialCount: number;
    totalCount: number;
}

export interface Match {
    card: MatchCard;
    set?: MatchSet;
    score: number;
}

export interface PrintedNumber {
    number?: string;
    total?: number;
}

const NUMBER_SCORE = 4;
const TOTAL_SCORE = 4;
const NAME_EXACT_SCORE = 5;
const NAME_PARTIAL_SCORE = 3;
const SET_EXACT_SCORE = 3;
const SET_PARTIAL_SCORE = 2;
const PADDED_LENGTHS = [2, 3];
const SLASH_AS_DIGIT = '1';
const TOTAL_LENGTHS = [2, 3];
const MAX_NUMBER_DIGITS = 3;
const SECRET_RARE_ROOM = 1.3;

export function normalizeText(value?: string | null): string {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

export function normalizeNumber(value?: string | null): string {
    const cleaned = (value ?? '').trim().toLowerCase().replace(/\s+/g, '');

    return /^\d+$/.test(cleaned) ? String(Number(cleaned)) : cleaned.replace(/^([a-z]+)0+(?=\d)/, '$1');
}

export function parsePrintedNumber(value?: string | null): PrintedNumber {
    const [number, total] = (value ?? '').split('/').map((part) => part.trim());
    const totalDigits = (total ?? '').replace(/\D/g, '');

    return {
        number: number ? normalizeNumber(number) : undefined,
        total: totalDigits ? Number(totalDigits) : undefined
    };
}

export function numbersWithSlash(digits: string, setSizes: Set<number>): Array<string> {
    const numbers: Array<string> = [];
    for (const length of TOTAL_LENGTHS) {
        const slash = digits.length - length - 1;
        const total = Number(digits.slice(slash + 1));
        if (slash < 1 || digits[slash] !== SLASH_AS_DIGIT || !setSizes.has(total)) {
            continue;
        }

        const before = digits.slice(Math.max(0, slash - MAX_NUMBER_DIGITS), slash);
        for (let start = 0; start < before.length; start++) {
            const number = Number(before.slice(start));
            if (number > 0 && number <= total * SECRET_RARE_ROOM) {
                numbers.push(`${before.slice(start)}/${digits.slice(slash + 1)}`);
                break;
            }
        }
    }

    return numbers;
}

export function localIdForms(value?: string | null): Array<string> {
    const { number } = parsePrintedNumber(value);
    if (!number) {
        return [];
    }

    const raw = (value ?? '').split('/')[0].trim();
    const padded = /^\d+$/.test(number) ? PADDED_LENGTHS.map((length) => number.padStart(length, '0')) : [];

    return Array.from(new Set([number, raw, raw.toUpperCase(), number.toUpperCase(), ...padded].filter(Boolean)));
}

export function scoreMatch(query: MatchQuery, card: MatchCard, set?: MatchSet): number {
    const printed = parsePrintedNumber(query.number);
    const wantedName = normalizeText(query.name);
    const cardName = normalizeText(card.name);
    const wantedSet = normalizeText(query.setName);
    const setName = normalizeText(set?.name);
    let score = 0;

    if (printed.number && normalizeNumber(card.localId) === printed.number) {
        score += NUMBER_SCORE;
        if (printed.total && set && (set.officialCount === printed.total || set.totalCount === printed.total)) {
            score += TOTAL_SCORE;
        }
    }
    if (wantedName && cardName === wantedName) {
        score += NAME_EXACT_SCORE;
    } else if (wantedName && cardName && (cardName.includes(wantedName) || wantedName.includes(cardName))) {
        score += NAME_PARTIAL_SCORE;
    }
    if (wantedSet && setName === wantedSet) {
        score += SET_EXACT_SCORE;
    } else if (wantedSet && setName && (setName.includes(wantedSet) || wantedSet.includes(setName))) {
        score += SET_PARTIAL_SCORE;
    }

    return score;
}

export function rankMatches(query: MatchQuery, cards: Array<MatchCard>, sets: Map<string, MatchSet>, limit: number): Array<Match> {
    return cards
        .map((card) => ({ card, set: sets.get(card.setId), score: scoreMatch(query, card, sets.get(card.setId)) }))
        .filter((match) => match.score > 0)
        .sort((left, right) => right.score - left.score || left.card.id.localeCompare(right.card.id))
        .slice(0, limit);
}

export function setIdOf(cardId: string, localId: string): string {
    return cardId.endsWith(`-${localId}`) ? cardId.slice(0, cardId.length - localId.length - 1) : cardId.slice(0, cardId.lastIndexOf('-'));
}
