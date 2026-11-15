import { APIRequestContext, Page, expect, test } from '@playwright/test';

interface Card {
    id: number;
    status: string;
    catalogCardId?: string;
    worthGrading: boolean;
}

test.describe.configure({ mode: 'serial' });

const photo = async (page: Page, colour: string): Promise<Buffer> => {
    const url = await page.evaluate((fill) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 1600;
        const context = canvas.getContext('2d') as CanvasRenderingContext2D;
        context.fillStyle = '#202020';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.translate(600, 800);
        context.rotate(0.1);
        context.fillStyle = fill;
        context.fillRect(-400, -560, 800, 1120);

        return canvas.toDataURL('image/jpeg', 0.9);
    }, colour);

    return Buffer.from(url.split(',')[1], 'base64');
};

const jpegSize = (data: Buffer): { width: number; height: number } => {
    let at = 2;
    while (at < data.length) {
        const marker = data[at + 1];
        if (marker >= 0xc0 && marker <= 0xc3) {
            return { height: data.readUInt16BE(at + 5), width: data.readUInt16BE(at + 7) };
        }
        at += 2 + data.readUInt16BE(at + 2);
    }
    throw new Error('no size in this JPEG');
};

const cards = async (request: APIRequestContext): Promise<Array<Card>> => (await request.get('/api/v1/cards')).json();

const addConfirmed = async (page: Page, request: APIRequestContext, catalogCardId: string, changes: object): Promise<void> => {
    const jpeg = await photo(page, '#d0b030');
    const file = { name: 'side.jpg', mimeType: 'image/jpeg', buffer: jpeg };
    const created = (await (await request.post('/api/v1/cards', { multipart: { front: file, back: file, frontThumb: file, backThumb: file } })).json()) as Card;
    await request.post(`/api/v1/cards/${created.id}/confirm`, { data: { catalogCardId } });
    await request.patch(`/api/v1/cards/${created.id}`, { data: changes });
};

test.beforeAll(async ({ request }) => {
    await expect.poll(async () => ((await (await request.get('/api/v1/system')).json()) as { catalog: { cards: number } }).catalog.cards).toBeGreaterThan(0);
});

test('photograph both sides, straighten the front and save the card', async ({ page }) => {
    await page.goto('/#/scan');
    const front = await photo(page, '#f2d14b');
    const back = await photo(page, '#2f5fd0');

    await page.locator('input[type=file]').nth(0).setInputFiles({ name: 'front.jpg', mimeType: 'image/jpeg', buffer: front });
    const editor = page.locator('app-crop-editor');
    await expect(editor.locator('circle.grip')).toHaveCount(4);

    const grip = await editor.locator('circle.grip').first().boundingBox();
    if (!grip) {
        throw new Error('no corner to drag');
    }
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 20, grip.y + grip.height / 2 + 10, { steps: 4 });
    await page.mouse.up();
    await editor.locator('button.use').click();
    await expect(editor).toHaveCount(0);
    await expect(page.locator('.side.filled')).toHaveCount(1);

    await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'back.jpg', mimeType: 'image/jpeg', buffer: back });
    await editor.locator('button.whole').click();
    await expect(page.locator('.side.filled')).toHaveCount(2);

    await page.getByRole('button', { name: 'Kaart opslaan' }).click();
    await expect(page.getByText('Kaart opgeslagen')).toBeVisible();
    await expect(page.locator('.side.filled')).toHaveCount(0);
});

test('stores the straightened front as a card shaped photo', async ({ request }) => {
    const [card] = await cards(request);
    const detail = (await (await request.get(`/api/v1/cards/${card.id}`)).json()) as { photos: { front: number } };
    const answer = await request.get(`/api/v1/photos/${detail.photos.front}`);

    const { width, height } = jpegSize(await answer.body());

    expect(answer.headers()['content-type']).toContain('image/jpeg');
    expect(width / height).toBeCloseTo(63 / 88, 2);
    expect(height).toBeGreaterThan(1000);
});

test('confirm the scanned card from the inbox, and mark it worth grading', async ({ page }) => {
    await page.goto('/#/inbox');
    await page.locator('a.card').first().click();

    await page.locator('input[type=search]').first().fill('Charizard');
    await page.locator('input[type=search]').nth(1).fill('4');
    await page.getByRole('button', { name: 'Zoeken' }).click();
    await page.locator('app-candidate-list button').first().click();
    await expect(page.locator('h1')).toHaveText('Charizard');

    await page.locator('select').first().selectOption('near_mint');
    await expect(page.locator('.grading-note')).toBeVisible();
});

test('count copies, filter the collection and find the cards worth grading', async ({ page, request }) => {
    await addConfirmed(page, request, 'base1-4', { condition: 'poor', language: 'nl' });
    await addConfirmed(page, request, 'base2-60', { condition: 'excellent', language: 'en' });

    await page.goto('/#/collection');
    await expect(page.locator('app-card-tile')).toHaveCount(3);
    await expect(page.locator('app-card-tile .copies')).toHaveText(['×2', '×2']);
    await expect(page.locator('app-card-tile .grading')).toHaveCount(1);

    await page.locator('select.filter-set').selectOption('Jungle');
    await expect(page.locator('.tile-name')).toHaveText(['Pikachu']);

    await page.locator('.clear-filters').click();
    await page.locator('select.filter-condition').selectOption('poor');
    await expect(page.locator('app-card-tile')).toHaveCount(1);

    await page.locator('.clear-filters').click();
    await page.locator('.grading-filter').click();
    await expect(page.locator('app-card-tile')).toHaveCount(1);
    await expect(page.locator('.tile-name')).toHaveText(['Charizard']);
});

test('show the log from the settings page', async ({ page }) => {
    await page.goto('/#/settings');
    await page.locator('a[href="/log"], a[href="#/log"]').click();

    await expect(page.locator('h1')).toHaveText('Log');
    await expect(page.locator('.log .line').first()).toBeVisible();
});

test('delete a card after a second tap', async ({ page, request }) => {
    const before = await cards(request);
    await page.goto(`/#/cards/${before[0].id}`);

    await page.getByRole('button', { name: 'Kaart verwijderen' }).click();
    await page.getByRole('button', { name: 'Ja, verwijderen' }).click();

    await expect(page).toHaveURL(/#\/collection$/);
    expect((await cards(request)).length).toBe(before.length - 1);
});
