#!/usr/bin/env bash
# Pulls the current compose file and image and restarts what changed.
# Run by cardscanner-update.timer every minute; safe to run by hand.
# Each run first asks the registry for the image's digest and asks Compose what
# a restart would change. It stops there when the image on this machine is the
# registry's, Compose would leave the container running, and no compose file
# change waits.
# A changed compose file leaves a marker that stays until it has been applied,
# so a run that fails halfway is repeated by the next one.
set -euo pipefail

APP_DIR=/opt/cardscanner
REPO_RAW=https://raw.githubusercontent.com/Cerbrus/card-scanner/master/deployment
COMPOSE_PENDING=.compose-pending
MANIFEST_TYPES=(
    application/vnd.oci.image.index.v1+json
    application/vnd.docker.distribution.manifest.list.v2+json
    application/vnd.oci.image.manifest.v1+json
    application/vnd.docker.distribution.manifest.v2+json
)

cd "$APP_DIR"

if curl -fsSL -o docker-compose.yml.new "$REPO_RAW/docker-compose.yml"; then
    if ! cmp -s docker-compose.yml.new docker-compose.yml; then
        touch "$COMPOSE_PENDING"
    fi
    mv docker-compose.yml.new docker-compose.yml
else
    rm -f docker-compose.yml.new
    echo "could not fetch compose file, keeping the current one" >&2
fi

for script in update.sh firewall.sh; do
    if curl -fsSL -o "$script.new" "$REPO_RAW/$script"; then
        chmod +x "$script.new"
        mv "$script.new" "$script"
    else
        rm -f "$script.new"
    fi
done

remote_digest() {
    local image=$1 repository tag token accept=()
    repository=${image#ghcr.io/}
    tag=${repository##*:}
    repository=${repository%:*}
    token=$(curl -fsS "https://ghcr.io/token?scope=repository:$repository:pull" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
    for type in "${MANIFEST_TYPES[@]}"; do
        accept+=(-H "Accept: $type")
    done
    curl -fsSI -H "Authorization: Bearer $token" "${accept[@]}" "https://ghcr.io/v2/$repository/manifests/$tag" |
        tr -d '\r' | sed -n 's/^docker-content-digest: *//Ip'
}

containers_current() {
    local plan
    plan=$(docker compose --ansi never --progress plain --dry-run up -d --remove-orphans 2>&1) || return 1
    [ -n "$plan" ] || return 1
    ! grep -qv ' Running *$' <<<"$plan"
}

image=$(docker compose config --images 2>/dev/null | head -n 1)
if [ ! -e "$COMPOSE_PENDING" ] && [[ "$image" == ghcr.io/* ]]; then
    remote=$(remote_digest "$image" || true)
    local_digests=$(docker image inspect --format '{{join .RepoDigests " "}}' "$image" 2>/dev/null || true)
    if [ -n "$remote" ] && [[ " $local_digests " == *"@$remote "* ]] && containers_current; then
        exit 0
    fi
fi

exec 9>/run/lock/docker-update.lock
if ! flock -w 600 9; then
    echo "another updater on this machine held the Docker lock for ten minutes; trying again next time" >&2
    exit 0
fi

if ! docker compose pull --quiet; then
    echo "could not pull the image, keeping the current one" >&2
fi
docker compose up -d --remove-orphans
rm -f "$COMPOSE_PENDING"
docker image prune -f >/dev/null

if [ -x firewall.sh ]; then
    ./firewall.sh
fi
