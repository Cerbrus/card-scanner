#!/usr/bin/env bash
# One-time setup of the card scanner on a Raspberry Pi (64-bit Debian or Raspberry Pi OS).
# Usage: sudo bash install.sh
# Safe to run again: existing settings and data are kept.
set -euo pipefail

APP_DIR=/opt/cardscanner
REPO_RAW=https://raw.githubusercontent.com/Cerbrus/card-scanner/master/deployment
DATA_OWNER=1000:1000
CMDLINE=/boot/firmware/cmdline.txt

if [ "$(id -u)" -ne 0 ]; then
    echo "Run with sudo." >&2
    exit 1
fi

echo "==> Docker"
if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    apt-get update
    apt-get install -y ca-certificates curl
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    # shellcheck disable=SC1091
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
    echo "    already installed"
fi

echo "==> Memory limits"
REBOOT_NEEDED=0
if [ -f "$CMDLINE" ] && ! grep -q "cgroup_enable=memory" "$CMDLINE"; then
    cp -n "$CMDLINE" "$CMDLINE.bak-cardscanner"
    sed -i '1 s/$/ cgroup_enable=memory cgroup_memory=1/' "$CMDLINE"
    REBOOT_NEEDED=1
    echo "    kernel parameters added"
else
    echo "    already enabled"
fi

echo "==> $APP_DIR"
mkdir -p "$APP_DIR/data"
chown -R "$DATA_OWNER" "$APP_DIR/data"
for script in update.sh firewall.sh; do
    curl -fsSL -o "$APP_DIR/$script" "$REPO_RAW/$script"
    chmod +x "$APP_DIR/$script"
done
if [ ! -f "$APP_DIR/.env" ]; then
    curl -fsSL -o "$APP_DIR/.env" "$REPO_RAW/env.template"
    echo "    settings file created: $APP_DIR/.env"
else
    echo "    keeping existing .env"
fi
chmod 600 "$APP_DIR/.env"

echo "==> Update timer"
cat > /etc/systemd/system/cardscanner-update.service <<EOF
[Unit]
Description=Update the card scanner container
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=$APP_DIR/update.sh
EOF

cat > /etc/systemd/system/cardscanner-update.timer <<EOF
[Unit]
Description=Check for card scanner updates

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
RandomizedDelaySec=10

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/cardscanner-firewall.service <<EOF
[Unit]
Description=Limit the card scanner port to the reverse proxy
After=docker.service
Wants=docker.service

[Service]
Type=oneshot
ExecStart=$APP_DIR/firewall.sh

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now cardscanner-update.timer
systemctl enable cardscanner-firewall.service
systemctl start cardscanner-firewall.service || echo "    firewall rule failed: journalctl -u cardscanner-firewall"

echo "==> First update"
systemctl start cardscanner-update.service || echo "    first update failed: journalctl -u cardscanner-update"

echo "==> Done"
if [ "$REBOOT_NEEDED" -eq 1 ]; then
    echo "Reboot once to activate container memory limits."
fi
