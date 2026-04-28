# Timezone Date Fix

This build replaces UTC date-key logic with local-device date keys.

Fixed:
- `getTodayKey()` now uses local timezone.
- `getYesterdayKey()` now uses local timezone.
- Dashboard should no longer show yesterday after midnight in India or other non-UTC timezones.

Important:
- Timestamp fields like `loggedAt` still use full ISO timestamps correctly.
