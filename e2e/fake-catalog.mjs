import { createServer } from 'node:http';

const SETS = [
    { id: 'base1', name: 'Base Set', cardCount: { total: 102, official: 102 } },
    { id: 'base2', name: 'Jungle', cardCount: { total: 64, official: 64 } }
];
const CARDS = [
    { id: 'base1-4', localId: '4', name: 'Charizard' },
    { id: 'base1-58', localId: '58', name: 'Pikachu' },
    { id: 'base2-60', localId: '60', name: 'Pikachu' }
];
const DETAILS = {
    'base1-4': {
        rarity: 'Rare',
        pricing: { cardmarket: { idProduct: 273699, trend: 385.83, avg30: 407.53, low: 90 } },
        variants_detailed: [{ type: 'holo', subtype: 'unlimited', pricing: { cardmarket: { idProduct: 273699, trend: 385.83, avg30: 407.53, low: 90 } } }]
    },
    'base1-58': { rarity: 'Common', pricing: { cardmarket: { idProduct: 273745, trend: 1.2, avg30: 1.1, low: 0.2 } } },
    'base2-60': { rarity: 'Common', pricing: { cardmarket: { idProduct: 273900, trend: 0.8, avg30: 0.7, low: 0.1 } } }
};

export function startCatalog() {
    const server = createServer((request, response) => {
        const path = decodeURIComponent(request.url ?? '');
        const body = path === '/sets' ? SETS : path === '/cards' ? CARDS : DETAILS[path.replace('/cards/', '')];
        response.statusCode = body ? 200 : 404;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(body ?? { status: 404 }));
    });

    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
