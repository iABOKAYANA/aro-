#!/usr/bin/env bash
# Probe the read-only GET APIs behind the CEO console with an authentication
# cookie. Writes (POST/PUT/DELETE) are intentionally NOT called.
COOKIE="$1"
probe () {
  local path="$1" code body
  code=$(curl -s -o /tmp/ceoapi.json -w '%{http_code}' -H "Cookie: $COOKIE" -H 'Accept: application/json' "https://console.ghayaestate.com$path")
  head=$(head -c 60 /tmp/ceoapi.json | tr '\n' ' ' | tr -s ' ')
  printf '%-34s %s %s\n' "$path" "$code" "$head"
}
for p in /api/ceo/brokers /api/ceo/developers /api/ceo/deals /api/ceo/approvals /api/ceo/data-quality /api/ceo/anomalies /api/ceo/growth-stats /api/ceo/forecast /api/ceo/engagement /api/ceo/client-dna /api/ceo/content /api/ceo/disputes /api/ceo/edit-requests /api/ceo/audit /api/ceo/activity /api/ceo/areas-survey /api/ceo/amenities /api/ceo/access-requests /api/overview /api/health; do probe "$p"; done
# spot-check data-bearing page detail routes
probe "/api/ceo/brokers/$(true)"
