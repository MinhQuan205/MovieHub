# Week 2 - Auth Manual Test Report

Date: 2026-04-11
Scope: Day 9 -> Day 14 auth flows (web + mobile)

## A. Web manual flow checklist

1. Open login page: /login
- Result: PASS

2. Open register page: /register
- Result: PASS

3. Open forgot password page: /forgot-password
- Result: PASS

4. Open reset password page: /reset-password/demo-token
- Result: PASS

5. Validation on empty/invalid fields
- Result: PASS

6. Login success flow
- Expected: Save token, set authenticated state, redirect to home
- Result: PASS

7. Register success flow
- Expected: Save token, set authenticated state, redirect to home
- Result: PASS

8. Protected route /account when not logged in
- Expected: Redirect to /login
- Result: PASS

9. Protected route /account when logged in
- Expected: Access account panel and user info
- Result: PASS

10. Logout from header/account panel
- Expected: Clear token, clear auth state, redirect to /login
- Result: PASS

## B. Mobile manual flow checklist

1. App starts at Auth flow when not logged in
- Result: READY TO TEST

2. Login validation states
- Result: READY TO TEST

3. Register validation states
- Result: READY TO TEST

4. Successful login/register
- Expected: Navigate to MainTabs
- Result: READY TO TEST

5. Logout in Profile screen
- Expected: Return to Auth flow
- Result: READY TO TEST

## C. Automated verification run

1. Web lint
- Command: npm run lint:web
- Result: PASS

2. Web production build
- Command: npm run build:web
- Result: PASS

3. Mobile lint
- Command: npm run lint:mobile
- Result: PASS

4. Mobile jest smoke
- Command: npm run test -w apps/mobile -- --watch=false
- Result: PASS (2026-04-19)

## D. Known limitations for this phase

1. Auth submit is currently demo-mode on frontend (simulated success), pending backend endpoint wiring in next phase.
2. Token refresh flow structure is in place in base API layer; end-to-end refresh depends on backend /auth/refresh readiness.

3. Mobile test environment required Jest config adjustment for Node localStorage + ESM dependencies (react-redux/redux/immer chain). This is now fixed in mobile test config/script.
