import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SourceCard, cardmarketUrl, dayOf, ownedValue, pickPrice, readPricing, worthGrading } from './pricing';

const charizard: SourceCard = {
    rarity: 'Rare',
    pricing: { cardmarket: { idProduct: 273699, trend: 385.83, avg30: 407.53, low: 90, updated: '2026-11-13T22:24:06.052Z', 'trend-holo': 123.63, 'avg30-holo': 202.71, 'low-holo': null } },
    variants_detailed: [
        { type: 'holo', subtype: 'unlimited', pricing: { cardmarket: { idProduct: 273699, trend: 385.83, avg30: 407.53, low: 90 } } },
        { type: 'holo', subtype: 'shadowless', stamp: ['1st-edition'], pricing: { cardmarket: { idProduct: 660224, trend: 3489.25, avg30: 2445.05, low: 979 } } },
        { type: 'holo', subtype: 'shadowless', pricing: { cardmarket: { idProduct: 660224, trend: 3489.25, avg30: 2445.05, low: 979 } } },
        { type: 'holo', subtype: '1999-2000-copyright' }
    ]
};
const common: SourceCard = { pricing: { cardmarket: { idProduct: 1, trend: 0.12, avg30: 0.1, low: 0.02, 'trend-holo': 0.9, 'avg30-holo': 0.8 } } };

describe('prices of a card', () => {
    it('keeps the general price, the reverse price and the priced print variants', () => {
        const pricing = readPricing(charizard);

        assert.equal(pricing.standard?.trend, 385.83);
        assert.equal(pricing.reverse?.trend, 123.63);
        assert.deepEqual(pricing.variants.map((variant) => [variant.subtype, variant.firstEdition]), [['unlimited', false], ['shadowless', true], ['shadowless', false]]);
    });

    it('gives the unlimited print for a holo, never the first edition one', () => {
        assert.equal(pickPrice(readPricing(charizard), { variant: 'holo' })?.price.productId, 273699);
    });

    it('falls back to the general price when the print is unknown or has no variant of its own', () => {
        assert.equal(pickPrice(readPricing(charizard), { variant: null })?.price.trend, 385.83);
        assert.equal(pickPrice(readPricing(common), { variant: 'normal' })?.price.trend, 0.12);
    });

    it('uses the foil figures for a reverse holo', () => {
        assert.equal(pickPrice(readPricing(common), { variant: 'reverse' })?.price.trend, 0.9);
    });

    it('has no price for a card the source has no figures for', () => {
        assert.equal(pickPrice(readPricing({}), { variant: 'holo' }), undefined);
        assert.equal(pickPrice(readPricing({ pricing: { cardmarket: { idProduct: 5, trend: 0, avg30: null } } }), {}), undefined);
        assert.equal(pickPrice(undefined, {}), undefined);
    });

    it('says which figure it took: the print\'s own, the foil figure, or the card\'s general one', () => {
        assert.equal(pickPrice(readPricing(charizard), { variant: 'holo' })?.basis, 'print');
        assert.equal(pickPrice(readPricing(charizard), { variant: 'normal' })?.basis, 'general');
        assert.equal(pickPrice(readPricing(charizard), { variant: null })?.basis, 'general');
        assert.equal(pickPrice(readPricing(common), { variant: 'reverse' })?.basis, 'foil');
        assert.equal(pickPrice(readPricing(common), { variant: 'holo' })?.basis, 'general');
    });

    it('values a copy at the price its owner entered, and at the price trend when there is none', () => {
        assert.deepEqual(ownedValue(40, 385.83), { value: 40, source: 'own' });
        assert.deepEqual(ownedValue(0, 385.83), { value: 0, source: 'own' });
        assert.deepEqual(ownedValue(null, 385.83), { value: 385.83, source: 'trend' });
        assert.deepEqual(ownedValue(12.5, null), { value: 12.5, source: 'own' });
        assert.equal(ownedValue(undefined, undefined), undefined);
    });

    it('marks a copy as worth grading only when it is valuable and near mint or better', () => {
        assert.equal(worthGrading(50, 'near_mint'), true);
        assert.equal(worthGrading(385.83, 'mint'), true);
        assert.equal(worthGrading(49.99, 'mint'), false);
        assert.equal(worthGrading(385.83, 'excellent'), false);
        assert.equal(worthGrading(385.83, null), false);
        assert.equal(worthGrading(undefined, 'mint'), false);
    });

    it('opens Cardmarket with the language and condition of the copy in the filter', () => {
        assert.equal(cardmarketUrl(273699, 'Ninetales', { language: 'nl', condition: 'excellent' }), 'https://www.cardmarket.com/en/Pokemon/Products?idProduct=273699&language=12&minCondition=3');
        assert.equal(cardmarketUrl(273699, 'Ninetales', { language: 'en' }), 'https://www.cardmarket.com/en/Pokemon/Products?idProduct=273699&language=1');
        assert.equal(cardmarketUrl(273699, 'Ninetales', { language: null, condition: 'poor' }), 'https://www.cardmarket.com/en/Pokemon/Products?idProduct=273699&minCondition=7');
    });

    it('links to the product on Cardmarket, or to a search when the product is unknown', () => {
        assert.equal(cardmarketUrl(273699, 'Charizard'), 'https://www.cardmarket.com/en/Pokemon/Products?idProduct=273699');
        assert.equal(cardmarketUrl(null, 'Mr. Mime'), 'https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Mr.%20Mime');
    });

    it('names a day by its date', () => {
        assert.equal(dayOf(new Date('2026-11-14T08:30:00Z')), '2026-11-14');
    });
});
