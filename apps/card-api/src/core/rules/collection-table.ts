export interface CollectionRow {
    id: number;
    name: string;
    setName: string;
    number: string;
    rarity: string;
    language: string;
    variant: string;
    firstEdition: boolean;
    condition: string;
    conditionSource: string;
    priceTrend?: number | null;
    priceAvg30?: number | null;
    priceLow?: number | null;
    value?: number | null;
    valueSource: string;
    priceCheckedAt?: Date | null;
    status: string;
    notes: string;
    createdAt: Date;
    frontPhoto: string;
    backPhoto: string;
    cardmarket: string;
    worthGrading: boolean;
}

export type Cell = string | number;

export const COLLECTION_HEADER: Array<string> = [
    'Id',
    'Name',
    'Set',
    'Number',
    'Rarity',
    'Language',
    'Variant',
    '1st edition',
    'Condition',
    'Condition by',
    'Trend (EUR)',
    '30-day average (EUR)',
    'Low (EUR)',
    'Value (EUR)',
    'Value from',
    'Price date',
    'Status',
    'Notes',
    'Added',
    'Front photo',
    'Back photo',
    'Cardmarket',
    'Worth grading'
];

const NEEDS_QUOTES = /[",\r\n]/;
const FORMULA_START = /^[=+\-@\t\r]/;

const day = (date?: Date | null): string => (date ? date.toISOString().slice(0, 10) : '');
const money = (value?: number | null): Cell => (typeof value === 'number' ? Math.round(value * 100) / 100 : '');

export function collectionCells(row: CollectionRow): Array<Cell> {
    return [
        row.id,
        row.name,
        row.setName,
        row.number,
        row.rarity,
        row.language,
        row.variant,
        row.firstEdition ? 'yes' : 'no',
        row.condition,
        row.conditionSource,
        money(row.priceTrend),
        money(row.priceAvg30),
        money(row.priceLow),
        money(row.value),
        row.valueSource,
        day(row.priceCheckedAt),
        row.status,
        row.notes,
        day(row.createdAt),
        row.frontPhoto,
        row.backPhoto,
        row.cardmarket,
        row.worthGrading ? 'yes' : 'no'
    ];
}

export function collectionTable(rows: Array<CollectionRow>): Array<Array<Cell>> {
    return [COLLECTION_HEADER, ...rows.map(collectionCells)];
}

export function plainText(value: string): string {
    return FORMULA_START.test(value) ? `'${value}` : value;
}

export function toCsv(table: Array<Array<Cell>>): string {
    return table.map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function csvCell(cell: Cell): string {
    const text = typeof cell === 'number' ? String(cell) : plainText(cell);

    return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
