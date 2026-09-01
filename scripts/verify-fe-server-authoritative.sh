#!/usr/bin/env bash
# FE-VOICE-02: verify server-authoritative patterns in app.js (no runtime).
set -euo pipefail
APP="${1:-src/app.js}"
rg -q "purgeServerBackedLocalCache" "$APP"
rg -q "campaignsLoading" "$APP"
rg -q "Server-authoritative: never merge stale preview" "$APP"
rg -q "Загружаем кампании" "$APP"
rg -q "if \\(hasApi\\(\\)\\) return;" "$APP" || rg -q "if \\(hasApi\\(\\)\\) return" "$APP"
echo "FE server-authoritative checks OK"
