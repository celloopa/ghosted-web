#!/bin/sh
# Seed the Codex subscription auth (ChatGPT login) into CODEX_HOME on first boot.
# GHOSTED_CODEX_AUTH_B64 = base64 of the owner's ~/.codex/auth.json (Coolify secret).
# Seed-once so Codex can refresh/rotate tokens on the persistent volume; set
# GHOSTED_CODEX_AUTH_RESEED=1 to force a re-seed after updating the secret.
set -e
if [ -n "$GHOSTED_CODEX_AUTH_B64" ] && [ -n "$CODEX_HOME" ]; then
  mkdir -p "$CODEX_HOME"
  if [ "$GHOSTED_CODEX_AUTH_RESEED" = "1" ] || [ ! -f "$CODEX_HOME/auth.json" ]; then
    echo "$GHOSTED_CODEX_AUTH_B64" | base64 -d > "$CODEX_HOME/auth.json"
    chmod 600 "$CODEX_HOME/auth.json"
    echo "[entrypoint] seeded Codex auth.json into $CODEX_HOME"
  fi
fi
exec "$@"
