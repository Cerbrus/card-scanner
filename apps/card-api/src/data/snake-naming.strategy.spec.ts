import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SnakeNamingStrategy, snakeCase } from './snake-naming.strategy';

describe('snake case names', () => {
    it('turns property names into the column names the migrations use', () => {
        assert.equal(snakeCase('catalogCardId'), 'catalog_card_id');
        assert.equal(snakeCase('priceAvg30'), 'price_avg30');
        assert.equal(snakeCase('sourceDriveFileId'), 'source_drive_file_id');
        assert.equal(snakeCase('OwnedCardEntity'), 'owned_card_entity');
        assert.equal(snakeCase('HTTPStatus'), 'http_status');
    });

    it('keeps a chosen name and names join columns after the relation', () => {
        const naming = new SnakeNamingStrategy();
        assert.equal(naming.tableName('OwnedCardEntity', 'owned_card'), 'owned_card');
        assert.equal(naming.columnName('ownPriceAt', undefined, []), 'own_price_at');
        assert.equal(naming.columnName('file', 'photo_file', []), 'photo_file');
        assert.equal(naming.joinColumnName('ownedCard', 'id'), 'owned_card_id');
    });
});
