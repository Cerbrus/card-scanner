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
    await expect(editor.locator('.stage')).toHaveAttribute('data-start', 'found');
    const corner = await editor.locator('circle.handle').first().boundingBox();
    const shown = await editor.locator('img.photo').boundingBox();
    if (!corner || !shown) {
        throw new Error('no corner');
    }
    const turnedCornerX = 600 + -400 * Math.cos(0.1) - -560 * Math.sin(0.1);
    expect(Math.abs((corner.x + corner.width / 2 - shown.x) / shown.width - turnedCornerX / 1200)).toBeLessThan(0.02);

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
    await expect(editor.locator('.stage')).toHaveAttribute('data-start', 'found');
    await editor.locator('button.whole').click();
    await expect(page.locator('.side.filled')).toHaveCount(2);

    await page.getByRole('button', { name: 'Kaart opslaan' }).click();
    const details = page.locator('app-card-details');
    await expect(details).toBeVisible();

    await details.locator('input[type=search]').first().fill('Charizard');
    await details.locator('input[type=search]').nth(1).fill('4');
    await details.locator('button.search').click();
    await details.locator('app-candidate-list button').first().click();
    await expect(details.locator('.chosen')).toContainText('Charizard');
    await details.locator('.choice.condition', { hasText: 'NM' }).click();
    await details.locator('.choice.finish', { hasText: /^\s*Holo\s*$/ }).click();
    await details.locator('.choice.language', { hasText: 'Nederlands' }).click();
    await details.getByRole('button', { name: 'Opslaan en volgende kaart' }).click();

    await expect(page.getByText('Kaart opgeslagen')).toBeVisible();
    await expect(details).toHaveCount(0);
    await expect(page.locator('.sides')).toBeVisible();
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

    const original = jpegSize(await (await request.get(`/api/v1/photos/${detail.photos.front}?source`)).body());
    expect([original.width, original.height]).toEqual([1200, 1600]);
});

test('stores what was entered right after the scan, and marks the card worth grading', async ({ page, request }) => {
    const [card] = await cards(request);
    const detail = (await (await request.get(`/api/v1/cards/${card.id}`)).json()) as { status: string; name: string; condition: string; variant: string; language: string };
    expect([detail.status, detail.name, detail.condition, detail.variant, detail.language]).toEqual(['confirmed', 'Charizard', 'near_mint', 'holo', 'nl']);

    await page.goto(`/#/cards/${card.id}`);
    await expect(page.locator('h1')).toHaveText('Charizard');
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

test('publishes the list of its script files, matching what the page loaded', async ({ page, request }) => {
    await page.goto('/#/collection');
    const loaded = await page.evaluate(() => Array.from(document.querySelectorAll('script[src]'), (script) => new URL((script as HTMLScriptElement).src).pathname.slice(1)));
    const published = (await (await request.get('/app-files.json')).json()) as Array<string>;

    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.every((file) => published.includes(file))).toBe(true);
});

test('show the log from the settings page', async ({ page }) => {
    await page.goto('/#/settings');
    await page.locator('a[href="/log"], a[href="#/log"]').click();

    await expect(page.locator('h1')).toHaveText('Log');
    await expect(page.locator('.log .line').first()).toBeVisible();
});

test('read the name and number of a straightened card and offer the matching catalogue card', async ({ page, request }) => {
    test.setTimeout(120_000);
    await page.goto('/#/scan');
    const card = { left: 150, top: 200, width: 1260, height: 1760 };
    const url = await page.evaluate((box) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1560;
        canvas.height = 2160;
        const context = canvas.getContext('2d') as CanvasRenderingContext2D;
        context.fillStyle = '#1e1e1e';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#f4f1e8';
        context.fillRect(box.left, box.top, box.width, box.height);
        context.fillStyle = '#111';
        context.font = 'bold 84px Arial';
        context.fillText('Charizard', box.left + box.width * 0.1, box.top + box.height * 0.1);
        context.font = 'bold 44px Arial';
        context.fillText('4/102', box.left + box.width * 0.85, box.top + box.height * 0.975);

        return canvas.toDataURL('image/jpeg', 0.95);
    }, card);
    await page.locator('input[type=file]').nth(0).setInputFiles({ name: 'front.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(url.split(',')[1], 'base64') });

    const shown = await page.locator('app-crop-editor img.photo').boundingBox();
    if (!shown) {
        throw new Error('no photo');
    }
    const corners = [
        [card.left, card.top],
        [card.left + card.width, card.top],
        [card.left + card.width, card.top + card.height],
        [card.left, card.top + card.height]
    ];
    for (const [index, [x, y]] of corners.entries()) {
        const grip = await page.locator('app-crop-editor circle.grip').nth(index).boundingBox();
        if (!grip) {
            throw new Error('no corner to drag');
        }
        await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
        await page.mouse.down();
        await page.mouse.move(shown.x + (x / 1560) * shown.width, shown.y + (y / 2160) * shown.height, { steps: 4 });
        await page.mouse.up();
    }
    await page.locator('app-crop-editor button.use').click();
    await expect(page.locator('.read-result')).toContainText('Gelezen: Charizard · 4/102', { timeout: 60_000 });

    await page.locator('input[type=file]').nth(1).setInputFiles({ name: 'back.jpg', mimeType: 'image/jpeg', buffer: await photo(page, '#2f5fd0') });
    await page.locator('app-crop-editor button.whole').click();
    await page.getByRole('button', { name: 'Kaart opslaan' }).click();
    await expect(page.locator('app-card-details .chosen')).toContainText('Charizard');
    await page.locator('app-card-details').getByRole('button', { name: 'Later' }).click();
    await expect(page.locator('app-card-details')).toHaveCount(0);

    const [newest] = await cards(request);
    const detail = (await (await request.get(`/api/v1/cards/${newest.id}`)).json()) as { status: string; candidates: Array<{ catalogCardId: string }> };
    expect(detail.status).toBe('identified');
    expect(detail.candidates[0].catalogCardId).toBe('base1-4');
});

test('view the photos full screen, then crop the front again with the magnifier', async ({ page, request }) => {
    const [card] = await cards(request);
    await page.goto(`/#/cards/${card.id}`);
    const before = await page.locator('.photos img').first().getAttribute('src');

    await page.locator('.photo-open').first().click();
    const viewer = page.locator('app-photo-viewer');
    await expect(viewer.locator('.shown')).toBeVisible();
    await viewer.locator('.next').click();
    await expect(viewer.locator('.label')).toContainText('2 /');
    await viewer.locator('.close').click();
    await expect(viewer).toHaveCount(0);

    await page.locator('.photo-actions .recrop').first().click();
    const editor = page.locator('app-crop-editor');
    await expect(editor.locator('circle.grip')).toHaveCount(4);
    const grip = await editor.locator('circle.grip').nth(2).boundingBox();
    if (!grip) {
        throw new Error('no corner to drag');
    }
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 - 15, grip.y + grip.height / 2 - 10, { steps: 3 });
    await expect(editor.locator('.loupe')).toHaveCount(1);
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
    await page.mouse.up();
    await expect(editor.locator('.loupe')).toHaveCount(0);

    await editor.locator('button.use').click();
    await expect(page.getByText('Foto opgeslagen')).toBeVisible();
    await expect(page.locator('.photos img').first()).not.toHaveAttribute('src', before ?? '');
});

test('delete a card after a second tap', async ({ page, request }) => {
    const before = await cards(request);
    await page.goto(`/#/cards/${before[0].id}`);

    await page.getByRole('button', { name: 'Kaart verwijderen' }).click();
    await page.getByRole('button', { name: 'Ja, verwijderen' }).click();

    await expect(page).toHaveURL(/#\/collection$/);
    expect((await cards(request)).length).toBe(before.length - 1);
});
