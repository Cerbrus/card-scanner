import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SourceCard, cardmarketUrl, dayOf, pickPrice, readPricing } from './pricing';

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

    it('gives the unlimited print for a holo that is not a first edition', () => {
        assert.equal(pickPrice(readPricing(charizard), { variant: 'holo', firstEdition: false })?.productId, 273699);
    });

    it('gives the first edition print its own, higher price', () => {
        const price = pickPrice(readPricing(charizard), { variant: 'holo', firstEdition: true });

        assert.deepEqual([price?.productId, price?.trend], [660224, 3489.25]);
    });

    it('falls back to the general price when the print is unknown or has no variant of its own', () => {
        assert.equal(pickPrice(readPricing(charizard), { variant: null, firstEdition: false })?.trend, 385.83);
        assert.equal(pickPrice(readPricing(common), { variant: 'normal', firstEdition: false })?.trend, 0.12);
    });

    it('uses the foil figures for a reverse holo', () => {
        assert.equal(pickPrice(readPricing(common), { variant: 'reverse', firstEdition: false })?.trend, 0.9);
    });

    it('has no price for a card the source has no figures for', () => {
        assert.equal(pickPrice(readPricing({}), { variant: 'holo', firstEdition: false }), undefined);
        assert.equal(pickPrice(readPricing({ pricing: { cardmarket: { idProduct: 5, trend: 0, avg30: null } } }), { firstEdition: false }), undefined);
        assert.equal(pickPrice(undefined, { firstEdition: false }), undefined);
    });

    it('links to the product on Cardmarket, or to a search when the product is unknown', () => {
        assert.equal(cardmarketUrl(273699, 'Charizard'), 'https://www.cardmarket.com/en/Pokemon/Products?idProduct=273699');
        assert.equal(cardmarketUrl(null, 'Mr. Mime'), 'https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Mr.%20Mime');
    });

    it('names a day by its date', () => {
        assert.equal(dayOf(new Date('2026-11-14T08:30:00Z')), '2026-11-14');
    });
});
