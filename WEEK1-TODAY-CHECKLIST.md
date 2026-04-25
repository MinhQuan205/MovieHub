# Week 1 - Execution Checklist (Web Frontend)

Audit update: 2026-04-19
Trang thai hien tai: Week 1 technical scope da on dinh. Cac muc con lai chu yeu la quy trinh team (PR/changelog/manual onboarding).

Cap nhat theo WEB-6-WEEK-ROADMAP.md.
Trang thai hien tai: da xong Day 1 -> Day 5, dang vao Day 6.

## Completed (Day 1 -> Day 5)

- [x] Day 1: Setup Next.js + TypeScript + Tailwind + baseline lint
- [x] Day 2: Setup shadcn/ui + design tokens + web layout shell
- [x] Day 3: Foundation mobile (khong block web scope)
- [x] Day 4: Redux Toolkit + RTK Query pattern cho web/mobile
- [x] Day 5: Shared contracts (Auth, Movie, Watchlist, Review) trong packages/shared

## Day 6 - API Client Foundation (Today)

### Task checklist
- [x] Tao `baseApiClient` cho web (Axios hoac RTK baseQuery wrapper)
- [x] Doc `NEXT_PUBLIC_API_BASE_URL` tu env va fallback an toan
- [x] Inject auth header (`Authorization: Bearer ...`) neu co token
- [x] Chuan hoa loi ve 1 schema dung chung (code/message/details)
- [x] Them helper map server error -> UI-friendly message
- [x] Xu ly timeout + network error state rieng

### Verification
- [x] Chay duoc web dev server on dinh (webpack)
- [ ] API client goi thu endpoint mock/health thanh cong
- [x] `npm run lint -w apps/web` pass
- [x] `npm run build -w apps/web` pass
- [x] Re-check 2026-04-19: `npm run lint:web` pass
- [x] Re-check 2026-04-19: `npm run build:web` pass

### End-of-day output
- [ ] Commit code Day 6
- [ ] Ghi changelog ngan vao PR note hoac README

## Day 7 - Refactor + Frontend README

### Task checklist
- [x] Chia folder web theo domain:
	- [x] `src/features/auth`
	- [x] `src/features/movies`
	- [x] `src/features/watchlist`
	- [x] `src/features/reviews`
- [x] Di chuyen files RTK Query/store lien quan vao cau truc moi
- [x] Dam bao import path gon, khong vong lap phu thuoc
- [x] Viet README frontend setup:
	- [x] Cac lenh run
	- [x] Env vars can thiet
	- [x] Giai thich architecture ngan (store/api/features)

### Verification
- [x] Chay lai app sau refactor khong vo route
- [x] Lint/type-check xanh
- [ ] Team member khac pull ve chay duoc trong <= 10 phut

### End-of-week output
- [ ] Tao PR Week 1 web
- [ ] Checklist review truoc merge: lint + build + smoke test

## Dev commands

```powershell
# Web stable dev mode (webpack)
npm run dev:web

# Optional
npm run lint:web
npm run build:web
```

## Suggested commits

```powershell
# Day 6
git add .
git commit -m "feat(web): add base api client and normalized error handling"

# Day 7
git add .
git commit -m "refactor(web): reorganize feature folders and update frontend readme"
```
