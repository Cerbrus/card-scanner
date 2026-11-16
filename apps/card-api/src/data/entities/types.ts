export const CARD_STATUSES = ['new', 'identified', 'confirmed'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const READING_STATES = ['none', 'pending', 'done', 'failed'] as const;
export type ReadingState = (typeof READING_STATES)[number];

export const FINISHES = ['normal', 'holo', 'reverse'] as const;
export type Finish = (typeof FINISHES)[number];

export const CONDITIONS = ['mint', 'near_mint', 'excellent', 'good', 'light_played', 'played', 'poor'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const LANGUAGES = ['en', 'nl', 'de', 'fr'] as const;
export type Language = (typeof LANGUAGES)[number];

export const CONFIDENCES = ['low', 'medium', 'high'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export type ConditionSource = 'model' | 'user';
export type PhotoSide = 'front' | 'back';

export interface CardReading {
    isPokemonCard: boolean;
    name: string | null;
    number: string | null;
    setName: string | null;
    language: Language | null;
    finish: Finish | null;
    confidence: Confidence;
    condition: Condition | null;
    conditionNotes: string;
}

export interface Candidate {
    catalogCardId: string;
    name: string;
    localId: string;
    setId: string;
    setName: string;
    image?: string;
    score: number;
}

export interface PriceFigures {
    productId?: number;
    trend?: number;
    avg30?: number;
    low?: number;
    updated?: string;
}

export interface VariantPrice {
    type: string;
    subtype?: string;
    firstEdition: boolean;
    price: PriceFigures;
}

export interface CardPricing {
    standard?: PriceFigures;
    reverse?: PriceFigures;
    variants: Array<VariantPrice>;
}
