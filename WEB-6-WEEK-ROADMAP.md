# MovieHub - Frontend Roadmap 6 Tuan (Revised)

Ban nay da chinh theo MOVIEHUB_PROJECT_GUIDE (1).md:
- Guide moi la mobile-first + backend-centric.
- Frontend can giu can bang web va mobile, nhung uu tien endpoint dependency tu backend.

## Progress snapshot (2026-04-19)

- Week 1: Technical setup da xong, con viec process team (PR/changelog/onboarding check) chua chot.
- Week 2: Auth web/mobile da co flow chinh; lint/build/test automation dang xanh.
- Week 3: Day 15 -> Day 20 da implement (web + mobile core movies). Day 21 dang trong giai doan polish/perf check.
- Week 4: Day 22 -> Day 26 da implement (watchlist + review UI web/mobile). Day 27-28 con phu thuoc backend socket va manual regression full.
- Week 5: Day 29 -> Day 34 da implement o muc app shell (dark mode + i18n + push demo + a11y/focus polish). Day 35 bonus scope chua mo rong them.

## Nguyen tac dieu chinh

- Week 1 giu moc da hoan thanh cua ban (Day 1-5).
- Week 2-4 chay theo vertical slice: Auth -> Movies -> Watchlist/Review.
- Neu backend cham endpoint, khong dung tien do UI: dung mock adapter + feature flag.
- Moi ngay phai co output ro rang: code + test manual + note risk.

## Week 1 - Setup Nen Tang (Day 1-7)

Day 1 (done)
- Web Next.js + TypeScript + Tailwind + lint baseline.

Day 2 (done)
- shadcn/ui + design tokens + web shell.

Day 3 (done)
- Mobile app + navigation stack/tab co ban.

Day 4 (done)
- Redux Toolkit + RTK Query pattern dung chung web/mobile.

Day 5 (done)
- Shared contracts: Auth, Movie, Watchlist, Review.

Day 6 (next)
- Setup API client nen tang cho ca web/mobile:
  - base URL theo env.
  - auth header injection.
  - error normalize ve 1 schema thong nhat.
  - timeout/network handling.

Day 7
- Buffer + refactor nhe:
  - sap xep feature folders theo domain.
  - viet README frontend setup (run/env/architecture).

## Week 2 - Authentication UI (Day 8-14)

Day 8
- Web Login/Register UI + validation schema.

Day 9
- Web Forgot/Reset UI + loading/error/success states.

Day 10
- Mobile Login/Register screens + validation.

Day 11
- Token flow frontend hop nhat:
  - login.
  - refresh token khi 401.
  - logout va clear cache/session.

Day 12
- Protected routes (web) + protected screens (mobile).

Day 13
- UX auth polish:
  - disabled state.
  - empty state.
  - toast message.
  - redirect logic.

Day 14
- Manual E2E auth flow full (web + mobile), fix bug va chot tuan.

## Week 3 - Core Movie Features (Day 15-21)

Day 15
- Web Home section-based: Trending, Now Playing, Upcoming.

Day 16
- Web infinite scroll/pagination + skeleton loading.

Day 17
- Web Movie Detail: overview, genres, cast, trailer.

Day 18
- Web Search + filter co ban (genre/year/rating).

Day 19
- Mobile Home + reusable movie card/list.

Day 20
- Mobile Movie Detail + cast/trailer display.

Day 21
- Dong bo UX web/mobile + perf check co ban (image strategy + query cache).

## Week 4 - Watchlist + Reviews (Day 22-28)

Day 22
- Web Watchlist list/create/delete UI.

Day 23
- Web add/remove movie vao watchlist tu Home/Detail + optimistic update.

Day 24
- Mobile watchlist screens + add/remove flow.

Day 25
- Review UI web: list/create/edit/delete (neu API san sang).

Day 26
- Review UI mobile + rating input.

Day 27
- Realtime sync watchlist (Socket.IO client): web truoc, mobile sau.

Day 28
- Regression test core flows: auth, movie, watchlist, review.

## Week 5 - Polish + Bonus (Day 29-35)

Day 29
- Dark mode web + mobile.

Day 30
- i18n VI/EN cho web.

Day 31
- i18n VI/EN cho mobile.

Day 32
- Push notification mobile co ban (nhan + hien thi).

Day 33
- UI polish: spacing, typography consistency, animation vua du.

Day 34
- Accessibility pass nhanh: focus states, contrast, touch target.

Day 35
- Chot bonus kha thi, cat bo scope rui ro cao.

## Week 6 - Test + Deploy + Demo (Day 36-42)

Day 36
- Unit/component tests web: auth form, movie card, watchlist item.

Day 37
- Integration tests web cho cac page quan trong.

Day 38
- Mobile smoke/E2E test cac luong chinh.

Day 39
- Deploy web len Vercel + check env/routing.

Day 40
- Lighthouse audit + fix issue lon nhat.

Day 41
- Chuan bi script demo 5-7 phut + anh/video demo.

Day 42
- Freeze code, fix blocker bug, tong duyet truoc nop.

## Dieu chinh quan trong so voi ban cu

- Token flow Day 11 duoc hop nhat cho ca web/mobile trong cung ngay de tranh lech hanh vi.
- Realtime Day 27 ep web xong truoc roi moi mobile de giam rui ro debug Socket.
- Week 5 khong mo rong bonus som, uu tien polish va a11y truoc khi chot scope.
- Week 6 tach ro test web va mobile, tranh doi chen deployment va test cung ngay.

## Dependencies voi backend (can lock lich)

- Truoc Day 10: /auth/login, /auth/register, /auth/refresh, /auth/logout.
- Truoc Day 15: /movies/trending, /movies/now-playing, /movies/upcoming, /movies/:id, /genres, /search.
- Truoc Day 22: /watchlists CRUD.
- Truoc Day 25: /movies/:id/reviews va /reviews/:id.
- Truoc Day 27: Socket events watchlist.

## Definition of Done

- Moi man hinh co du 4 states: loading, empty, error, success.
- Type-safe theo shared contracts, tranh any.
- Pass lint + type-check truoc merge.
- Co checklist test manual ngan cho tung PR.
