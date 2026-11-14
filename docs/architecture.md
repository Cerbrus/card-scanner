# Architecture

How the app is built. Keep this document in step with the code.

## Parts

```
phone browser  --HTTPS-->  reverse proxy  -->  app container on the server Pi
                                                |-- NestJS API  (/api/v1/...)
                                                |-- built Angular app
                                                |-- SQLite      (/data/app.db)
                                                `-- photos      (/data/photos/)

app container  -->  TCGdex          (catalogue, prices)
               -->  Anthropic API   (read the photos; optional)
               -->  Google Drive and Sheets (copy of photos and data; optional)
```

| Part | Directory | Stack |
|---|---|---|
| API | `apps/card-api/` | NestJS, TypeORM, SQLite |
| Web app | `apps/card-front/` | Angular, TailwindCSS |
| Deployment | `deployment/` | Docker Compose, systemd timer, shell scripts |

## API layers

| Layer | Content |
|---|---|
| `api` | Controllers, request types, the login guard, security headers |
| `core/rules` | Pure functions: matching, prices, the collection table, photo checks, session signing, content policy |
| `core/connectors` | The outside world: `CatalogSource` (TCGdex), `CardReader` (Claude), `GoogleClient` (Drive, Sheets) |
| `core/services` | `CardService`, `CatalogService`, `PriceService`, `SyncService`, `JobsService`, `SettingService`, `ChangesService`, plus login and log |
| `data` | Entities, the migration, the database options |
| `config` | `AppConfig`, the only place that reads the environment |

Imports point inward: `api` to `core` to `data`. Lint enforces it.

## Data model

**`catalog_set`**: a set from the catalogue. Id, name, official and total card count, logo, symbol.

**`catalog_card`**: a card from the catalogue. Id, set, number within the set (`local_id`), name, picture. Filled in later, per card: rarity, the prices (`pricing`, as JSON: the general figure, the reverse figure, and one figure per print variant) and when they were fetched.

**`owned_card`**: one physical card in the collection.

| Field | Meaning |
|---|---|
| `id` | Own id |
| `catalog_card_id` | The catalogue card; empty until the user confirmed one |
| `status` | `new`, `identified` (candidates found, waits for the user), `confirmed` |
| `reading_state` | `none`, `pending`, `done`, `failed` |
| `reading`, `reading_error` | What the model returned, or why it failed |
| `candidates` | The catalogue cards offered to the user, best first |
| `language`, `variant`, `first_edition` | The print: language, finish (`normal`, `holo`, `reverse`), 1st edition mark |
| `condition`, `condition_source`, `condition_notes` | A step on Cardmarket's scale, who set it (`model` or `user`), what the model saw |
| `notes` | Free text |
| `price_trend`, `price_avg30`, `price_low`, `price_product_id`, `price_checked_at` | The current price figures in EUR, Cardmarket's product id, when checked |
| `created_at`, `updated_at` | Times |

**`photo`**: a file belonging to an owned card. Side (`front` or `back`), file name, thumbnail file name, size, `drive_file_id` and `synced_at`.

**`price_snapshot`**: owned card, day, trend, 30-day average, lowest. One row per card per day.

**`setting`**: key and value. Holds when the catalogue was fetched, and for the sync: the ids of the Drive folders and the sheet, the last run and the last error.

Schema changes go through migrations; `synchronize` is off.

## The scan flow

1. The user opens the Scan page and takes the front photo, then the back photo, with the phone's camera app.
2. The web app scales each photo to 2400 pixels, makes a 480-pixel thumbnail, and uploads the four files. The server checks that they are JPEGs, stores them as `<id>-front.jpg`, `<id>-front-thumb.jpg` and so on, and creates an `owned_card` with status `new`.
3. With reading switched on, the card is queued for the model. The upload answers at once; the next card can be scanned.
4. The reading fills in language, finish, 1st edition and condition, and the server looks for catalogue cards that fit. With candidates the status becomes `identified`.
5. The card waits in the Inbox. On its page the user taps the right candidate, or searches the catalogue by name and number and taps a result: status `confirmed`.
6. Confirming fetches the card's details and sets the price.
7. Twenty seconds after the last change the sync copies what is new to Google, when connected.

A failed reading or a failed lookup leaves the card as it is, with its photos.

## Matching

`core/rules/matching.ts` scores every catalogue card in a pool against a query of name, printed number and set name:

- the number matches (leading zeros and case ignored): 4 points, plus 4 when the printed set total equals the set's card count;
- the name matches exactly: 5 points; partly: 3;
- the set name matches exactly: 3 points; partly: 2.

The pool is every catalogue card with that number or with the name as part of its name. The best eight are offered. Number and set total are the same in every language, so a German or Dutch print finds its English catalogue card.

## Prices

`core/rules/pricing.ts` turns a TCGdex card into the stored `pricing` and picks the figure for a print:

1. the print variant with the same finish and the same 1st edition mark, preferring the plain (unlimited) one;
2. for a reverse holo without its own variant: the card's foil figures;
3. otherwise the card's general figure.

The card page says which of the three was used (`priceBasis`: `print`, `foil` or `general`), so a fallback to the general figure is visible.

The estimated value of an owned card is that figure's trend times the factor of its condition (`CONDITION_FACTORS`); without a condition the factor is 1. The API returns it as `estimatedValue` with `valueFactor` next to the source's figures.

A daily job asks the price of every confirmed card again and writes a snapshot. Card details are kept for 20 hours, so a second request within a day costs nothing.

## Reading photos

`CardReader` sends both photos to Claude with the instructions in `core/connectors/card.reader.ts` and gets back a fixed structure: is it a Pokémon card, name, number, set name, language, 1st edition, finish, confidence, condition, condition notes. Readings run one at a time. With no API key the reader is off: uploads are stored with `reading_state` `none`.

## Google sync

`SyncService.run()`:

1. Find or create the folder path from `DRIVE_FOLDER`, with `photos/` and `backup/` below it and the spreadsheet next to them. The ids are remembered and checked at the start of each run; when a folder was deleted, everything is created again and all photos are uploaded again.
2. Upload every photo without a Drive file id.
3. Rewrite the tab `Cards` (one row per owned card, with links to its photos and to Cardmarket) and the tab `Prices` (the snapshots).
4. Once a night, and on "Copy now": write a consistent copy of the database with `VACUUM INTO` and upload it as `backup/app.db`, replacing the previous one.

A failed run stores its error for the Settings page; the next run starts over and catches up.

## Background jobs

`JobsService` starts them, unless `BACKGROUND_JOBS=off` (the tests):

| Job | When |
|---|---|
| Fetch the catalogue | At start when it is empty, and when it is older than 7 days (checked every 6 hours) |
| Refresh prices | 2 minutes after start, then every 24 hours |
| Sync | 20 seconds after the last change |
| Sync with database copy | Every 24 hours |

## API

All under `/api/v1`. With login on, every route needs a session except the ones marked public.

| Route | Purpose |
|---|---|
| `GET /health` (public) | Status and version |
| `GET /auth/me`, `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/logout` (public) | Login |
| `GET /system` | Version and the state of login, reading, catalogue and sync |
| `POST /system/catalog/refresh`, `POST /system/prices/refresh` (owner) | Start a refresh |
| `GET /cards`, `POST /cards` | The collection; a new scan as multipart with `front`, `back`, `frontThumb`, `backThumb` |
| `GET /cards/:id`, `PATCH /cards/:id`, `DELETE /cards/:id` | One card with candidates and price history; change the print, condition, notes; remove |
| `POST /cards/:id/confirm` | Say which catalogue card it is |
| `POST /cards/:id/read` | Read the photos again |
| `GET /photos/:id`, `GET /photos/:id?thumb` | A photo or its thumbnail |
| `GET /catalog/search?name=&number=` | Catalogue cards that fit |
| `GET /export/cards.csv` | The collection as CSV |
| `GET /google/connect`, `GET /google/callback`, `POST /google/disconnect`, `POST /google/sync` (owner) | The Google Drive copy |
| `POST /csp-reports` (public) | Content policy reports from the browser |

## Web app

| Page | Content |
|---|---|
| Collection | Total estimated value, search, sort, a tile per card: a flag for the language, a coloured pill for the condition (a dashed `?` when unknown), a star on holo and reverse holo cards |
| Scan | Two photos, save, straight on to the next card |
| Inbox | Cards that are not confirmed, with their state |
| Card | Photos, catalogue picture, candidates, catalogue search, estimated value and the source's price with history, the print and condition, delete |
| Settings | What is on and off and why, Google connection, catalogue and prices, export, theme, language, log out |
| Login | The Google button |

State lives in `CollectionStore` (signals). Pages use signals; services return observables. Texts are in `src/assets/i18n/en.json` and `nl.json`.
