import { CardPricing, Condition, Finish, Language, PriceFigures, VariantPrice } from '../../data/entities/types';

export interface PrintChoice {
    variant?: Finish | null;
}

export type PriceBasis = 'print' | 'foil' | 'general';
export type ValueSource = 'own' | 'trend';

export interface OwnedValue {
    value: number;
    source: ValueSource;
}

export interface CopyFilter {
    language?: Language | null;
    condition?: Condition | null;
}

export interface PricePick {
    price: PriceFigures;
    basis: PriceBasis;
}

interface SourcePrice {
    idProduct?: number | null;
    trend?: number | null;
    avg30?: number | null;
    low?: number | null;
    updated?: string | null;
    'trend-holo'?: number | null;
    'avg30-holo'?: number | null;
    'low-holo'?: number | null;
}

interface SourceVariant {
    type?: string;
    subtype?: string;
    stamp?: Array<string>;
    pricing?: { cardmarket?: SourcePrice | null } | null;
}

export interface SourceCard {
    rarity?: string;
    pricing?: { cardmarket?: SourcePrice | null } | null;
    variants_detailed?: Array<SourceVariant>;
}

const FIRST_EDITION_STAMP = '1st-edition';
const PLAIN_SUBTYPES = [undefined, 'unlimited'];
const CARDMARKET_PRODUCT_URL = 'https://www.cardmarket.com/en/Pokemon/Products?idProduct=';
const CARDMARKET_SEARCH_URL = 'https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=';

const CARDMARKET_LANGUAGES: Record<Language, number> = { en: 1, fr: 2, de: 3, nl: 12 };
const CARDMARKET_CONDITIONS: Record<Condition, number> = { mint: 1, near_mint: 2, excellent: 3, good: 4, light_played: 5, played: 6, poor: 7 };

export const GRADING_MIN_VALUE = 50;
const GRADABLE_CONDITIONS: Array<Condition> = ['mint', 'near_mint'];

const amount = (value?: number | null): number | undefined => (typeof value === 'number' && value > 0 ? value : undefined);

function figures(price: SourcePrice): PriceFigures {
    return {
        productId: price.idProduct ?? undefined,
        trend: amount(price.trend),
        avg30: amount(price.avg30),
        low: amount(price.low),
        updated: price.updated ?? undefined
    };
}

function reverseFigures(price: SourcePrice): PriceFigures | undefined {
    const reverse = {
        productId: price.idProduct ?? undefined,
        trend: amount(price['trend-holo']),
        avg30: amount(price['avg30-holo']),
        low: amount(price['low-holo']),
        updated: price.updated ?? undefined
    };

    return reverse.trend || reverse.avg30 || reverse.low ? reverse : undefined;
}

export function hasPrice(price?: PriceFigures): price is PriceFigures {
    return price !== undefined && (price.trend !== undefined || price.avg30 !== undefined || price.low !== undefined);
}

export function readPricing(card: SourceCard): CardPricing {
    const cardmarket = card.pricing?.cardmarket ?? undefined;
    const variants = (card.variants_detailed ?? [])
        .filter((variant) => variant.type && variant.pricing?.cardmarket)
        .map(
            (variant): VariantPrice => ({
                type: variant.type as string,
                subtype: variant.subtype,
                firstEdition: (variant.stamp ?? []).includes(FIRST_EDITION_STAMP),
                price: figures(variant.pricing?.cardmarket as SourcePrice)
            })
        )
        .filter((variant) => hasPrice(variant.price));

    return {
        standard: cardmarket && hasPrice(figures(cardmarket)) ? figures(cardmarket) : undefined,
        reverse: cardmarket ? reverseFigures(cardmarket) : undefined,
        variants
    };
}

export function pickPrice(pricing: CardPricing | null | undefined, print: PrintChoice): PricePick | undefined {
    if (!pricing) {
        return undefined;
    }

    const unstamped = pricing.variants.filter((variant) => !variant.firstEdition);
    const sameFinish = unstamped.filter((variant) => !print.variant || variant.type === print.variant);
    const exact = sameFinish.find((variant) => PLAIN_SUBTYPES.includes(variant.subtype)) ?? sameFinish[0];
    if (exact && print.variant) {
        return { price: exact.price, basis: 'print' };
    }
    if (print.variant === 'reverse' && pricing.reverse) {
        return { price: pricing.reverse, basis: 'foil' };
    }

    const general = pricing.standard ?? exact?.price ?? pricing.variants[0]?.price;

    return general ? { price: general, basis: 'general' } : undefined;
}

export function ownedValue(ownPrice: number | null | undefined, trend: number | null | undefined): OwnedValue | undefined {
    if (typeof ownPrice === 'number') {
        return { value: ownPrice, source: 'own' };
    }

    return typeof trend === 'number' ? { value: trend, source: 'trend' } : undefined;
}

export function worthGrading(value: number | null | undefined, condition: Condition | null | undefined): boolean {
    return typeof value === 'number' && value >= GRADING_MIN_VALUE && GRADABLE_CONDITIONS.includes(condition as Condition);
}

export function cardmarketUrl(productId: number | null | undefined, name: string, copy: CopyFilter = {}): string {
    if (!productId) {
        return `${CARDMARKET_SEARCH_URL}${encodeURIComponent(name)}`;
    }

    const language = copy.language ? CARDMARKET_LANGUAGES[copy.language] : undefined;
    const condition = copy.condition ? CARDMARKET_CONDITIONS[copy.condition] : undefined;

    return `${CARDMARKET_PRODUCT_URL}${productId}${language ? `&language=${language}` : ''}${condition ? `&minCondition=${condition}` : ''}`;
}

export function dayOf(date: Date): string {
    return date.toISOString().slice(0, 10);
}
