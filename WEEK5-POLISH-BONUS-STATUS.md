# Week 5 - Polish + Bonus Status

Date: 2026-04-19
Scope: Day 29 -> Day 35

## A. Completed items

1. Day 29 - Dark mode web + mobile
- Result: DONE
- Notes:
  - Web: theme toggle with persisted setting in localStorage.
  - Mobile: theme switch in Profile and dynamic navigation/status bar colors.

2. Day 30 - i18n VI/EN for web
- Result: DONE (core shell)
- Notes:
  - Added EN/VI toggle and translation keys for primary home shell actions/content.

3. Day 31 - i18n VI/EN for mobile
- Result: DONE (core screens)
- Notes:
  - Added EN/VI strings for Home, Search, Watchlist, Profile shell labels.

4. Day 32 - Push notification mobile basic
- Result: DONE (demo-level)
- Notes:
  - Added in-app demo push banner and manual trigger from Profile.
  - Added periodic simulated push event while notifications are enabled.

5. Day 33 - UI polish
- Result: DONE
- Notes:
  - Added settings controls and visual polish for profile/settings surfaces.

6. Day 34 - Accessibility quick pass
- Result: DONE (baseline)
- Notes:
  - Improved web keyboard focus-visible styling.

## B. Deferred / partial

1. Day 35 - Bonus scope closing
- Result: PARTIAL
- Notes:
  - No extra bonus feature added yet beyond planned scope.

## C. Verification snapshot

1. npm run lint:web -> PASS
2. npm run build:web -> PASS
3. npm run lint:mobile -> PASS
4. npm run test -w apps/mobile -- --watch=false -> PASS
