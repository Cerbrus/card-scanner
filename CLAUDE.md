# Card Scanner

Photograph Pokémon cards with a phone, find out which card each is, look up its value and keep the collection. Single user, home use.

## Read first

Before changing code, read:

- `docs/plan.md` — what is done, what waits for the owner, what was never tested
- `docs/decisions.md` — settled choices; don't reopen them without the user
- `docs/architecture.md` — modules, data model, scan flow, API, web app
- `docs/deployment.md` — pull-based Docker deployment on the Pi, settings, Google Cloud

When a decision changes, update `docs/decisions.md` first, then the affected docs. When marking something done in `docs/plan.md`, add the date and time (`done 2026-11-14 15:55`). When behaviour changes, update `README.md` with it.

## In short

- One `app` container: NestJS serves `/api/v1/...` and the built Angular app. SQLite at `/data/app.db`, photos in `/data/photos/`.
- The catalogue (sets and cards) is copied from TCGdex into SQLite; card details and prices are fetched per card when needed and kept for 20 hours.
- Three optional parts, each off when its setting is empty: login with Google (`GOOGLE_CLIENT_ID`), reading photos with Claude (`ANTHROPIC_API_KEY`), the Google Drive copy (Google client settings plus the owner's consent). Every feature must keep working with all three off.
- The phone makes each photo smaller and makes the thumbnail; the server stores what it gets and has no image library.
- Login with Google for an allowlist: one global guard, signed session cookie. New routes are for logged-in users by default; mark one `@Public()` only when it must work without login and `@OwnerOnly()` when only the owner account may use it.
- The phone reads name and number from fixed strips of the straightened front with Tesseract.js (`card-text-reader.ts`); its files are served from `ocr/` in the web app, never from a CDN.
- Outside sources live in `core/connectors/`: `CatalogSource` (TCGdex), `CardReader` (Claude), `GoogleClient` (Drive and Sheets, plain `fetch`). Tests replace them with a fake HTTP server, a patched reader and a fake `fetch`.
- The same repo layout, lint rules and deployment as `www-nodejs-barcodescanner`.

## Layout

| Part | Directory | Notes |
|---|---|---|
| API | `apps/card-api/` | Layers under `src/`: `api` (controllers, dto, guards), `core` (services, rules, connectors), `data` (entities, migrations), `config`. Integration tests in `src/test/` |
| Web app | `apps/card-front/` | Pages in `src/app/pages/`, shared pieces in `components/`, state in `services/collection.store.ts`, texts in `src/assets/i18n/` |
| End-to-end tests | `e2e/` | Playwright with the installed Chrome; `start-app.mjs` starts the built app with a fake catalogue (`fake-catalog.mjs`) |
| Deployment | `deployment/` | Compose file and the scripts the Pi fetches from `master`: `install.sh`, `update.sh`, `firewall.sh` |

Nx project names: `card-api`, `card-front`.

## Commands

```bash
yarn install
yarn card-api:serve         # port 3030
yarn card-api:build
yarn card-front:serve       # port 4200
yarn card-front:build
yarn lint:all
yarn card-api:test                 # rules: matching, prices, collection table, session, content policy
yarn card-api:test:integration     # the whole app over HTTP; a fake catalogue server and a fake Google
yarn card-front:test               # Vitest without a browser
yarn e2e                           # builds both apps and drives them in headless Chrome
```

Don't start the serve commands from a session; ask the user to run them. The build workflow runs lint, all three test commands and `yarn e2e` first, so keep them green. Web app tests sit next to the file they test as `*.spec.ts`; shared stand-ins are in `src/testing/fakes.ts`, and `src/testing/translate.ts` provides translations to a test. `vi.mock` of a relative import does not work in the Angular test runner: make the dependency injectable and provide a fake. A change comes with its test.

## Code style

- Prettier: single quotes, 120 characters, 4-space indent, LF.
- ESLint: strict TypeScript (`no-any`, `explicit-member-accessibility`), ordered imports, blank lines between multi-line class members, max 75 lines per function.
- Angular: prefix `app`, standalone components, signals over observables in components, `@ngx-translate` with EN and NL. Every visible text goes in both language files.
- RxJS: side effects in `tap()`, `.subscribe()` stays empty.
- Styling: colours come from the CSS variables in `styles.scss`, which carry the light and dark theme. No hard-coded colours in components.
- NestJS: controller calls service, service uses TypeORM directly. Schema changes need a new migration; `synchronize` is off.
- API layers: one controller, request type, entity or service per file. Imports point inward only (`api` to `core` to `data`); lint enforces it.
- Settings: read them through `AppConfig`; `process.env` is forbidden elsewhere.
- A table has one owning service; other services ask it.
- No explanatory comments.

## Hard rules

- The repo and the image are public. No secrets, no LAN addresses, no personal addresses and no own domain names in code, docs or an image. Runtime settings go in the `.env` file on the Pi, keys and tokens in its `data/` folder.
- `data/` is git-ignored as a whole: database, photos, session secret, Google token.
- An outside source that fails must never lose a scan: the photos are stored first, everything else may fail and be retried.
- What the model reads is a proposal. A card counts as identified only after the user confirmed a catalogue card; a condition set by the user is never overwritten by the model.
- The sync is one way: the app writes to Drive and the sheet and never reads the collection back from them.
- Calls to Claude go through the official `@anthropic-ai/sdk`, never raw HTTP.
- Docs live in `docs/`.
