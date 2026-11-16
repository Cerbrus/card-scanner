import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { COLLECTION_HEADER, CollectionRow, collectionTable, plainText, toCsv } from './collection-table';
import { isJpeg, photoFileName } from './photo-file';

const row: CollectionRow = {
    id: 7,
    name: 'Charizard',
    setName: 'Base Set',
    number: '4',
    rarity: 'Rare',
    language: 'nl',
    variant: 'holo',
    condition: 'good',
    conditionSource: 'user',
    priceTrend: 385.834,
    priceAvg30: null,
    priceLow: 90,
    value: 231.5,
    valueSource: 'own',
    priceCheckedAt: new Date('2026-11-14T08:30:00Z'),
    status: 'confirmed',
    notes: 'from the attic, "old" box',
    createdAt: new Date('2026-11-13T10:00:00Z'),
    frontPhoto: 'https://drive.example/front',
    backPhoto: '',
    cardmarket: 'https://www.cardmarket.com/en/Pokemon/Products?idProduct=273699',
    worthGrading: true
};

describe('the collection as a table', () => {
    it('starts with the header and has one line per card with as many cells', () => {
        const table = collectionTable([row, { ...row, id: 8 }]);

        assert.equal(table.length, 3);
        assert.deepEqual(table[0], COLLECTION_HEADER);
        assert.ok(table.every((cells) => cells.length === COLLECTION_HEADER.length));
    });

    it('rounds prices to cents, leaves a missing price empty and writes dates as days', () => {
        const cells = collectionTable([row])[1];

        assert.deepEqual(cells.slice(7, 16), ['good', 'user', 385.83, '', 90, 231.5, 'own', 'yes', '2026-11-14']);
        assert.equal(cells[18], '2026-11-13');
    });

    it('quotes cells with commas or quotes in the CSV', () => {
        const csv = toCsv(collectionTable([row]));

        assert.match(csv, /"from the attic, ""old"" box"/);
        assert.equal(csv.split('\r\n').length, 3);
    });

    it('keeps a spreadsheet from running a note as a formula', () => {
        assert.equal(plainText('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
        assert.equal(plainText('plain'), 'plain');
        assert.match(toCsv([['+1+1']]), /^'\+1\+1/);
    });
});

describe('photo files', () => {
    it('recognises a JPEG by its first bytes', () => {
        assert.equal(isJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), true);
        assert.equal(isJpeg(Buffer.from('<html>')), false);
        assert.equal(isJpeg(Buffer.from([0xff, 0xd8])), false);
    });

    it('names files after the card and the side', () => {
        assert.equal(photoFileName(12, 'front', 'photo'), '12-front.jpg');
        assert.equal(photoFileName(12, 'back', 'thumb'), '12-back-thumb.jpg');
        assert.equal(photoFileName(12, 'back', 'source'), '12-back-source.jpg');
    });
});
