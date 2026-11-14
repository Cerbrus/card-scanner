# Deployment

How the app will run on the server Pi. The model is the barcode scanner's deployment; read its `docs/deployment.md` for the details of the Pi, the updater and the reverse proxy. This document lists what is the same and what differs. Nothing here is in place yet.

## The same

- The Pi pulls; nothing pushes to the Pi. A push to `master` builds a `linux/arm64` image on GitHub Actions and publishes it to `ghcr.io`. A systemd timer on the Pi pulls it and restarts the container.
- One `app` container: the API plus the built web app. It runs as user 1000 with a memory limit.
- A folder `/opt/cardscanner/` with the compose file, the scripts, `.env` and `data/`.
- The reverse proxy provides HTTPS and forwards to the app's port. A firewall rule lets only the proxy reach that port.
- Login with Google for an allowlist of accounts.
- Version numbers worked out from `package.json` and the commit count.

## Different

**No hardware agent.** One container, no devices.

**Port 3030.** Ports 3000, 3010 and 3020 are taken on the Pi.

**More data on disk.** `data/photos/` grows with the collection. At two scaled-down photos per card, 150 cards stay well under 1 GB; the Pi has about 10 GB free.

**More memory for the container.** Resizing a photo needs more than the barcode scanner's 256 MB allows comfortably. Start at 384 MB and measure. The Pi has roughly 600 MB available for everything.

**The repository is private.** The barcode scanner's Pi fetches its compose file and images without any login because everything is public. Here the Pi needs read access to two things:

- the image on `ghcr.io`: a token with only `read:packages`, used once for `docker login` on the Pi;
- the compose file and scripts: a read-only deploy key for this repository, and the updater does a `git pull` instead of fetching raw files.

Both live on the Pi only. An alternative is to set the image package to public while the repository stays private; the image holds no secrets. To decide when milestone 1 is built.

**No backup repository.** The Google sync copies the photos and a nightly database file to Drive.

**Extra settings in `.env`:**

| Variable | Meaning |
|---|---|
| `ANTHROPIC_API_KEY` | Key for the model that reads the photos |
| `VISION_MODEL` | Which Claude model to use |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The OAuth client, for login and for Drive |
| `PUBLIC_URL`, `ALLOWED_EMAILS` | As in the barcode scanner |

The Drive refresh token is not in `.env`: the app stores it in `data/` after the owner gave consent.

## Google Cloud set-up

One OAuth client of type "Web application" serves both login and Drive.

- Redirect addresses: `<PUBLIC_URL>/api/v1/auth/google/callback` for login and one for the Drive consent.
- Enable the Google Drive API and the Google Sheets API in the project.
- Scope for Drive: `drive.file` only.
- Publishing status "In production". In "Testing" a refresh token expires after 7 days, which would stop the sync every week. The barcode scanner's project is in "Testing" because login alone needs no refresh token; that is why this app gets its own project.

Whether "In production" works without Google's verification for this scope is on the list to check in [plan.md](plan.md).
