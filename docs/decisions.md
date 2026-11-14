# Decisions

Choices that are settled, with the reasoning. Change a decision here first, then in the other documents.

## Product

**One user, one collection.** The owner's own cards, about 100 to 150 of them. No accounts, no sharing, no selling features.

**Front and back are both photographed.** The back says nothing about which card it is, but most wear shows there: white edges and corners. Condition needs both sides.

**Detection suggests, the user decides.** Which card it is, and its condition, are proposals. The user confirms the card with a tap and can overrule the condition. A wrong automatic match would put a wrong value in the collection without anyone noticing.

**Condition is an estimate, not a grading.** A phone photo does not show what a grader sees under a lamp. The app uses Cardmarket's scale (Mint, Near Mint, Excellent, Good, Light Played, Played, Poor) and stores whether the value came from the model or from the user.

**The price is one figure per card.** The price source gives a trend and averages per card, not per condition or per language. The app shows that figure and links to the card on Cardmarket for the rest. Dutch prints and 1st edition or shadowless prints need that manual look.

## Sources

**TCGdex for the catalogue and the prices.** Free, no key, several languages, and its card data carries Cardmarket prices in EUR, refreshed daily. Cardmarket is the relevant market for the Netherlands.

**Not the Cardmarket API.** It is closed to new applicants and meant for professional sellers.

**Not pokemontcg.io as the first source.** It still works, but its makers are moving to a paid successor. It can serve as a fallback for a card TCGdex lacks.

**The catalogue is copied locally.** Matching a scan against the catalogue then needs no network call per candidate, and the app keeps working when the source is down. A failing source must never fail a scan.

## Identification

**Claude vision through the Anthropic API.** The model reads both photos and returns the fields that identify a card. The server then looks those up in the local catalogue. The model never invents a catalogue entry: it reads, the catalogue decides.

**Not local recognition.** Text recognition plus picture matching on the Pi was considered. The old sets carry no set code in text, only a small symbol, and the first set not even that. It would be much more work for a worse result, on a Pi with little memory. Sending photos of trading cards to an API is no privacy concern.

**The cost is no concern at this size.** A few hundred model calls in total.

## Technology

**Same stack and layout as the barcode scanner.** NestJS, TypeORM and SQLite for the API; Angular with TailwindCSS for the web app; Nx workspace; one `app` container that serves the API and the built web app. The owner knows it, and the deployment scripts can be reused. The code style rules of that project apply here too.

**Photos as files, not in the database.** Stored under `data/photos/`, with the path in the database. The database stays small and easy to back up.

**Photos are made smaller on the phone.** A phone photo is 12 megapixels or more. The web app scales it down to about 2400 pixels on the long side before upload: enough to judge condition, quicker over wifi, and light work for the Pi.

**Photo from the phone's own camera app.** The scan page uses a file input that opens the camera. That gives a sharp, full photo with the phone's own focus and flash. A live camera view inside the page is not needed.

## Hosting

**The server Pi, from the start.** The same Raspberry Pi 3B+ that runs the barcode scanner: Debian, Docker, the reverse proxy in front. Memory is tight there, so nothing is built on the Pi and the container gets a memory limit.

**Login with Google for an allowlist.** As in the barcode scanner. The site is reachable from outside the house, so it needs a login.

**A private repository.** The barcode scanner is public, which lets its Pi pull images and scripts without any token. Here the Pi needs read access: see [deployment.md](deployment.md).

## Google sync

**One way: the app writes, Google receives.** The SQLite database is the truth. The sheet and the Drive folder are a readable copy. Changes made in the sheet are overwritten at the next sync. Two-way sync would need conflict rules and validation of whatever was typed into the sheet.

**The sheet is rewritten whole.** At this size, writing all rows again is simpler than tracking which row changed, and it cannot drift.

**The owner's personal Google account, through OAuth.** The owner gives consent once; the server keeps the refresh token in its `data/` folder. A service account cannot be used: it has no storage of its own, so its uploads to a personal Drive are refused.

**The narrowest Drive permission: `drive.file`.** The app only sees files and folders it created itself. It cannot read the rest of the Drive.

**Drive folder.** The owner wants everything under `Documents/~Hobby/Pokémon` in the Drive. With `drive.file` the app cannot write into a folder that already exists. Proposal: the app creates its own folder `Pokémon` at first sync, and the owner moves it into `Documents/~Hobby` once, replacing the empty folder that is there now. The app finds the folder by its id, so moving or renaming it breaks nothing. The alternative is full Drive permission, which lets the app read everything in the Drive. Open until the owner agrees.

**The sync also carries the backup.** A nightly copy of the database goes to the Drive folder. With the photos already there, the Drive holds everything needed to rebuild. No separate backup repository as in the barcode scanner.

**Sync never blocks scanning.** Uploads go through a queue and are retried. Scanning works when Google is unreachable.
