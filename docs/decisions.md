# Decisions

Choices that are settled, with the reasoning. Change a decision here first, then in the other documents.

## Product

**One user, one collection.** The owner's own cards, about 100 to 150 of them. No sharing, no selling features.

**Front and back are both photographed.** The back says nothing about which card it is, but most wear shows there: white edges and corners. Condition needs both sides.

**Detection suggests, the user decides.** Which card it is, and its condition, are proposals. The user confirms the card with a tap and can overrule the condition. A wrong automatic match would put a wrong value in the collection without anyone noticing.

**Everything works without detection.** Reading photos needs an API key that may not be there. Without it, a scan is stored as it is and the user picks the card by searching the catalogue on name and number. The app never depends on the model.

**Condition is an estimate, not a grading.** A phone photo does not show what a grader sees under a lamp. The app uses Cardmarket's scale (Mint, Near Mint, Excellent, Good, Light Played, Played, Poor) and stores whether the value came from the model or from the user. A condition set by the user is never overwritten by a later reading.

**Two copies of a card are two rows.** Each physical card has its own photos, condition and price history.

## Prices

**One figure per print, not per condition or language.** The source gives a trend, a 30-day average and a lowest price per card. Where it lists print variants separately (1st edition, holo, reverse holo), the app takes the figure of the variant that matches the card's finish and 1st edition mark; otherwise the card's general figure. Language is not in any figure, so the card page links to the card on Cardmarket for that. Condition is handled by the app's own estimate, below. Shadowless prints are not told apart.

**The estimated value is the price trend times a factor for the condition.** The source has no price per condition, so the app estimates one:

| Condition | Factor |
|---|---|
| Mint, Near Mint | 100% |
| Excellent | 80% |
| Good | 60% |
| Light Played | 45% |
| Played | 30% |
| Poor | 15% |

The factors are rough rules of thumb for how prices on Cardmarket drop per condition step; they live in `core/rules/pricing.ts` and are meant to be tuned. A card without a condition is valued at the full trend and marked as unknown in the collection, so it is clear that its figure is too high rather than silently guessed. The collection's total, the sort on value, the export and the sheet use the estimate; the trend itself stays visible on the card page.

**The source's figures are stored with the owned card, with a snapshot per day.** The estimate is worked out from them when asked, so changing a factor or a condition needs no stored data to be rewritten. The history shows how the source's price moved.

## Sources

**TCGdex for the catalogue and the prices.** Free, no key, and its card data carries Cardmarket prices in EUR, refreshed daily. Cardmarket is the relevant market for the Netherlands. Checked on 2026-11-14: 221 sets, 23,912 cards, prices present for the old sets, and separate figures for 1st edition prints.

**The English catalogue only.** TCGdex has a Dutch catalogue, but the old sets are missing from it. Cards are matched to the English catalogue card, mostly by number and set total, which are the same in every language. The language is stored on the owned card.

**Not the Cardmarket API.** It is closed to new applicants and meant for professional sellers.

**The catalogue is copied locally; details per card on demand.** The list of sets and cards (id, number, name, picture) is fetched whole and refreshed weekly. Matching a scan then needs no network call. Rarity and prices are fetched per card when it is confirmed and once a day after that. A failing source never fails a scan.

## Identification

**Claude vision through the Anthropic API, with the official SDK.** The model reads both photos and returns name, number, set, language, 1st edition mark, finish and condition in a fixed structure. The server then looks those up in the local catalogue. The model never invents a catalogue entry: it reads, the catalogue decides, the user confirms.

**One reading per card for identity and condition together.** Both need the same two photos; one call is simpler and cheaper than two.

**Claude Opus 5.5 by default**, set with `VISION_MODEL`. At this size the cost is no concern: a few hundred calls in total.

**Not local recognition.** Text recognition plus picture matching on the Pi was considered. The old sets carry no set code in text, only a small symbol, and the first set not even that. It would be much more work for a worse result, on a Pi with little memory.

## Technology

**Same stack and layout as the barcode scanner.** NestJS, TypeORM and SQLite for the API; Angular with TailwindCSS for the web app; Nx workspace; one `app` container that serves the API and the built web app. The owner knows it, and the deployment scripts are reused. The code style rules of that project apply here too.

**The phone makes the photo smaller, and makes the thumbnail.** A phone photo is 12 megapixels or more. The web app scales it to 2400 pixels on the long side and makes a 480-pixel thumbnail, both as JPEG, before upload. The server stores what it receives and checks only that it is a JPEG of a sane size. So the server needs no image library, which saves memory and a native dependency on a Pi that has little to spare.

**Photos as files, not in the database.** Stored under `data/photos/`, with the file name in the database. The database stays small and easy to copy.

**Photo from the phone's own camera app.** The scan page uses a file input that opens the camera. That gives a sharp, full photo with the phone's own focus and flash, and it works without HTTPS. A live camera view inside the page is not needed.

**The web app asks again while a card is being read.** Reading takes some seconds. The collection and the card page poll every few seconds only while a reading is pending. No event stream and no service worker: nothing here needs push or offline use.

## Hosting

**The server Pi, from the start.** The same Raspberry Pi 3B+ that runs the barcode scanner: Debian, Docker, the reverse proxy in front. Memory is tight there, so nothing is built on the Pi and the container has a memory limit.

**A public repository and a public image.** As with the barcode scanner, so the Pi pulls scripts and image without any token. Nothing secret is in either.

**Login with Google for an allowlist.** As in the barcode scanner. The site is reachable from outside the house, so it needs a login before it is put behind the reverse proxy.

## Google sync

**One way: the app writes, Google receives.** The SQLite database is the truth. The sheet and the Drive folder are a readable copy. Changes made in the sheet are overwritten at the next sync.

**The sheet is rewritten whole.** At this size, writing all rows again is simpler than tracking which row changed, and it cannot drift. Values are written as plain text and numbers, never as formulas.

**No job table.** What still has to be copied is known from the data itself: a photo without a Drive file id is waiting. A run uploads those, rewrites the sheet, and once a night copies the database. A failed run is simply repeated; nothing can get stuck in a queue.

**The owner's personal Google account, through OAuth.** The owner gives consent once from the Settings page; the server keeps the refresh token in its `data/` folder. A service account cannot be used: it has no storage of its own, so its uploads to a personal Drive are refused.

**Full Drive access.** The owner wants the copy inside an existing folder, `Documents/~Hobby/Pokémon`. The narrow permission (`drive.file`) only reaches files the app created itself and cannot write into an existing folder, so the app asks for the full `drive` permission. It uses it only to find or create the folder path and to write below it.

**The same OAuth client for login and Drive**, with two redirect addresses. The Google Cloud project must be "In production": in "Testing" a refresh token expires after 7 days, which would stop the sync every week.

**The sync also carries the backup.** A nightly copy of the database goes to the Drive folder. With the photos already there, the Drive holds everything needed to rebuild. No separate backup repository as in the barcode scanner.

**Sync never blocks scanning.** It runs in the background 20 seconds after the last change, and scanning works when Google is unreachable.
