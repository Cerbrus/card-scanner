# Card Scanner

Photograph a Pokémon card, front and back, with a phone. The app works out which card it is, estimates its condition, looks up its value on the European market and keeps the collection in a database. Photos and card details are copied to Google Drive and a Google Sheet. One user, home use, about 100 to 150 cards.

Nothing is built yet. This repository holds the plan.

## Documentation

| Document | Content |
|---|---|
| [docs/plan.md](docs/plan.md) | Milestones, what is done and what is open |
| [docs/decisions.md](docs/decisions.md) | Feature and technology choices, with the reasoning |
| [docs/architecture.md](docs/architecture.md) | Parts, data model, the scan flow, identification, prices, Google sync |
| [docs/deployment.md](docs/deployment.md) | How it will run on the server Pi, and what differs from the barcode scanner |

## In short

| Part | Choice |
|---|---|
| API | NestJS, TypeORM, SQLite |
| Web app | Angular, TailwindCSS, installable on the phone |
| Identification and condition | Claude vision through the Anthropic API |
| Card catalogue and prices | TCGdex (Cardmarket prices in EUR) |
| Sync | One way, from the app to Google Drive and a Google Sheet |
| Runs on | The server Pi, as one Docker container behind the reverse proxy |

The set-up follows the barcode scanner project (`www-nodejs-barcodescanner`): same stack, same layering, same pull-based deployment.
