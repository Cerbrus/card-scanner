# Plan

What is done, what waits for the owner, and what was never tested. When something is finished, mark it with date and time (`done 2026-11-14 15:55`).

## Needs the owner

Everything below is built. Each item is switched off, or not reachable, until the owner does his part. The steps are in [deployment.md](deployment.md).

| # | What | Until then | To do |
|---|---|---|---|
| 1 | **Google Cloud project** (login and Drive) | Login is off: the app is open on the home network. The Drive copy is off. | Create the project and OAuth client, fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_URL`, `ALLOWED_EMAILS` in `/opt/cardscanner/.env`, restart |
| 2 | **Reverse proxy host** for the site's name | The site is only reachable on the home network, at the Pi's address and port 3030, over plain HTTP | Add the proxy host in Nginx Proxy Manager, after item 1 or with an access list. Then set `ALLOWED_SOURCE`. |
| 3 | **Connect Google Drive** | Nothing is copied to Drive or the sheet | After items 1 and 2: Settings page, Connect Google Drive |
| 4 | **Anthropic API key** | Photos are not read: each card is picked by hand from the catalogue | Put `ANTHROPIC_API_KEY` in `.env`, restart |

Also open for the owner to decide:

- Dependabot is set up as in the barcode scanner. It opened its first nine pull requests right after the first push, several of them major versions; none is merged. The Claude review helper of that project is not copied: it needs the secret `CLAUDE_CODE_OAUTH_TOKEN` in this repository.
- The branch ruleset `protect-master` of the barcode scanner (no force-push, no deletion) is not set here.

## Never tested

- **Reading photos with the real model.** The call is written against the Anthropic SDK and type-checked; the flow around it is tested with a stand-in reader. No API key was available, so no real photo has been read yet. The instructions for the model in `card.reader.ts` are a first version.
- **The real Google Drive and Sheets.** The sync is tested against a fake Google that answers like the real one for the calls used. Consent, folder lookup in a real Drive, upload and sheet writing have not run against Google.
- **Login with Google** in this app. The code is the barcode scanner's, where it works; the routes are tested with signed sessions.
- **The scan page on a real phone**: opening the camera, the size and quality of the scaled photos, rotation of portrait photos.
- **Condition estimates**: whether the model's judgement from phone photos is useful at all.
- **The filtered Cardmarket link for other languages than Dutch.** The owner checked on 2026-11-15 that Cardmarket keeps the filter when it forwards from the product id to the product page (Dutch, Excellent). The language numbers for the other languages come from memory and are not checked.
- **Dutch and other non-English prints**: found through number and set total in tests with made-up readings; not tried with real cards.
- **`install.sh` on a fresh Pi.** On the server Pi it ran fine, but Docker and the memory settings were already there.
- **A restore** from the Drive copy.

## Done

### Milestone 1: skeleton

- [x] Nx workspace with `card-api` and `card-front`, structure taken from the barcode scanner (done 2026-11-14 15:55)
- [x] Health endpoint with version (done 2026-11-14 15:55)
- [x] Login with Google for an allowlist; off until configured (done 2026-11-14 15:55)
- [x] Dockerfile, compose file, build workflow, install, update and firewall scripts (done 2026-11-14 15:55)
- [x] Running on the server Pi: installed with `install.sh`, the Pi pulled version 0.1.0 by itself, health check green, about 110 MB of memory in use (done 2026-11-14 16:05)
- [x] Reachable on the home network at the Pi's address, port 3030: scan upload, catalogue search, confirm, price, CSV and the pages checked from a laptop (done 2026-11-14 16:05)
- [ ] Behind the reverse proxy with HTTPS: waits for the owner, item 2

### Milestone 2: capture

- [x] Scan page: front photo, back photo, save (done 2026-11-14 15:55)
- [x] Photos made smaller on the phone, with a thumbnail, stored on disk (done 2026-11-14 15:55)
- [x] Collection page: grid of the cards with their front photo (done 2026-11-14 15:55)
- [x] Card page: both photos, details editable, delete (done 2026-11-14 15:55)

### Milestone 3: identification

- [x] Local copy of the TCGdex catalogue, fetched at first start and weekly (done 2026-11-14 15:55)
- [x] Search by name and number, best fit first; tap to confirm (done 2026-11-14 15:55)
- [x] Inbox with the cards that are not confirmed (done 2026-11-14 15:55)
- [x] Reading photos with Claude: name, number, set, language, 1st edition, finish; candidates offered. Off until a key is set, item 4 (done 2026-11-14 15:55)

### Milestone 4: prices

- [x] Cardmarket price per card from TCGdex, with its own figure per print variant (done 2026-11-14 15:55)
- [x] Daily refresh and a snapshot per day (done 2026-11-14 15:55)
- [x] Value per card and total value of the collection (done 2026-11-14 15:55)
- [x] Link to the card on Cardmarket (done 2026-11-14 15:55)
- [x] Own price per copy, looked up through a Cardmarket link filtered on the copy's language and condition; the total, sort, export and sheet use it, and cards without one are marked (done 2026-11-15 00:05). Replaces the factor per condition of 2026-11-14.

### Milestone 5: condition

- [x] Condition on Cardmarket's scale, set by hand (done 2026-11-14 15:55)
- [x] Estimate by the model in the same reading, with notes; never overwrites the user's choice. Off until a key is set, item 4 (done 2026-11-14 15:55)

### Milestone 6: Google sync

- [x] Consent from the Settings page, owner only (done 2026-11-14 15:55)
- [x] Photos to `photos/`, the collection to the sheet (tabs `Cards` and `Prices`), nightly database copy to `backup/` (done 2026-11-14 15:55)
- [x] State, last error and "Copy now" on the Settings page; a failed run catches up (done 2026-11-14 15:55)
- [ ] Running against the real Google: waits for the owner, items 1 to 3

### Milestone 7: comfort

- [x] Search and sort in the collection (done 2026-11-14 15:55)
- [x] Markers on each card in the collection: flag for the language, coloured pill for the condition, a mark when unknown, a star for holo and reverse holo (done 2026-11-14 23:29)
- [x] The card page says whether the price is the print's own, the foil figure or the card's general one (done 2026-11-14 23:29)
- [x] Export as CSV (done 2026-11-14 15:55)
- [x] Dutch and English, light and dark theme, installable on the home screen (done 2026-11-14 15:55)

## Open

- A mark on cards that may be worth grading (high value, good condition).
- Count of duplicates of the same catalogue card.
- Filter the collection by set, condition or language.
- A chart of the collection's value over time; the snapshots are there.
- Crop and straighten the photo on the phone.
- Remove a card's photos from Drive when the card is deleted; now they stay there.
- Tests in a real browser, as the barcode scanner has.
- A system log page, as the barcode scanner has; the log is written to `data/logs/app.log`.

## Checked before building

- TCGdex returns Cardmarket prices for the old sets, and separate figures for 1st edition prints (checked 2026-11-14 with Base Set Charizard).
- TCGdex's Dutch catalogue lacks the old sets, so the English catalogue is used.
- The whole catalogue (221 sets, 23,912 cards) loads into SQLite in about a second on a laptop and in 8 seconds on the Pi.
- GitHub's ARM build runners are free for a public repository.
