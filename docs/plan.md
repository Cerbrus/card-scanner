# Plan

Milestones in the order they will be built. Each one leaves a working app. When something is finished, mark it with date and time (`done 2026-11-14 15:30`).

Status on 2026-11-14: planning. No code yet.

## To check before building

These are assumptions the plan rests on. Each one is a short test.

- [ ] TCGdex has Dutch card data: request `/v2/nl/cards` and a few known old cards. If Dutch is missing, Dutch prints are matched to the English card and the language is stored on the owned card only.
- [ ] TCGdex returns a Cardmarket price for cards from the old sets (Base, Jungle, Fossil, Team Rocket, Neo). Its FAQ says some cards have no price.
- [ ] How TCGdex tells 1st edition, shadowless and unlimited prints apart, if at all.
- [ ] A Google OAuth app with the `drive.file` scope can be set to "In production" without Google's verification, so its refresh token does not expire after 7 days.
- [ ] GitHub's ARM build runners are available to a private repository on the free plan. If not: build with emulation, or make the repository public.
- [ ] The image library (`sharp`) stays within the container's memory limit on the Pi when it resizes a phone photo.

## Milestone 1: skeleton

- [ ] Nx workspace with `card-api` (NestJS, TypeORM, SQLite) and `card-front` (Angular, TailwindCSS), copied in structure from the barcode scanner
- [ ] Health endpoint with version
- [ ] Login with Google for an allowlist, as in the barcode scanner
- [ ] Dockerfile, compose file, build workflow, install and update scripts
- [ ] Running on the server Pi behind the reverse proxy, reachable from the phone

## Milestone 2: capture

- [ ] Scan page: take the front photo, take the back photo, save
- [ ] Photos are made smaller on the phone before upload and stored on the Pi's disk
- [ ] Collection page: a grid of the owned cards with their front photo
- [ ] Card page: both photos, all fields editable by hand, delete

After this milestone the app is a usable photo catalogue, without any automatic detection.

## Milestone 3: identification

- [ ] Local copy of the TCGdex catalogue (sets and cards), refreshed on request
- [ ] After a scan, Claude reads both photos and returns name, card number, set, language, edition mark, holo or not
- [ ] The server matches that against the catalogue and offers the best candidates with their reference picture
- [ ] The user confirms one with a tap, or searches by hand when none fits
- [ ] A scan that could not be matched waits in an inbox

## Milestone 4: prices

- [ ] Cardmarket price from TCGdex stored per catalogue card, refreshed daily
- [ ] A price snapshot per day, so the value over time can be shown
- [ ] Value per card and total value of the collection
- [ ] A link per card that opens it on Cardmarket, for the price per condition and language

## Milestone 5: condition

- [ ] Claude judges the condition from both photos on Cardmarket's scale and names what it saw (edge wear, scratches, creases)
- [ ] The result is stored as a suggestion; the user can overrule it, and the card remembers which of the two it is
- [ ] A mark on cards that may be worth grading

## Milestone 6: Google sync

- [ ] Consent for Drive once, from the settings page
- [ ] Photos are uploaded to the Drive folder; each photo remembers its Drive file
- [ ] The sheet is rewritten after changes: one row per owned card, a second tab with the price history
- [ ] A nightly copy of the database goes to Drive
- [ ] Sync status on the settings page, with a button to run it now; a failed upload is retried

## Milestone 7: comfort

- [ ] Quick mode: scan card after card, processing happens in the background
- [ ] Filter and sort the collection (set, value, condition, language)
- [ ] Count of duplicates
- [ ] Export as CSV

## Open questions for the owner

- The Drive folder: see "Drive folder" in [decisions.md](decisions.md). The app cannot write into a folder it did not create, so the proposal is that the app creates the folder and the owner moves it into place once.
- The address of the site (a subdomain behind the reverse proxy).
- One Google Cloud project shared with the barcode scanner, or a new one. Proposal: a new one.
