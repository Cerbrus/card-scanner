import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MatchCard, MatchSet, localIdForms, normalizeNumber, parsePrintedNumber, rankMatches, setIdOf } from './matching';

const sets = new Map<string, MatchSet>([
    ['base1', { id: 'base1', name: 'Base Set', officialCount: 102, totalCount: 102 }],
    ['base4', { id: 'base4', name: 'Base Set 2', officialCount: 130, totalCount: 130 }],
    ['sv03.5', { id: 'sv03.5', name: '151', officialCount: 165, totalCount: 207 }]
]);
const cards: Array<MatchCard> = [
    { id: 'base1-4', setId: 'base1', localId: '4', name: 'Charizard' },
    { id: 'base4-4', setId: 'base4', localId: '4', name: 'Charizard' },
    { id: 'base1-58', setId: 'base1', localId: '58', name: 'Pikachu' },
    { id: 'sv03.5-025', setId: 'sv03.5', localId: '025', name: 'Pikachu' },
    { id: 'sv03.5-004', setId: 'sv03.5', localId: '004', name: 'Charmander' }
];
const ids = (matches: ReturnType<typeof rankMatches>): Array<string> => matches.map((match) => match.card.id);

describe('matching a reading to the catalogue', () => {
    it('reads the printed number and the set total', () => {
        assert.deepEqual(parsePrintedNumber('4/102'), { number: '4', total: 102 });
        assert.deepEqual(parsePrintedNumber('025/165'), { number: '25', total: 165 });
        assert.deepEqual(parsePrintedNumber('SWSH123'), { number: 'swsh123', total: undefined });
        assert.deepEqual(parsePrintedNumber('TG05/TG30'), { number: 'tg5', total: 30 });
        assert.deepEqual(parsePrintedNumber(null), { number: undefined, total: undefined });
    });

    it('treats numbers with and without leading zeros as the same', () => {
        assert.equal(normalizeNumber('004'), normalizeNumber('4'));
        assert.equal(normalizeNumber(' TG05 '), 'tg5');
    });

    it('offers the forms a number can have in the catalogue', () => {
        assert.deepEqual(localIdForms('25/165'), ['25', '025']);
        assert.deepEqual(localIdForms('025/165').sort(), ['025', '25'].sort());
        assert.deepEqual(localIdForms(''), []);
    });

    it('puts the card whose number and set total both fit first', () => {
        assert.deepEqual(ids(rankMatches({ name: 'Charizard', number: '4/102' }, cards, sets, 5)).slice(0, 2), ['base1-4', 'base4-4']);
        assert.deepEqual(ids(rankMatches({ name: 'Charizard', number: '4/130' }, cards, sets, 5))[0], 'base4-4');
    });

    it('finds a card by its number alone when the name is in another language', () => {
        assert.equal(ids(rankMatches({ name: 'Glumanda', number: '004/165' }, cards, sets, 5))[0], 'sv03.5-004');
    });

    it('uses the set name when the number is missing', () => {
        assert.equal(ids(rankMatches({ name: 'Pikachu', setName: 'Base Set' }, cards, sets, 5))[0], 'base1-58');
    });

    it('leaves out cards that fit in nothing, and keeps to the limit', () => {
        assert.deepEqual(ids(rankMatches({ name: 'Mewtwo' }, cards, sets, 5)), []);
        assert.equal(rankMatches({ number: '4' }, cards, sets, 2).length, 2);
    });

    it('works out the set from a card id, also when the set id holds a hyphen', () => {
        assert.equal(setIdOf('base1-4', '4'), 'base1');
        assert.equal(setIdOf('tk-xy-latia-1', '1'), 'tk-xy-latia');
        assert.equal(setIdOf('exu-%3F', '%3F'), 'exu');
    });
});
