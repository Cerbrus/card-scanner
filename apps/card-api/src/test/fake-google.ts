interface FakeFile {
    id: string;
    name: string;
    parent: string;
    mimeType: string;
    data?: Buffer;
    uploads: number;
}

interface FakeTab {
    sheetId: number;
    title: string;
    values: Array<Array<string | number>>;
}

type Body = { requests?: Array<Record<string, { properties: { sheetId?: number; title: string } }>>; values?: Array<Array<string | number>>; name?: string; mimeType?: string; parents?: Array<string> };

const GOOGLE_HOSTS = ['oauth2.googleapis.com', 'www.googleapis.com', 'sheets.googleapis.com'];
const SHEET_TYPE = 'application/vnd.google-apps.spreadsheet';

export class FakeGoogle {
    public readonly files: Array<FakeFile> = [];
    public readonly tabs = new Map<string, Array<FakeTab>>();
    public readonly tokenRequests: Array<Record<string, string>> = [];
    public failUploads = false;

    private readonly realFetch = globalThis.fetch;
    private nextId = 1;

    public install(): void {
        globalThis.fetch = (input, init): Promise<Response> => {
            const url = new URL(String(input));

            return GOOGLE_HOSTS.includes(url.host) ? this.answer(url, init ?? {}) : this.realFetch(input, init);
        };
    }

    public uninstall(): void {
        globalThis.fetch = this.realFetch;
    }

    public path(file: FakeFile): string {
        const parent = this.files.find((candidate) => candidate.id === file.parent);

        return parent ? `${this.path(parent)}/${file.name}` : file.name;
    }

    public paths(): Array<string> {
        return this.files.map((file) => this.path(file)).sort();
    }

    public table(title: string): Array<Array<string | number>> {
        return Array.from(this.tabs.values()).flat().find((tab) => tab.title === title)?.values ?? [];
    }

    private async answer(url: URL, init: RequestInit): Promise<Response> {
        const method = init.method ?? 'GET';
        const path = decodeURIComponent(url.pathname);

        if (url.host === 'oauth2.googleapis.com') {
            this.tokenRequests.push(Object.fromEntries(new URLSearchParams(String(init.body))));
            return this.json({ access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600 });
        }
        if ((init.headers as Record<string, string>)['Authorization'] !== 'Bearer access-token') {
            return this.json({ error: 'unauthorized' }, 401);
        }
        if (url.host === 'sheets.googleapis.com') {
            return this.sheets(method, path, init);
        }
        if (path.startsWith('/upload/')) {
            return this.failUploads ? this.json({ error: 'quota' }, 403) : this.upload(method, path, init);
        }

        return this.drive(method, path, url, init);
    }

    private drive(method: string, path: string, url: URL, init: RequestInit): Response {
        const id = path.replace('/drive/v3/files', '').replace('/', '');
        if (id) {
            return this.files.some((file) => file.id === id) ? this.json({ id, trashed: false }) : this.json({ error: 'not found' }, 404);
        }
        if (method === 'POST') {
            const body = JSON.parse(String(init.body)) as Body;
            const file = this.add(body.name as string, (body.parents as Array<string>)[0], body.mimeType as string);
            if (body.mimeType === SHEET_TYPE) {
                this.tabs.set(file.id, [{ sheetId: 0, title: 'Blad1', values: [] }]);
            }

            return this.json({ id: file.id });
        }

        const query = url.searchParams.get('q') ?? '';
        const name = /name = '((?:[^'\\]|\\.)*)'/.exec(query)?.[1].replace(/\\(.)/g, '$1');
        const parent = /'([^']+)' in parents/.exec(query)?.[1];
        const mimeType = /mimeType = '([^']+)'/.exec(query)?.[1];
        const found = this.files.filter((file) => file.name === name && file.parent === parent && (!mimeType || file.mimeType === mimeType));

        return this.json({ files: found.map((file) => ({ id: file.id, name: file.name })) });
    }

    private upload(method: string, path: string, init: RequestInit): Response {
        const data = Buffer.from(init.body as Uint8Array);
        if (method === 'PATCH') {
            const file = this.files.find((candidate) => candidate.id === path.split('/').pop()) as FakeFile;
            file.data = data;
            file.uploads++;

            return this.json({ id: file.id });
        }

        const text = data.toString('latin1');
        const metadata = JSON.parse(Buffer.from(text.slice(text.indexOf('{'), text.indexOf('}') + 1), 'latin1').toString('utf-8')) as Body;
        const mimeType = /Content-Type: (image\/jpeg|application\/vnd\.sqlite3)/.exec(text)?.[1] ?? '';
        const file = this.add(metadata.name as string, (metadata.parents as Array<string>)[0], mimeType);
        file.data = data;
        file.uploads++;

        return this.json({ id: file.id });
    }

    private sheets(method: string, path: string, init: RequestInit): Response {
        const [, id, rest] = /^\/v4\/spreadsheets\/([^/:]+)(.*)$/.exec(path) ?? [];
        const tabs = this.tabs.get(id);
        if (!tabs) {
            return this.json({ error: 'not found' }, 404);
        }
        if (!rest) {
            return this.json({ sheets: tabs.map(({ sheetId, title }) => ({ properties: { sheetId, title } })) });
        }

        const body = JSON.parse(String(init.body)) as Body;
        if (rest === ':batchUpdate') {
            for (const request of body.requests ?? []) {
                const renamed = request['updateSheetProperties']?.properties;
                const added = request['addSheet']?.properties;
                if (renamed) {
                    (tabs.find((tab) => tab.sheetId === renamed.sheetId) as FakeTab).title = renamed.title;
                }
                if (added) {
                    tabs.push({ sheetId: tabs.length, title: added.title, values: [] });
                }
            }

            return this.json({});
        }

        const title = /^\/values\/'([^']+)'/.exec(rest)?.[1];
        const tab = tabs.find((candidate) => candidate.title === title);
        if (!tab) {
            return this.json({ error: `no tab ${title}` }, 400);
        }
        tab.values = method === 'PUT' ? (body.values ?? []) : [];

        return this.json({});
    }

    private add(name: string, parent: string, mimeType: string): FakeFile {
        const file = { id: `file-${this.nextId++}`, name, parent, mimeType, uploads: 0 };
        this.files.push(file);

        return file;
    }

    private json(body: object, status = 200): Response {
        return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }
}
