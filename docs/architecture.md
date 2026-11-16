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
| `language`, `variant` | The print: language, finish (`normal`, `holo`, `reverse`) |
| `condition`, `condition_source`, `condition_notes` | A step on Cardmarket's scale, who set it (`model` or `user`), what the model saw |
| `notes` | Free text |
| `price_trend`, `price_avg30`, `price_low`, `price_product_id`, `price_checked_at` | The current price figures in EUR, Cardmarket's product id, when checked |
| `own_price`, `own_price_at` | The price the owner looked up for this copy, and when |
| `created_at`, `updated_at` | Times |

**`photo`**: a file belonging to an owned card. Side (`front` or `back`), file name, thumbnail file name, size, `drive_file_id` and `synced_at`, and for a straightened photo the original as taken: `source_file` and `source_drive_file_id`.

**`drive_trash`**: the Drive file ids of photos of deleted cards, waiting for the next sync to move them to the Drive trash.

**`price_snapshot`**: owned card, day, trend, 30-day average, lowest. One row per card per day.

**`setting`**: key and value. Holds when the catalogue was fetched, and for the sync: the ids of the Drive folders and the sheet, the last run and the last error.

Schema changes go through migrations; `synchronize` is off.

## The scan flow

1. The user opens the Scan page. It shows the back camera (`components/live-camera`, `services/camera.ts`) and looks for the card ten times a second on a 320-pixel copy of the frame (`services/card-finder.ts`); a dashed outline with rounded corners glides to each new position. The round shutter takes the photo (`ImageCapture.takePhoto()` where the browser has it, otherwise the video frame). With "Auto" on (off by default, kept in `localStorage`), the photo is taken once the card has held still for 0.7 seconds, and the next side only after the card was out of sight or its colour changed (`services/capture-trigger.ts`). Without a camera, or by choice ("Manual scan", kept in `localStorage`), the page uses a file input that opens the phone's camera app.
2. The card is looked for again in the full photo. When found, the web app cuts it out and straightens it to 63 by 88 (`services/perspective.ts`) without asking. Otherwise, and for photos from the camera app, the page shows four corners to drag onto the corners of the card (`services/crop-start.ts`), or keeps the whole photo. With the camera in the page, a tap on a side's thumbnail drops it, so the camera takes that side again. The corners found on a 400-pixel copy are then fitted to the card's edges on a 1200-pixel copy (`refineCard`). A straightened front is read at once in the background (`services/card-text-reader.ts`, rules in `card-text.ts`): name, number and language, shown under the photos.
3. As soon as both sides are there, the web app scales each photo to 2400 pixels, makes a 480-pixel thumbnail, and uploads the files without a tap; a failed upload keeps the photos and shows a Save button. The server checks that they are JPEGs, stores them as `<id>-front.jpg`, `<id>-front-thumb.jpg` and so on, and creates an `owned_card` with status `new`.
4. With reading switched on, the card is queued for the model. The upload answers at once; the next card can be scanned.
5. The reading fills in language, finish and condition, and the server looks for catalogue cards that fit. With candidates the status becomes `identified`.
6. Right after the upload the scan page shows the details step (`components/card-details`): the candidates with the best one chosen, a catalogue search, condition, finish and language (the language read, otherwise the one of the previous card; the condition of the previous card). "Next" stores the details and confirms the chosen card (status `confirmed`) and goes back to the camera; "Stop" does the same and opens the collection; without a chosen card both store the details and leave the card unconfirmed, behind a filter in the collection. "Discard" deletes the card and goes back to the camera.
7. Confirming fetches the card's details and sets the price.
8. Twenty seconds after the last change the sync copies what is new to Google, when connected.

A failed reading or a failed lookup leaves the card as it is, with its photos.

## Matching

`core/rules/matching.ts` scores every catalogue card in a pool against a query of name, printed number and set name:

- the number matches (leading zeros and case ignored): 4 points, plus 4 when the printed set total equals the set's card count;
- the name matches exactly: 5 points; partly: 3;
- the set name matches exactly: 3 points; partly: 2.

The pool is every catalogue card with that number or with the name as part of its name. The best eight are offered. Number and set total are the same in every language, so a German or Dutch print finds its English catalogue card.

## Prices

`core/rules/pricing.ts` turns a TCGdex card into the stored `pricing` and picks the figure for a print:

1. the print variant with the same finish, never a 1st edition one, preferring the plain (unlimited) one;
2. for a reverse holo without its own variant: the card's foil figures;
3. otherwise the card's general figure.

The card page says which of the three was used (`priceBasis`: `print`, `foil` or `general`), so a fallback to the general figure is visible.

The value of an owned card is the owner's own price for that copy (`own_price`) when there is one, and the source's trend otherwise. The API returns it as `value` with `valueSource` (`own` or `trend`) next to the source's figures. The link to Cardmarket carries the copy's language and condition as filter (`language`, `minCondition`).

A daily job asks the price of every confirmed card again and writes a snapshot. Card details are kept for 20 hours, so a second request within a day costs nothing.

## Reading photos

`CardReader` sends both photos to Claude with the instructions in `core/connectors/card.reader.ts` and gets back a fixed structure: is it a Pokémon card, name, number, set name, language, finish, confidence, condition, condition notes. Readings run one at a time. With no API key the reader is off: uploads are stored with `reading_state` `none`.

## Google sync

`SyncService.run()`:

1. Find or create the folder path from `DRIVE_FOLDER`, with `photos/` and `backup/` below it and the spreadsheet next to them. The ids are remembered and checked at the start of each run; when a folder was deleted, everything is created again and all photos are uploaded again.
2. Move the photos of deleted cards (`drive_trash`) to the Drive trash; a file that is gone already counts as done.
3. Upload every photo without a Drive file id.
4. Rewrite the values of the tab `Cards` (one row per owned card, with links to its photos and to Cardmarket) and the tab `Prices` (the snapshots).
   Tables the owner made on these tabs are resized to the rows and columns written.
5. Once a night, and on "Copy now": write a consistent copy of the database with `VACUUM INTO` and upload it as `backup/app.db`, replacing the previous one.

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
| `GET /cards`, `POST /cards` | The collection; a new scan as multipart with `front`, `back`, `frontThumb`, `backThumb`, optionally the originals `frontSource` and `backSource`, and optionally the `name` and `number` the phone read, which are looked up in the catalogue at once |
| `GET /cards/:id`, `PATCH /cards/:id`, `DELETE /cards/:id` | One card with candidates and price history; change the print, condition, notes; remove |
| `POST /cards/:id/confirm` | Say which catalogue card it is |
| `POST /cards/:id/read` | Read the photos again |
| `PUT /cards/:id/photos/:side` | Replace one photo, as multipart with `photo` and `thumb`, and `source` for a new original or `keepSource=yes` to keep the stored one; it gets a new photo id, and the sync uploads it over the same file in Drive |
| `GET /photos/:id`, `GET /photos/:id?thumb`, `GET /photos/:id?source` | A photo, its thumbnail, or the original as taken |
| `GET /catalog/search?name=&number=` | Catalogue cards that fit |
| `GET /export/cards.csv` | The collection as CSV |
| `GET /logs?limit=` (owner) | The latest lines of the app's log |
| `GET /google/connect`, `GET /google/callback`, `POST /google/disconnect`, `POST /google/sync` (owner) | The Google Drive copy |
| `POST /csp-reports` (public) | Content policy reports from the browser |

## Web app

| Page | Content |
|---|---|
| Collection | Total value (own prices, the rest at the trend and marked ≈), search on name, number, set and rarity (the field says name or number), sort (date added, name, card number, condition, value, set; condition starts with Mint; cards that lack what is sorted on stay last in both directions) with a `sort` icon button joined to it that turns the direction around (mirrored for ascending) (date added and value start descending, the rest ascending; on number the cards are grouped by set, smaller sets first (`setTotal` in the summary), and sorted by number within a set), filter menus with an icon each on set, condition, language and finish, showing the condition pills, flags and stars (`components/filter-menu`), and a filter on the cards worth grading, a tile per card: a flag for the language, a coloured pill for the condition (a dashed `?` when unknown), a star on holo and reverse holo cards, a rosette on cards worth grading, `×2` when there are more copies of the same catalogue card in the same language. Filters, sort and direction are kept in `localStorage` (`collection-view`), the search is not |
| Scan | Live camera that takes front and back by itself and straightens them, or the phone's camera app with four corners to drag; saved by itself, then the details step: which card, condition, finish, language; then the next card |
| Card | Photos and catalogue picture, opened full screen with previous and next; crop a photo again or take a new one; candidates, catalogue search, the other copies, then condition, finish and language on one line as the same compact menus as the collection filters (a pill, star or flag on the button, the full names in the menu), the notes, then value with a "Browse on Cardmarket" link at its heading, the grading mark, the field for the owner's own price, the source's price with history, delete |
| Settings | What is on and off and why, Google connection, catalogue and prices, the log, export, theme, language, log out |
| Help (tab in the bottom bar) | The conditions with their pills and the finishes, explained, with how to tell holo from reverse holo on old cards |
| Log | The latest lines of the app's log, newest first, refreshed every 5 seconds (owner) |
| Login | The Google button |

State lives in `CollectionStore` (signals). Pages use signals; services return observables. Texts are in `src/assets/i18n/en.json` and `nl.json`.
