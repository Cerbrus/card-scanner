# Notes for the Dependabot reviewer

Read by the shared reviewer of [Cerbrus/workflows](https://github.com/Cerbrus/workflows), which holds the instructions. This file only says what is specific to this repository.

## What the pull request's checks cover

The build workflow ran lint, tests, the browser tests and the arm64 image build with its start-up check, without publishing. It could not cover publishing the image, the tag and release job, or anything else that only runs on `master`.

## Where updates can matter

- The `Dockerfile` and the workflow files.
- `project.json`, including the asset globs that copy the ONNX Runtime Web file and the text model into `ocr/`.
- `nx.json`.
- The Playwright configuration in `e2e/`.
- The ESLint and TypeScript configuration.

## Product behaviour to think of

- Matching scans to the catalogue.
- Prices and the price history.
- The database and its migrations.
- Login and the session cookie.
- The Google Drive and Sheets copy.
- Reading photos with the Anthropic SDK.
- Reading name and number on the phone with ONNX Runtime Web.
- Finding and straightening the card on a canvas.
- The automatic reload after a release.
- The deployment on a Raspberry Pi 3 (arm64, little memory).

## Install and checks

Install with `yarn install --immutable`; if the lock file is out of date, `yarn install`. Then run what the build runs:

- `yarn lint:all`
- `yarn card-api:test`
- `yarn card-api:test:integration`
- `yarn card-front:test`
- `yarn e2e` (builds both apps and drives them in Chrome)

## Off limits

Do not touch `deployment/` or anything under `data/`.

## To try by hand

On the phone or the Pi.
