export const FINISHES = ['normal', 'holo', 'reverse'] as const;
export type Finish = (typeof FINISHES)[number];

export const CONDITIONS = ['mint', 'near_mint', 'excellent', 'good', 'light_played', 'played', 'poor'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const LANGUAGES = ['en', 'nl', 'de', 'fr', 'it', 'es', 'pt', 'ja', 'ko', 'zh', 'other'] as const;
export type Language = (typeof LANGUAGES)[number];

export type CardStatus = 'new' | 'identified' | 'confirmed';
export type ReadingState = 'none' | 'pending' | 'done' | 'failed';
export type PhotoSide = 'front' | 'back';

export interface Health {
    status: 'ok';
    version: string;
    commit?: string;
    builtAt?: string;
}

export interface AuthState {
    enabled: boolean;
    authenticated: boolean;
    owner: boolean;
    email?: string;
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

export interface CardReading {
    isPokemonCard: boolean;
    name: string | null;
    number: string | null;
    setName: string | null;
    confidence: 'low' | 'medium' | 'high';
}

export interface CardSummary {
    id: number;
    status: CardStatus;
    readingState: ReadingState;
    catalogCardId?: string;
    name?: string;
    setName?: string;
    number?: string;
    rarity?: string;
    image?: string;
    language?: Language;
    variant?: Finish;
    firstEdition: boolean;
    condition?: Condition;
    conditionSource?: 'model' | 'user';
    priceTrend?: number;
    priceAvg30?: number;
    priceLow?: number;
    estimatedValue?: number;
    valueFactor: number;
    priceCheckedAt?: string;
    createdAt: string;
    photos: Partial<Record<PhotoSide, number>>;
}

export interface PricePoint {
    day: string;
    trend?: number | null;
    avg30?: number | null;
    low?: number | null;
}

export interface CardDetail extends CardSummary {
    readingError?: string;
    reading?: CardReading;
    candidates: Array<Candidate>;
    conditionNotes?: string;
    notes: string;
    cardmarketUrl?: string;
    priceHistory: Array<PricePoint>;
}

export interface CardChanges {
    language?: Language | null;
    variant?: Finish | null;
    firstEdition?: boolean;
    condition?: Condition | null;
    notes?: string;
}

export interface CatalogState {
    sets: number;
    cards: number;
    refreshedAt?: string;
    refreshing: boolean;
    error?: string;
}

export interface SyncState {
    configured: boolean;
    connected: boolean;
    connectedAt?: string;
    running: boolean;
    lastRunAt?: string;
    lastError?: string;
    waitingPhotos: number;
    folder: string;
    sheetUrl?: string;
}

export interface SystemState {
    version: string;
    login: boolean;
    vision: { enabled: boolean; model: string };
    catalog: CatalogState;
    sync: SyncState;
}
