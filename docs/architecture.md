# Architecture

The design as planned. Nothing is built yet; adjust this document as the code arrives.

## Parts

```
phone browser  --HTTPS-->  reverse proxy  -->  app container on the server Pi
                                                |-- NestJS API  (/api/v1/...)
                                                |-- built Angular app
                                                |-- SQLite      (/data/app.db)
                                                `-- photos      (/data/photos/)

app container  -->  Anthropic API   (read the photos)
               -->  TCGdex          (catalogue, prices)
               -->  Google Drive and Sheets (copy of photos and data)
```

| Part | Directory | Stack |
|---|---|---|
| API | `apps/card-api/` | NestJS, TypeORM, SQLite; layers `api`, `core`, `data`, `config` |
| Web app | `apps/card-front/` | Angular, TailwindCSS |
| Deployment | `deployment/` | Docker Compose, systemd timer, shell scripts |

## Data model

**`catalog_set`**: a set from the catalogue. Id, name, series, release date, symbol picture, card count.

**`catalog_card`**: a card from the catalogue. Id, set, number, name, rarity, picture, the variants it exists in (normal, holo, reverse holo, 1st edition), the current price fields and when they were fetched.

**`owned_card`**: one physical card in the collection.

| Field | Meaning |
|---|---|
| `id` | Own id |
| `catalog_card_id` | The catalogue card; empty while unidentified |
| `status` | `new`, `identified`, `confirmed` |
| `language` | Language of the print |
| `variant` | Normal, holo, reverse holo |
| `first_edition` | Yes or no |
| `condition` | A step on Cardmarket's scale; may be empty |
| `condition_source` | `model` or `user` |
| `condition_notes` | What the model saw |
| `notes` | Free text |
| `created_at`, `updated_at` | Times |
| `synced_at` | When this card last reached the sheet |

Two copies of the same card are two rows. That keeps a photo and a condition per physical card.

**`photo`**: a file belonging to an owned card. Side (`front` or `back`), path under `data/photos/`, width, height, `drive_file_id`, `synced_at`.

**`identification`**: one reading by the model. The owned card, the fields the model returned, the candidates the server found with their score, and the time. Kept so a wrong match can be traced.

**`price_snapshot`**: catalogue card, date, trend price and averages in EUR. One row per card per day at most.

**`sync_job`**: the queue for Google. What to do (upload a photo, rewrite the sheet, copy the database), state, attempts, last error.

**`setting`**: key and value. Holds the ids of the Drive folder and the sheet.

Schema changes go through migrations; `synchronize` is off.

## The scan flow

1. The user opens the scan page and takes the front photo, then the back photo.
2. The web app scales both down and uploads them. The server stores the files and creates an `owned_card` with status `new`.
3. The server asks the model to read the photos (next section) and looks for candidates in the catalogue.
4. The web app shows the candidates with their reference picture next to the user's own photo. The user taps the right one: status `confirmed`. No fit: search by name or number, or leave the card in the inbox.
5. Price and condition follow by themselves once the card is known.
6. The sync queue gets its jobs.

Steps 3 and later do not hold up the user: after step 2 the next card can be scanned.

## Identification

The model gets both photos and answers in a fixed structure:

- name as printed
- card number and set total as printed (`4/102`), when present
- set, as far as the model can tell from symbol and layout
- language
- 1st edition mark: yes or no
- holo, reverse holo or neither
- how sure it is

The server then searches the local catalogue: first on number plus set total, then on name within the likely sets. Candidates are ranked; the model's answer is never stored as the truth without a catalogue match and the user's tap.

A failed model call or a failed lookup leaves the card as `new`. It never loses the photos.

## Condition

A second question to the model, with both photos: which step on Cardmarket's scale, and why. The answer is stored with `condition_source = model`. A change by the user sets it to `user`, and the model's later runs leave it alone.

## Prices

A daily job fetches the price of every catalogue card that is owned and writes a `price_snapshot`. The collection's value is the sum of the latest price per owned card. The card page shows the figure, its date, and a link to the card on Cardmarket.

## Google sync

- **Photos**: uploaded once each to `photos/` in the Drive folder, named after the owned card's id and the side.
- **Sheet**: tab `Cards` with one row per owned card: name, set, number, language, variant, 1st edition, condition, condition source, price, price date, date added, links to both photos, link to Cardmarket. Tab `Prices` with the snapshots. Rewritten whole.
- **Database**: a nightly copy to `backup/` in the Drive folder.
- Everything goes through `sync_job`, one at a time, with retries. The settings page shows the queue's state.

## Web app pages

| Page | Content |
|---|---|
| Scan | Two photos, then straight on to the next card |
| Inbox | Cards waiting for a confirmation |
| Collection | Grid with photo, name, value; filter and sort; total value |
| Card | Photos, catalogue picture, all fields, price history, links |
| Settings | Google connection, sync state, catalogue refresh, version |

## Rules carried over from the barcode scanner

- Controller calls service, service uses TypeORM directly. Imports point inward: `api` to `core` to `data`.
- Settings are read through one config class.
- An outside source that fails must never fail a scan.
- No secrets in the repository or the image. Settings live in `.env` on the Pi, keys and tokens in its `data/` folder.
- Signals over observables in components; every visible text in English and Dutch.
