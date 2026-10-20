#!/usr/bin/env bash
# CEO console smoke test — authenticated GET probes for every /ceo page.
COOKIE="$1"
test_page () {
  local path="$1"
  local code html err
  code=$(curl -s -o /tmp/ceopage.html -w '%{http_code}' -H "Cookie: $COOKIE" "https://console.ghayaestate.com$path")
  err=$(grep -c -iE "application error|unhandled rejection|internal server error|\"@next/env" /tmp/ceopage.html || true)
  printf '%-26s http=%s errorMarkers=%s\n' "$path" "$code" "$err"
}
for p in /ceo /ceo/overview /ceo/projects /ceo/all-projects /ceo/units /ceo/leads /ceo/deals /ceo/brokers /ceo/developers /ceo/users /ceo/contacts /ceo/inquiries /ceo/settings /ceo/pricing /ceo/analytics /ceo/reviews /ceo/payment-plans /ceo/new-launches /ceo/blog /ceo/press /ceo/invitations /ceo/access-requests /ceo/areas-survey /ceo/gaps /ceo/viewings /ceo/jobs /ceo/audit /ceo/ai /ceo/outbox /ceo/create-user; do
  test_page "$p"
done
