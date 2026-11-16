# Card Scanner

Photograph a Pokémon card, front and back, with a phone. The app keeps the photos, helps to find out which card it is, looks up its value on the European market and keeps the collection in a database. Photos and card details can be copied to Google Drive and a Google Sheet. One user, home use, about 100 to 150 cards.

## What it does

- **Scan**: the automatic scan shows the camera in the page with a dashed outline that follows the card. Tap the round shutter: the card is cut out and straightened by itself, or, when it is not found, you drag its four corners. With "Auto" switched on in the camera frame, the photo is taken once the card holds still, and the back once the card was turned over. With both sides the card is saved by itself. The camera is let go while the app is in the background and opened again on return. The manual scan opens the phone's own camera app instead; the choice is remembered.
- **Identify**: the phone reads the name, the number and the language of a straightened card (Tesseract.js, on the phone, no key). Right after saving, the scan page asks which card it is (the best fit is already chosen), its condition, holo or not, and its language, with the condition and language of the previous card preset; "Next" saves it all and goes back to the camera, "Stop" saves and opens the collection, "Discard" throws the card away. Before the back is taken, a tap on the front's thumbnail takes the front again. The catalogue is a local copy of TCGdex (about 24,000 cards), searched by name and number. With an Anthropic API key, Claude can read the photos as well.
- **Price**: the Cardmarket price in EUR per card, with its own figure for a holo or reverse holo print where the source has one (1st edition prints are never used). Refreshed daily, with a history per card. For the real price of a copy in its condition and language, the card page links to the filtered offers on Cardmarket and takes the price you find there.
- **Collection**: grid with search on name and number, sort with a button for the direction (also on condition, best first, and on card number: grouped by set, the smaller sets first, by number within a set; cards that lack what is sorted on stay last in both directions) and filters on set, condition, language and finish, as icon menus that show the condition pills, flags and stars; markers for language, condition, holo, copies (the same card in the same language) and cards that may be worth grading; the filters, sort and direction are kept for the next visit; total value, a page per card, a filter for cards that are not confirmed yet, export as CSV, a help page that explains the conditions and finishes, a log page for the owner.
- **Google**: once connected, photos go to a Drive folder, the collection to a sheet, and a copy of the database follows nightly. Photos of a deleted card go to the Drive trash. One way: the app writes, Google receives.
- **Phone**: installable on the home screen, light and dark theme, Dutch and English.

With login on, an account can be let in to look only (`VIEWER_EMAILS`): it sees the collection and the cards, and can scan or change nothing.

Three things are built but switched off until their settings exist on the server: login with Google, reading photos with Claude, and the Google Drive copy. The Settings page shows which are on. What is still needed for each is in [docs/plan.md](docs/plan.md).

## How it is built

| Part | Directory | Stack |
|---|---|---|
| API | `apps/card-api/` | NestJS, TypeORM, SQLite; layered into `api`, `core`, `data`, `config` |
| Web app | `apps/card-front/` | Angular 22, TailwindCSS |
| Deployment | `deployment/` | Docker Compose, systemd timer, shell scripts |

On the Pi one container runs: the API plus the built web app, with the SQLite file and the photos on a volume. A reverse proxy in front provides HTTPS.

The set-up follows the barcode scanner project (`www-nodejs-barcodescanner`): same stack, same layering, same pull-based deployment.

## Documentation

| Document | Content |
|---|---|
| [docs/plan.md](docs/plan.md) | What is done, what waits for the owner, what was never tested |
| [docs/decisions.md](docs/decisions.md) | Feature and technology choices, with the reasoning |
| [docs/architecture.md](docs/architecture.md) | Parts, data model, the scan flow, identification, prices, Google sync, API |
| [docs/deployment.md](docs/deployment.md) | Raspberry Pi setup, settings, reverse proxy, Google Cloud, Anthropic key |

## Development

Needs Node.js 24 or newer and Yarn 4. The image and the build run Node 25.

```bash
yarn install
yarn card-api:serve                # API on port 3030
yarn card-front:serve              # web app on port 4200, talks to the API on 3030
yarn lint:all
yarn card-api:test                 # matching, prices, the collection table, session signing
yarn card-api:test:integration     # the whole app over HTTP against a temporary SQLite file, a fake catalogue and a fake Google
yarn card-front:test               # the web app's logic and pages, without a browser
yarn e2e                           # builds both apps, starts them with an empty database and a fake catalogue, drives them in headless Chrome
```

The API keeps its data in `data/` by default: `app.db`, `photos/`, and later the session secret and the Google token. `DATABASE_PATH` moves all of it. At first start the API fetches the catalogue from TCGdex, which takes a few seconds. `GET /api/v1/health` reports the status and the running version (`dev` locally).

Locally everything works without any key: login is off, cards are picked by hand.

## Deployment in short

A push to `master` builds a `linux/arm64` image on GitHub Actions and publishes it to `ghcr.io`. A timer on the Pi checks every minute whether the registry has a new image and pulls it when so. First install on a Pi:

```bash
curl -fsSLO https://raw.githubusercontent.com/Cerbrus/card-scanner/master/deployment/install.sh
sudo bash install.sh
```

Details and settings are in [docs/deployment.md](docs/deployment.md). Nothing secret is in this repository or in the image: settings live in `.env` on the Pi, the database, photos, keys and tokens in its `data/` folder.
