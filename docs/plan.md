# Plan

What is done, what waits for the owner, and what was never tested. When something is finished, mark it with date and time (`done 2026-11-14 15:55`).

## Needs the owner

Everything below is built. Each item is switched off, or not reachable, until the owner does their part. The steps are in [deployment.md](deployment.md).

| # | What | Until then | To do |
|---|---|---|---|
| 1 | **Consent screen in production** | The Google Cloud project is set up, but its consent screen is in "Testing" with the owner as test user. Google ends the Drive consent after 7 days; then the copy stops with an error until the owner connects again. | Audience page: Publish app. Not for now (owner, 2026-11-15): reconnect weekly. |

Also open for the owner to decide:

- Dependabot and its Claude reviewer are set up as in the barcode scanner (2026-11-15), with the secret and the Claude GitHub App in place; its first review ran on 2026-11-15.
- The branch ruleset `protect-master` is set (done 2026-11-16 18:32): on `master` no deletion, no force-push, and only the repository admin may push. A workflow token can no longer change the scripts the Pi fetches from `master`; the Dependabot reviewer pushes to Dependabot branches only and the build pushes tags only.
- The Dependabot reviewer still installs the proposed packages in the job that holds the Claude token (review of 2026-11-16, finding 29). Not decided.

## Never tested

- **Reading photos with the real model.** The call is written against the Anthropic SDK and type-checked; the flow around it is tested with a stand-in reader. No API key was available, so no real photo has been read yet. The instructions for the model in `card.reader.ts` are a first version.
- **The scan page on a real phone**: opening the camera, the size and quality of the scaled photos, rotation of portrait photos.
- **Condition estimates**: whether the model's judgement from phone photos is useful at all.
- **The filtered Cardmarket link for other languages than Dutch.** The owner checked on 2026-11-15 that Cardmarket keeps the filter when it forwards from the product id to the product page (Dutch, Excellent). The language numbers for the other languages come from memory and are not checked.
- **Dutch and other non-English prints**: found through number and set total in tests with made-up readings; not tried with real cards.
- **`install.sh` on a fresh Pi.** On the server Pi it ran fine, but Docker and the memory settings were already there.
- **A restore** from the Drive copy.
- **Crop and straighten on a real phone**: dragging the corners with a finger, and the time the straightening takes on a 12-megapixel photo. Tested in desktop Chrome with a made-up photo.
- **Moving photos to the Drive trash** against the real Drive; tested with the fake Google.
- **Reading name and number from real phone photos.** On the owner's 58 photographed fronts on 2026-11-16 (Base Set, Jungle, Fossil): names right on all but 2 not read (an Energy card and a Jigglypuff) and Venonat read as "Yenonat" twice; numbers 48 right, 0 wrong, 10 not read, mostly holo cards. About 0.5 seconds per card in desktop Chrome. Earlier: tried on the catalogue pictures of eight Base Set and Jungle cards (600 pixels wide, sharper photos are expected from a phone): all seven Pokémon names right, five of seven numbers right and none wrong, about one second per card in desktop Chrome. Trainer and Energy cards, newer layouts and Dutch prints are not tried; the time on a phone is not known. First real card from the owner's phone (Fossil Dragonite): number right, name wrong; right after the change of 2026-11-15 21:30.
- **The camera in the page on a real phone**: the sharpness of its photos against the camera app, `ImageCapture` on the owner's phone, how fast the card is found per frame, and, with "Auto" on, whether turning the card over always takes the back. Quality of the photos checked by the owner on 2026-11-16: fine. Tested in headless Chrome with a fake camera playing a made-up card.
- **Finding the card in real photos.** The line detection was tried on nine of the owner's uncropped photos on a dark mat: the seven where the whole card is in the photo got their outer edges, fronts and backs; the two where the card fills the photo got an outline along the photo's edge. Not tried on a light or busy table, or with a shiny sleeve, and not timed on a phone.

## Done

### Milestone 1: skeleton

- [x] Nx workspace with `card-api` and `card-front`, structure taken from the barcode scanner (done 2026-11-14 15:55)
- [x] Health endpoint with version (done 2026-11-14 15:55)
- [x] Login with Google for an allowlist; off until configured (done 2026-11-14 15:55)
- [x] Dockerfile, compose file, build workflow, install, update and firewall scripts (done 2026-11-14 15:55)
- [x] Running on the server Pi: installed with `install.sh`, the Pi pulled version 0.1.0 by itself, health check green, about 110 MB of memory in use (done 2026-11-14 16:05)
- [x] Reachable on the home network at the Pi's address, port 3030: scan upload, catalogue search, confirm, price, CSV and the pages checked from a laptop (done 2026-11-14 16:05)
- [x] Behind the reverse proxy with HTTPS, login with Google for the owner's account (done 2026-11-15 17:56)
- [x] `ALLOWED_SOURCE` set to the proxy: the port answers only the proxy and the Pi itself (done 2026-11-15 19:05)

### Milestone 2: capture

- [x] Scan page: front photo, back photo, save (done 2026-11-14 15:55)
- [x] Photos made smaller on the phone, with a thumbnail, stored on disk (done 2026-11-14 15:55)
- [x] Crop and straighten each photo on the phone: four corners dragged onto the card, or the whole photo kept (done 2026-11-15 17:20)
- [x] Corner dragging after the owner's first try on a phone: no text selection while dragging, a magnifier in the opposite corner shows what is under the finger, thin dashed lines and small open corners (done 2026-11-15 19:05)
- [x] Crop a stored photo again, or take a new one, from the card page (done 2026-11-15 19:05)
- [x] Magnifier as a large rounded square in the top left, in the top right while the top-left corner is dragged (done 2026-11-15 19:45)
- [x] The crop starts with the corners on the card, otherwise the corners of the previous crop, otherwise the middle (done 2026-11-15 21:30). First by colour; replaced by edge and line detection after the owner found it inaccurate on real cards (done 2026-11-15 22:40)
- [x] The original photo is kept next to the straightened one, copied to Drive, and used when a photo is cropped again (done 2026-11-15 22:40)
- [x] Scan instructions and the crop hint removed to save space (done 2026-11-15 21:30)
- [x] Name read from the tallest words the engine is sure of on the name line, after the owner's Dragonite came out as "ByagoR" (done 2026-11-15 21:30)
- [x] Collection page: grid of the cards with their front photo (done 2026-11-14 15:55)
- [x] Card page: both photos, details editable, delete (done 2026-11-14 15:55)
- [x] Photos open full screen, with previous and next (buttons, swipe, arrow keys) and a close button, instead of opening the file (done 2026-11-15 19:05)

### Milestone 3: identification

- [x] Local copy of the TCGdex catalogue, fetched at first start and weekly (done 2026-11-14 15:55)
- [x] Search by name and number, best fit first; tap to confirm (done 2026-11-14 15:55)
- [x] Inbox with the cards that are not confirmed (done 2026-11-14 15:55); replaced by the details step on the scan page and a filter in the collection (done 2026-11-15 23:10)
- [x] Details step right after the scan: which card (best fit chosen), condition, finish, language; one tap to save and go to the next card (done 2026-11-15 23:10)
- [x] The language read from the weakness line of the straightened front (done 2026-11-15 23:10)
- [x] Fewer taps per card: the camera in the scan page takes front and back by itself once the card holds still, straightens a card it finds without asking, saves once both sides are there, and the details step starts from the previous card's condition and language. The phone's camera app stays as a choice (done 2026-11-16 00:21)
- [x] The owner takes the photo with a round shutter in the camera frame; taking it by itself is a switch there, off by default. Dashed outline with rounded corners that glides along with the card; the read line under the camera; "Automatic scan" and "Manual scan"; crop lines stop at the corner circles; "Discard" in the details step (done 2026-11-16 01:05)
- [x] Details step buttons "Next", "Stop" (save and open the collection) and "Discard", green and red; a tap on the front's thumbnail takes the front again (done 2026-11-16 01:25)
- [x] Reading the number from real photos: the strip moved up to where the number sits on the owner's cards, stops before the rarity symbol, and the text is made black against its own surroundings instead of one threshold for the strip; the corners are fitted to the edges on a larger copy. On the owner's 38 straightened fronts: 24 numbers right, 2 wrong, 12 not read, was 13 right (done 2026-11-16 01:25)
- [x] Name read from four strips at different heights, keeping the one the engine is surest of, so Stage cards with the "Evolves from" line and the stage icon are read as well as Basic cards; on the owner's 42 fronts 37 names right, was 31 (done 2026-11-16 01:59)
- [x] Name strips at 50 pixels instead of 140, and number strips with more room on the left and a speckle filter; Fossil numbers are read now (done 2026-11-16 02:25)
- [x] The Pi checks for a new image every minute and only pulls when the registry's digest differs from the running one (done 2026-11-16 01:25)
- [x] Reading photos with Claude: name, number, set, language, finish; candidates offered. Off until a key is set; the owner will not set one (done 2026-11-14 15:55)
- [x] Reading name and number on the phone with Tesseract.js from fixed strips of the straightened front; the details step after the scan starts with the catalogue cards that fit, and the search fields filled in (done 2026-11-15 20:40)

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
- [x] The photos of a deleted card go to the Drive trash on the next run (done 2026-11-15 17:20)
- [x] The owner's table on the `Cards` tab keeps its layout and is resized to the rows and columns after each write; checked against the real sheet on a temporary copy (done 2026-11-15 18:40)
- [x] Running against the real Google: consent given, first copy of 12 photos, 6 rows and the database (done 2026-11-15 18:02)

### Milestone 7: comfort

- [x] Search and sort in the collection (done 2026-11-14 15:55)
- [x] Filters, sort and direction kept for the next visit; a button for the sort direction; the search field with an icon (done 2026-11-16 02:47)
- [x] Card page: condition, finish and language on one line as the compact filter menus, above the value; "Browse on Cardmarket" as a link at the value heading (done 2026-11-16 03:25)
- [x] Copies counted per catalogue card and language (done 2026-11-16 02:47)
- [x] Help page for conditions and finishes, a tab in the bottom bar (done 2026-11-16 02:47)
- [x] The 1st edition mark removed everywhere, with a migration that drops the column and a sync that drops the sheet column (done 2026-11-16 02:47)
- [x] Filter on finish, the filters as icon menus with pills, flags and stars, and a sort on card number, grouped by set with the smaller sets first (done 2026-11-16 02:30)
- [x] Markers on each card in the collection: flag for the language, coloured pill for the condition, a mark when unknown, a star for holo and reverse holo (done 2026-11-14 23:29)
- [x] The card page says whether the price is the print's own, the foil figure or the card's general one (done 2026-11-14 23:29)
- [x] Filter the collection by set, condition and language, also on "not known", and on the cards worth grading (done 2026-11-15 17:20)
- [x] Count of the copies of the same catalogue card on the tile, and links to the other copies on the card page (done 2026-11-15 17:20)
- [x] A mark on copies that may be worth grading: worth €50 or more and Near Mint or better; also a column in the sheet and the CSV (done 2026-11-15 17:20)
- [x] Export as CSV (done 2026-11-14 15:55)
- [x] Dutch and English, light and dark theme, installable on the home screen (done 2026-11-14 15:55)
- [x] The open app reloads itself when a new version is published, as the barcode scanner does: checked when it comes back to the screen and every minute, never while cropping, scanning or typing (done 2026-11-15 19:45)

### Milestone 8: upkeep

- [x] Review of 2026-11-16, findings 1 to 7: a stored card is never offered for saving again, a photo keeps the side it was taken for, the card page starts clean on another copy, a failed photo upload keeps the crop, the updater repeats a compose change that failed halfway, unknown values sort last in both directions, filter menus stay on a narrow screen (done 2026-11-16 17:45)
- [x] Review of 2026-11-16, findings 8 to 28: the camera rests while paused and in the background, a photo that never comes falls back to the video frame, a failed price or note stays marked as not saved, changes go one after another, filter menus work from the keyboard, crossed crop corners are put in order, upright edges are found once, the step that dropped the "1st edition" sheet column is gone (done 2026-11-16 18:25)
- [x] Tests in a real browser (Playwright with the installed Chrome) in the build: scan with straightening, confirm, filters, copies, grading mark, log, delete (done 2026-11-15 17:20)
- [x] Log page for the owner, from the Settings page (done 2026-11-15 17:20)

## Open

- The findings of the review of 2026-11-16, in [review-2026-11-16.md](review-2026-11-16.md): all fixed or dropped (done 2026-11-16 18:25), except finding 29, the rights of the Dependabot reviewer, which is decided in the barcode scanner first.
- A chart of the collection's value over time; the snapshots are there. Not wanted for now (2026-11-15).
- If the photos from the camera in the page disappoint: back to the phone's camera app, and open it by itself for the front when the scan page opens and for the back after the front is cropped. A browser only opens a file input from a tap, so the back can follow the crop button's tap; the front on page open needs checking on the phone.

## Package upgrades

- Done 2026-11-15 21:45, in place of Dependabot #2, #3, #5, #6, #8 and #9 and as in the barcode scanner: class-validator 0.15, tslib 2.9, ESLint 10 with `eslint-plugin-import-x` in place of `eslint-plugin-import`, jsonc-eslint-parser 3, eslint-import-resolver-typescript 4, ngx-translate 18 (`TranslatePipe`, `provideTranslateService`, specs through `TranslateTesting`), NestJS 12 and TypeORM 1 with an own snake case naming strategy in place of `typeorm-naming-strategies`.
- Blocked as in the barcode scanner: TypeScript 7 (#7; Angular 22's compiler and typescript-eslint accept TypeScript below 6.1 only), better-sqlite3 13 (#4; TypeORM 1 accepts up to 12).

## Checked before building

- TCGdex returns Cardmarket prices for the old sets, and separate figures for 1st edition prints (checked 2026-11-14 with Base Set Charizard).
- TCGdex's Dutch catalogue lacks the old sets, so the English catalogue is used.
- The whole catalogue (221 sets, 23,912 cards) loads into SQLite in about a second on a laptop and in 8 seconds on the Pi.
- GitHub's ARM build runners are free for a public repository.
