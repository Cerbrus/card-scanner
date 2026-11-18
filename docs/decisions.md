# Decisions

Choices that are settled, with the reasoning. Change a decision here first, then in the other documents.

## Product

**One user, one collection.** The owner's own cards, about 100 to 150 of them. No sharing, no selling features.

**Front and back are both photographed.** The back says nothing about which card it is, but most wear shows there: white edges and corners. Condition needs both sides.

**Detection suggests, the user decides.** Which card it is, and its condition, are proposals. The user confirms the card with a tap and can overrule the condition. A wrong automatic match would put a wrong value in the collection without anyone noticing.

**Everything works without detection.** Reading photos needs an API key that may not be there. Without it, a scan is stored as it is and the user picks the card by searching the catalogue on name and number. The app never depends on the model.

**Condition is an estimate, not a grading.** A phone photo does not show what a grader sees under a lamp. The app uses Cardmarket's scale (Mint, Near Mint, Excellent, Good, Light Played, Played, Poor) and stores whether the value came from the model or from the user. A condition set by the user is never overwritten by a later reading.

**Four card languages: English, Dutch, German, French.** Those are the languages of the owner's cards; the lists offer nothing else, and the model leaves the language empty for any other.

**No inbox: the details come right after the scan.** The owner wants to say which card it is, its condition, holo or not, and its language while the card is still in hand. After saving the photos, the scan page asks for exactly that, with the best catalogue match already chosen and the language preset, and goes on to the next card with one tap ("Next"), or saves and opens the collection ("Stop"), or throws the card away ("Discard"). A card saved without a chosen catalogue card stays unconfirmed in the collection, behind a filter. Changed on 2026-11-15 from an inbox that collected the unconfirmed cards.

**The details step starts from the previous card.** Language and condition are preset to those of the previous card, as most of a stack is in the same language and about the same state; the finish starts at normal. Added on 2026-11-16.

**No 1st edition mark.** The owner does not want it: the field, the checkbox, the sheet and CSV column and the question to the model are gone (2026-11-16). The catalogue still knows which price variants are 1st edition prints, only to leave them out. The sync removed the old "1st edition" column from the owner's table in the sheet once; that step is gone again since the column is (2026-11-16).

**Two copies of a card are two rows.** Each physical card has its own photos, condition and price history.

## Prices

**One figure per print, not per condition or language.** The source gives a trend, a 30-day average and a lowest price per card. Where it lists print variants separately (holo, reverse holo), the app takes the figure of the variant that matches the card's finish, never that of a 1st edition print; otherwise the card's general figure. Condition and language are not in any figure; the owner's own price, below, covers those. Shadowless prints are not told apart.

**The value of a copy is what the owner looked up for it; otherwise the general price trend.** Cardmarket's product page can be filtered on language and condition and then shows what a copy like the owner's really costs. The app cannot read that page: Cardmarket refuses requests from programs, its API is closed, and getting around its bot check is not something this app does. So the owner does the looking: the card page links to the product with the copy's language and condition in the filter, and has a field for the price found there. That figure is the copy's value. A copy without one is valued at the source's general trend and marked with ≈ in the collection, so the total shows which part is real and which is rough.

A factor per condition was tried for one evening (2026-11-14) and dropped: rules of thumb are not prices.

**Worth grading: €50 or more, Near Mint or better.** Grading a card costs some tens of euros with shipping, and only cards in top condition get a grade that adds value. The mark is a pointer to look closer, not advice; the threshold is fixed in the code (`GRADING_MIN_VALUE`) until the owner wants it different.

**Copies are counted, not merged.** Two copies of the same card stay two rows (see above); the collection shows how many copies of a catalogue card there are in the same language, and the card page links to the others. A Dutch and an English copy are different cards to the owner (2026-11-16).

**The source's figures are stored with the owned card, with a snapshot per day**, next to the owner's own price. The history shows how the source's price moved.

## Sources

**TCGdex for the catalogue and the prices.** Free, no key, and its card data carries Cardmarket prices in EUR, refreshed daily. Cardmarket is the relevant market for the Netherlands. Checked on 2026-11-14: 221 sets, 23,912 cards, prices present for the old sets, and separate figures for 1st edition prints.

**The English catalogue only.** TCGdex has a Dutch catalogue, but the old sets are missing from it. Cards are matched to the English catalogue card, mostly by number and set total, which are the same in every language. The language is stored on the owned card.

**Not the Cardmarket API.** It is closed to new applicants and meant for professional sellers.

**The catalogue is copied locally; details per card on demand.** The list of sets and cards (id, number, name, picture) is fetched whole and refreshed weekly. Matching a scan then needs no network call. Rarity and prices are fetched per card when it is confirmed and once a day after that. A failing source never fails a scan.

## Identification

**Claude vision through the Anthropic API, with the official SDK.** The model reads both photos and returns name, number, set, language, finish and condition in a fixed structure. The server then looks those up in the local catalogue. The model never invents a catalogue entry: it reads, the catalogue decides, the user confirms.

**One reading per card for identity and condition together.** Both need the same two photos; one call is simpler and cheaper than two.

**The phone reads name and number, without a key.** The owner will not use an Anthropic API key. After the front is straightened, the web app reads fixed strips of the card with the Latin text recognition model of PaddleOCR (PP-OCRv5 mobile), run by ONNX Runtime Web in a web worker, on one thread. Only the recognition model is used: the strips are known, so nothing has to look for text first. Tesseract.js did this before. On the owner's 125 confirmed cards it read 93 of the 103 English and Dutch Pokémon names and 113 numbers, and often read a capital V as Y ("Yenonat"); the model read all 103 names and, with the rules below, 119 numbers, none wrong, in less time. It costs about 23 MB to load once (15 MB runtime, 8 MB model) against 5 MB. A strip is read only when it is still needed, the likeliest first. For the name there are four strips, each 1% of the card lower or higher than the other, because the name sits at a different height on Basic cards and on Stage cards with their "Evolves from" line and stage icon; the order is the one that most often held the name on those cards (7%, 8%, 6%, 9% from the top). Reading stops once the model is sure of a strip (0.93) or two strips give the same name; the name read most often wins, then the one the model was surest of. Capitals glued in front of a name are dropped ("STAGENidorina"). On the 125 cards this takes 2 name strips on average instead of 4. For the number there are three strips of 2.2% of the card high in the bottom right corner, at slightly different heights, then the bottom left corner where newer cards have it; the first strip that holds a number wins. The strips are that low because the model drops digits and reads the slash as a 1 when the number is small in its strip: on the higher strips used for Tesseract it read 97 numbers right and 12 wrong. The bottom left strip is untested: the owner's cards all have the number on the right. Where no strip gives a number but one holds four to ten digits in a row, the slash was probably read as a 1 ("7164" for 7/64). The phone sends those digits and the server puts the slash back: it takes the last two or three digits as the set total, only when a set of that size exists and the digit before them is a 1, and the digits before that as the number when it fits the total. With a name, the number is used only when it makes a better match than the name alone; without a name, only when one number is possible. The server does this because it has the set sizes. The language is read from the left half of the weakness, resistance and retreat cost line, which sits in the same place on every old card and is printed in the card's language; the words are matched allowing for a misread letter, and also inside a line without spaces, because the model often leaves them out. Reading several strips in one run of the model was measured and was not faster on one thread. More threads need cross-origin isolation headers, which is left until the speed on a phone is known. A word that is mostly capitals is never a name. That rule was checked again on 2026-11-18 and stays: without it the banners win ("TRAINER", "ENERGY", 19 more wrong names on 162 cards), and it drops a banner in any language without a list of words. A Trainer card has its name under the banner. When the four name strips hold no name, three strips at 17%, 18.5% and 15.5% from the top are read, and the whole line up to the first digit is the name, with the same stop and vote; a strip the model is less than half sure of is skipped, which keeps scribbles from the picture of other cards out. On the owner's nine Trainer cards: eight names right and "Switc" for Switch, which the catalogue search still finds. These strips are 61% of the card wide, like the name strips, and that cut a long Dutch title off ("Zoeken per Comput"). No single width was best on the owner's fifteen Trainer cards: at 70% to 90% the long title fits, but "Energy Search", "Switch" and "Poké Bal" are read worse than at 61%. So after the narrow strips one strip of 90% wide is read, and its title is used only when it is the narrow title with more letters after it. A basic Energy card has no name printed on it, only the banner and the symbol; it is found by its number, read on all eleven of the owner's. Telling the type from the colour was left out: two types to test on, and a red Pokémon card without a name would be taken for one. Name, number and language go with the scan; the server looks name and number up like a reading by the model and stores the language. A photo kept whole is not read: the strips are only predictable on a straightened card. The WebAssembly runtime comes from the `onnxruntime-web` package and the model (Apache 2.0, from the PaddleOCR project) is in the repository under `apps/card-front/ocr/`; both are served by the app itself, and the content policy allows WebAssembly for it.

**The server learns the names it did not know, in any language.** The catalogue has English names, and its source has no Dutch card names at all. A table of Dutch names by hand was rejected: no list to check it against, and it would tie the app to one language. Instead, when the user confirms a card whose reading has a name that no catalogue card carries, the server keeps that name with the name of the confirmed card (`learned_name`). A later reading with that name is looked up under the learned one. So the first "Wissel" or "Glurak" is found by its number, and every next one also by its name; a misreading that keeps returning ("Switc") is learned the same way. A name that is a real catalogue name is never learned, so confirming the wrong card by mistake cannot bend it. Confirming another card for the same reading replaces what was learned.

**Claude Opus 5.5 by default**, set with `VISION_MODEL`. At this size the cost is no concern: a few hundred calls in total.

**Not local recognition.** Text recognition plus picture matching on the Pi was considered. The old sets carry no set code in text, only a small symbol, and the first set not even that. It would be much more work for a worse result, on a Pi with little memory.

## Technology

**Same stack and layout as the barcode scanner.** NestJS, TypeORM and SQLite for the API; Angular with TailwindCSS for the web app; Nx workspace; one `app` container that serves the API and the built web app. The owner knows it, and the deployment scripts are reused. The code style rules of that project apply here too.

**The phone makes the photo smaller, and makes the thumbnail.** A phone photo is 12 megapixels or more. The web app scales it to 2400 pixels on the long side and makes a 480-pixel thumbnail, both as JPEG, before upload. The server stores what it receives and checks only that it is a JPEG of a sane size. So the server needs no image library, which saves memory and a native dependency on a Pi that has little to spare.

**The phone straightens the card; the owner sets the corners only when it is not found.** The web app cuts the card out and straightens it to the card's shape (63 by 88) with a perspective transform on a canvas. Its edges are found by line detection; when found in a photo from the camera in the app, the photo is straightened without asking, otherwise the four corners are shown to drag. "Whole photo" skips this. The server still gets plain JPEGs and needs no image library. Changed on 2026-11-16 from always asking for the corners, to take fewer taps per card.

**The app reloads itself after a release.** The image build writes `app-files.json`, the list of the web app's script and style files. The open app fetches it when it comes back to the screen and every minute; when the files it loaded are no longer in the list, it reloads, but not on the scan page, while a photo is cropped or viewed, or while a field has focus; then it waits for the next page change. Taken from the barcode scanner, which checks when its event stream reconnects; this app has no event stream.

**The crop starts on the card, found by its straight edges.** When the photo opens for cropping, the web app looks for the card on a 400-pixel copy (`services/card-finder.ts`): edge strength per colour channel, straight lines through the edges (a Hough transform that votes along each edge's own direction), then the largest card-shaped outline of two lines across and two down whose four sides are covered by edges, leaving out the rounded corners. The corners are where those lines cross, so they sit on the card's corners as if they were square, outside the rounding. The swirl on the back is curved and makes no straight line. A first version that told card from background by colour was dropped the same evening: it put the corners inside the rounded corners and locked onto the light swirl on the back. When nothing card-shaped is found, the corners of the previous crop are used, and for the very first photo the middle. The owner always confirms the corners.

**The app icon is an original drawing of a card back**, not the real one: a blue card with swirls and a red and white ball, without the logo or the printed artwork, which belong to Nintendo and The Pokémon Company while this repository and its image are public. The source is `assets/icons/icon.svg`; the PNG sizes and `favicon.ico` are rendered from it, the small ones zoomed in on the card, the install icons with the margin Android's masks need.

**The original photo is kept.** Next to the straightened photo the server stores the photo as taken, scaled to 2400 pixels (`<id>-<side>-source.jpg`), and copies it to the Drive folder. Cropping a photo again on the card page starts from it, so a crop can also be made wider. A new photo replaces it; a photo kept whole has no separate original.

**Photos as files, not in the database.** Stored under `data/photos/`, with the file name in the database. The database stays small and easy to copy.

**The camera in the page, the owner taps the shutter; the phone's camera app stays as a choice.** The owner wants as few taps per card as possible. The scan page shows the camera with the card's outline, the owner taps the shutter, and a found card is straightened without asking; with both sides it saves by itself. Taking the photo by itself once the card holds still took photos in poor light and before the card was turned over (owner, 2026-11-16), so it is a switch in the camera frame, off by default. That needs HTTPS, which the app has behind the proxy. A frame from the camera in the page may be less sharp than a photo from the camera app; Chrome on Android takes a full photo through `ImageCapture`, other browsers give the video frame. The file input that opens the camera app stays one tap away and the choice is remembered; if the photos disappoint, the owner goes back to it. Changed on 2026-11-16 from the camera app only.

**The web app asks again while a card is being read.** Reading takes some seconds. The collection and the card page poll every few seconds only while a reading is pending. No event stream and no service worker: nothing here needs push or offline use.

## Hosting

**The server Pi, from the start.** The same Raspberry Pi 3B+ that runs the barcode scanner: Debian, Docker, the reverse proxy in front. Memory is tight there, so nothing is built on the Pi and the container has a memory limit.

**A public repository and a public image.** As with the barcode scanner, so the Pi pulls scripts and image without any token. Nothing secret is in either.

**Login with Google for an allowlist.** As in the barcode scanner. The site is reachable from outside the house, so it needs a login before it is put behind the reverse proxy.

**An account can be let in to look only.** Accounts in `VIEWER_EMAILS` log in like the others and see the collection, the cards, their photos and the export, but change nothing. The server decides: for such an account the login guard refuses every request that is not a read (`GET`, `HEAD`, `OPTIONS`); only logging out stays possible. The web app hides the scan tab and what changes a card, as a courtesy on top of that. The owner is never a viewer, also when listed as one.

## Google sync

**One way: the app writes, Google receives.** The SQLite database is the truth. The sheet and the Drive folder are a readable copy. Changes made in the sheet are overwritten at the next sync.

**The sheet is rewritten whole.** At this size, writing all rows again is simpler than tracking which row changed, and it cannot drift. Values are written as plain text and numbers, never as formulas.

**The sheet's layout belongs to the owner.** The app writes values only; formatting, filters, filter views and tables that the owner adds stay. A table on a tab is resized after each write to the rows and columns written, so new cards and new columns fall inside it. A sort applied to the table is undone by the next write, which puts the rows back in id order; a filter view keeps a sort.

**A deleted card's photos go to the Drive trash, not away.** When a card is deleted, the Drive ids of its photos are kept in `drive_trash`; the next sync moves those files to the Drive trash. From there they can be restored for 30 days. This is the only change the app makes to files it wrote earlier, apart from replacing the database copy.

**No job table.** What still has to be copied is known from the data itself: a photo without a Drive file id is waiting. A run uploads those, rewrites the sheet, and once a night copies the database. A failed run is simply repeated; nothing can get stuck in a queue.

**The owner's personal Google account, through OAuth.** The owner gives consent once from the Settings page; the server keeps the refresh token in its `data/` folder. A service account cannot be used: it has no storage of its own, so its uploads to a personal Drive are refused.

**Full Drive access.** The owner wants the copy inside an existing folder, `Documents/~Hobby/Pokémon`. The narrow permission (`drive.file`) only reaches files the app created itself and cannot write into an existing folder, so the app asks for the full `drive` permission. It uses it only to find or create the folder path and to write below it.

**The same OAuth client for login and Drive**, with two redirect addresses. The Google Cloud project must be "In production": in "Testing" a refresh token expires after 7 days, which would stop the sync every week.

**The sync also carries the backup.** A nightly copy of the database goes to the Drive folder. With the photos already there, the Drive holds everything needed to rebuild. No separate backup repository as in the barcode scanner.

**Sync never blocks scanning.** It runs in the background 20 seconds after the last change, and scanning works when Google is unreachable.
