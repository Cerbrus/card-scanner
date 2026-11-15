# Deployment

How the app runs on the Raspberry Pi. The model is the barcode scanner's deployment; its `docs/deployment.md` has more background on the Pi itself.

## Principle

The Pi pulls; nothing pushes to the Pi.

1. A push to `master` makes GitHub Actions build the `app` image and publish it to GitHub's container registry (`ghcr.io`), tagged `latest`, with the version number and with the commit hash.
2. A systemd timer on the Pi runs every 5 minutes: fetch the compose file and scripts, pull the image, restart when it changed.
3. The Pi needs Docker and outbound internet. No inbound port for deployment, no SSH key in GitHub, no Node on the Pi.

The repository and the image are public, so the Pi needs no GitHub token and no registry login. Secrets never go into the image.

The image package took its visibility from the public repository at its first build, so nothing has to be set by hand. Should a pull ever be refused, check on GitHub under your profile, Packages, `cardscanner-app`, Package settings that the package is public.

## On the Pi

```
/opt/cardscanner/
|-- docker-compose.yml    # fetched from the repo by the updater
|-- update.sh             # the updater; refreshes itself and firewall.sh
|-- firewall.sh           # limits the app's port to the reverse proxy
|-- .env                  # local settings and secrets, never overwritten, readable by root only
`-- data/                 # owned by user 1000
    |-- app.db            # SQLite database
    |-- photos/           # the photos and their thumbnails
    |-- session-secret    # signs the login cookies
    |-- google-token.json # the refresh token for Google Drive, after consent
    `-- logs/app.log      # log file with its rotated files
```

Systemd units: `cardscanner-update.timer` (every 5 minutes), `cardscanner-firewall.service` (at boot).

One-time install on a fresh Pi:

```bash
curl -fsSLO https://raw.githubusercontent.com/Cerbrus/card-scanner/master/deployment/install.sh
sudo bash install.sh
```

`deployment/install.sh` can be run again safely. It installs Docker when missing, adds the kernel parameters for container memory limits when missing, creates `/opt/cardscanner/` with `data/`, the scripts and an `.env` from `deployment/env.template`, installs the timer and the firewall service, and runs the updater once.

The compose file gives the one container port `${APP_PORT:-3030}`, the volume `./data:/data`, user 1000 and a memory limit of 384 MB.

## Settings (`.env`)

`install.sh` copies `deployment/env.template` to `.env` once; updates never overwrite it. After a change: `cd /opt/cardscanner && sudo docker compose up -d --force-recreate`.

Nothing has to be set for a first start. Each optional part is off while its setting is empty.

| Variable | Meaning |
|---|---|
| `IMAGE_TAG` | `latest` by default. Set a version number to pin that version. |
| `APP_PORT` | Host port of the web app and API, default `3030` |
| `ALLOWED_SOURCE` | Address of the reverse proxy; only it may reach `APP_PORT`. Empty means open to the whole network. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The Google OAuth client, for login and for Google Drive. An empty id switches both off. |
| `PUBLIC_URL` | Address the site is reached at, such as `https://cards.example.com`, without a slash at the end |
| `ALLOWED_EMAILS` | Google accounts that may log in, comma-separated |
| `OWNER_EMAIL` | The account that may connect Google Drive and start system actions. Empty: the first of `ALLOWED_EMAILS` |
| `DRIVE_FOLDER` | Folder in the owner's Drive for photos, sheet and database copy. Default `Documents/~Hobby/Pokémon` |
| `SHEET_NAME` | Name of the spreadsheet in that folder. Default `Pokémon cards` |
| `ANTHROPIC_API_KEY` | Key for reading photos with Claude. Empty switches reading off. |
| `VISION_MODEL` | The Claude model that reads the photos. Default `claude-opus-5-5` |
| `CSP_MODE` | Content security policy: `report` (default), `enforce` or `off` |

## Reverse proxy (Nginx Proxy Manager)

**Set up login first.** Without `GOOGLE_CLIENT_ID` the API is open to whoever can reach it. On the home network that is acceptable; behind a public name it is not. Either fill in the Google settings before adding the proxy host, or attach an access list to it.

Add a proxy host:

- **Domain name**: the name you chose for the site.
- **Forward to**: scheme `http`, the wired LAN address of the server Pi, port `3030`.
- **SSL**: request a certificate, force SSL.
- **Access List**: only while the app's own login is off.
- **Upload size**: a scan is one request of about 1 to 3 MB. Nginx Proxy Manager allows that by default; when a scan fails with status 413, add `client_max_body_size 20m;` under Advanced.

Then set `ALLOWED_SOURCE` in `.env` to the proxy's address, so nothing else on the network can reach the port around the proxy. `firewall.sh` applies it at boot and after every update. Requests made on the Pi itself keep working.

When the site's name points at the router and pages hang from inside the home network, add a local DNS record on the network's DNS server that points the name straight at the reverse proxy.

## Login with Google, and Google Drive

One Google Cloud project and one OAuth client serve both.

1. In the Google Cloud console create a project. Under APIs and Services, enable the **Google Drive API** and the **Google Sheets API**.
2. On the consent screen (Google Auth Platform) set the user type to "External". Add the scope `.../auth/drive`. Set the publishing status to **In production**: in "Testing" the Drive connection stops working after 7 days. Google shows "Google hasn't verified this app" at consent; continue past it. For a personal app with a handful of users no verification is needed.
3. Create an OAuth client of type "Web application". Authorised JavaScript origin: `<PUBLIC_URL>`. Authorised redirect addresses, both:
   - `<PUBLIC_URL>/api/v1/auth/google/callback`
   - `<PUBLIC_URL>/api/v1/google/callback`
4. Put the client id and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and set `PUBLIC_URL` and `ALLOWED_EMAILS`.
5. Restart: `sudo docker compose up -d --force-recreate`.
6. Open the site and log in. On the Settings page tap **Connect Google Drive** and give consent with the account whose Drive should receive the copy. The first copy starts by itself.

Check: `curl -i http://127.0.0.1:3030/api/v1/cards` on the Pi answers `401`; the log says "login is on for 1 Google account(s)"; the Settings page shows the time of the last copy.

Notes:

- The client secret, the session secret and the Google token exist only on the Pi.
- Logging everyone out: delete `data/session-secret` and restart.
- Stopping the Drive copy: **Disconnect** on the Settings page, or delete `data/google-token.json`.
- Locked out after a typo in `ALLOWED_EMAILS`: fix `.env` over SSH and restart.
- Moving the copy to another folder: change `DRIVE_FOLDER`, restart, and tap **Copy now**. When the old folder still exists the app keeps using it; delete or rename it first.

## Reading photos with Claude

1. Create an API key in the Anthropic Console.
2. Put it in `.env` as `ANTHROPIC_API_KEY` and restart.
3. The Settings page shows "On" under "Reading photos". Cards scanned from then on are read; for an earlier card, tap **Read the photos again** on its page.

## Updates, rollback, restore

- **Update**: push to `master`; the Pi follows within about 5 minutes plus build time. The barcode scanner and the card scanner share the Pi and each have an updater every 5 minutes; both take the lock `/run/lock/docker-update.lock` around pulling, restarting and pruning, so one never prunes while the other pulls. Without it, Docker's image store broke the other's pull with "lease does not exist" (seen 2026-11-15). An updater that waits more than ten minutes for the lock skips that round.
- **Check**: `curl http://127.0.0.1:3030/api/v1/health` on the Pi for the running version, `systemctl list-timers cardscanner-update.timer`, `journalctl -u cardscanner-update`, `docker compose ps`.
- **Rollback**: set `IMAGE_TAG=<version>` in `.env` and run the updater. Database migrations only go forward.
- **Logs**: `/opt/cardscanner/data/logs/app.log` (JSON lines, rotated at 256 KB).
- **Restore** on a new Pi, after `install.sh`: stop the container, put `backup/app.db` from the Drive folder at `data/app.db` and the files from `photos/` in `data/photos/`, `sudo chown -R 1000:1000 data`, start the container, fill in `.env` again and connect Google Drive again. The app then finds its folder and sheet by name and uploads the photos once more.

### Version numbers

Every build of `master` gets a version `major.minor.patch`, worked out by `.github/scripts/version.sh`: `major.minor` from `version` in the root `package.json`, and as `patch` the number of commits since that last changed. The workflow tags the commit `v<version>` and creates a GitHub release with the commit subjects.

### Dependency updates

Dependabot (`.github/dependabot.yml`) opens pull requests every Monday, grouped as in the barcode scanner. A pull request runs the checks and builds the image without publishing. A push that only changes the Dependabot set-up starts no build.

**Reviewer.** As in the barcode scanner: `.github/workflows/dependabot-helper.yml` runs every morning, lists the Dependabot pull requests that are at least 24 hours old, have finished their checks and were not reviewed yet for their current commit, and starts a Claude agent for each (at most 3 per run). The agent reads what changed, finds where this app uses it, runs the checks, repairs what is small and clear, and leaves one comment with a verdict: safe to merge, merge with care, or do not merge. It never merges. Its rules are in `.github/dependabot-helper.md`. It needs the repository secret `CLAUDE_CODE_OAUTH_TOKEN` (a token made with `claude setup-token`, counted against the owner's Claude plan) and the Claude GitHub App on this repository; without them the review job fails and nothing else is affected. To review right away, start the workflow by hand with the age set to 0 or with one pull request number.
