import { CardPricing, Finish, PriceFigures, VariantPrice } from '../../data/entities/types';

export interface PrintChoice {
    variant?: Finish | null;
    firstEdition: boolean;
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

export function pickPrice(pricing: CardPricing | null | undefined, print: PrintChoice): PriceFigures | undefined {
    if (!pricing) {
        return undefined;
    }

    const sameEdition = pricing.variants.filter((variant) => variant.firstEdition === print.firstEdition);
    const sameFinish = sameEdition.filter((variant) => !print.variant || variant.type === print.variant);
    const exact = sameFinish.find((variant) => PLAIN_SUBTYPES.includes(variant.subtype)) ?? sameFinish[0];
    if (exact && (print.variant || print.firstEdition)) {
        return exact.price;
    }
    if (print.firstEdition && sameEdition.length) {
        return sameEdition[0].price;
    }
    if (print.variant === 'reverse' && pricing.reverse) {
        return pricing.reverse;
    }

    return pricing.standard ?? exact?.price ?? pricing.variants[0]?.price;
}

export function cardmarketUrl(productId: number | null | undefined, name: string): string {
    return productId ? `${CARDMARKET_PRODUCT_URL}${productId}` : `${CARDMARKET_SEARCH_URL}${encodeURIComponent(name)}`;
}

export function dayOf(date: Date): string {
    return date.toISOString().slice(0, 10);
}
