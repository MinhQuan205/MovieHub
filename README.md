# MovieHub Backend

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-7.x-47A248?logo=mongodb&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7.x-DC382D?logo=redis&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-30.x-C21325?logo=jest&logoColor=white)
![Coverage](https://img.shields.io/badge/Coverage->77%25-brightgreen)

**REST API backend for MovieHub — a movie discovery and watchlist mobile application.**

[API Docs](#api-documentation) · [Quick Start](#quick-start) · [Architecture](#architecture) · [Testing](#testing) · [Deployment](#deployment)

</div>

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Quick Start](#quick-start)
5. [Environment Variables](#environment-variables)
6. [API Documentation](#api-documentation)
7. [Architecture](#architecture)
8. [Testing](#testing)
9. [Deployment](#deployment)
10. [Contributing](#contributing)

---

## Overview

MovieHub Backend is a production-ready Express.js REST API that powers the MovieHub mobile application. It handles authentication, movie data aggregation from TMDB, real-time watchlist synchronization via Socket.IO, push notifications through Firebase Cloud Messaging (FCM), and full-text search via Elasticsearch.

**Key features:**
- 🔐 JWT authentication with refresh token rotation + Redis blacklist
- 🎬 TMDB API integration with Redis caching (TTL-based)
- 🔍 Elasticsearch fuzzy search with automatic TMDB fallback
- 📋 Watchlist CRUD with real-time Socket.IO sync across devices
- 🔔 Push notifications via FCM + BullMQ background job queue
- 📸 Avatar upload to AWS S3 with presigned URLs
- 📄 Full OpenAPI 3.0 documentation (Swagger UI)
- 🧪 >77% test coverage (Jest + Supertest + mongodb-memory-server)

---

## Tech Stack

| Category | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| Language | TypeScript | 6.x |
| Framework | Express.js | 5.x |
| Database | MongoDB + Mongoose | 7.x / 9.x |
| Cache | Redis (ioredis) | 7.x |
| Auth | JWT + Passport.js | — |
| Real-time | Socket.IO | 4.x |
| Job Queue | BullMQ | 5.x |
| Search | Elasticsearch | 8.x |
| Storage | AWS S3 | SDK v3 |
| Push Notifications | Firebase Admin (FCM) | 13.x |
| Email | SendGrid | 8.x |
| Validation | Joi | 18.x |
| Logging | Winston + Morgan | — |
| API Docs | Swagger UI Express | 5.x |
| Testing | Jest + Supertest | 30.x |

---

## Project Structure

```
backend/
├── src/
│   ├── admin/               # Bull Board queue dashboard
│   ├── config/              # Env validation + config object
│   ├── jobs/
│   │   ├── queues/          # BullMQ queue definitions
│   │   └── processors/      # Job processors (notification, cache, release)
│   ├── middleware/          # Auth, rate limit, cache, error handler, logger
│   ├── models/              # Mongoose schemas (User, Watchlist, Review, Notification)
│   ├── modules/             # Feature modules (controller + service + routes + test)
│   │   ├── auth/
│   │   ├── health/
│   │   ├── movies/
│   │   ├── notifications/
│   │   ├── reviews/
│   │   ├── search/
│   │   ├── users/
│   │   └── watchlist/
│   ├── services/            # Shared services (TMDB, Redis, FCM, S3, Elasticsearch)
│   ├── sockets/             # Socket.IO server + watchlist events
│   ├── types/               # Express type augmentations
│   ├── utils/               # apiResponse, AppError, asyncHandler, logger, pagination
│   ├── app.ts               # Express setup + middleware stack + route mounting
│   └── server.ts            # HTTP server + Socket.IO + graceful shutdown
├── k6/                      # Load test scripts (k6)
├── .env.example             # Environment variable template
├── jest.config.js
├── swagger.yaml             # OpenAPI 3.0 specification
└── tsconfig.json
```

---

## Quick Start

### Prerequisites

- **Node.js** 20 LTS — [download](https://nodejs.org/)
- **Docker Desktop** — [download](https://www.docker.com/products/docker-desktop/)
- A **TMDB API key** — [get one free](https://www.themoviedb.org/settings/api)

### Option A — Docker (Recommended)

Start MongoDB, Redis, and the backend API together:

```bash
# Clone the repository
git clone https://github.com/MinhQuan205/MovieHub.git
cd MovieHub

# Copy env file and fill in required values
cp backend/.env.example backend/.env
# Edit backend/.env — set TMDB_API_KEY and JWT secrets at minimum

# Start all services
docker compose up
```

API will be available at `http://localhost:4000`

### Option B — Local Development

```bash
# Start MongoDB and Redis via Docker (infrastructure only)
docker compose up mongo redis -d

# Install backend dependencies
cd backend
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env — see Environment Variables section below

# Start development server (hot reload)
npm run dev
```

### Verify the server is running

```bash
curl http://localhost:4000/api/v1/health
# Expected: { "status": "ok", "mongodb": "connected", "redis": "connected" }
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values.

### Required (all environments)

| Variable | Description | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/moviehub` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `JWT_ACCESS_SECRET` | Secret for signing access tokens (min 16 chars) | `your-long-random-secret` |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens (min 16 chars) | `another-long-random-secret` |
| `TMDB_API_KEY` | TMDB API Bearer token | `eyJhb...` |

### Optional (features degrade gracefully without these)

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `4000` |
| `NODE_ENV` | Environment (`development`/`test`/`production`) | `development` |
| `API_PREFIX` | API route prefix | `/api/v1` |
| `CORS_ORIGIN` | Comma-separated allowed origins | `""` (all) |
| `JWT_ACCESS_EXPIRES` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRES` | Refresh token TTL | `7d` |
| `ELASTICSEARCH_URL` | Elasticsearch URL (search falls back to TMDB if missing) | `""` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | `""` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret | `""` |
| `GOOGLE_CALLBACK_URL` | Google OAuth callback URL | `""` |
| `SENDGRID_API_KEY` | SendGrid API key for transactional email | `""` |
| `EMAIL_FROM` | Sender email address | `""` |
| `AWS_REGION` | AWS region for S3 | `""` |
| `AWS_S3_BUCKET` | S3 bucket name for avatar uploads | `""` |
| `FIREBASE_PROJECT_ID` | Firebase project ID (FCM push notifications) | `""` |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email | `""` |
| `FIREBASE_PRIVATE_KEY` | Firebase private key (PEM, `\n` escaped) | `""` |
| `RATE_LIMIT_MAX_REQUESTS` | Global rate limit per window | `100` |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | Auth endpoint rate limit per window | `10` |

> **Note:** In `production`/`staging`, MongoDB, Redis, JWT secrets, TMDB key, CORS origin, SendGrid, and AWS variables are **required** — the server will throw on startup if any are missing.

---

## API Documentation

Interactive Swagger UI is available at:

```
http://localhost:4000/api/docs
```

**Base URL:** `http://localhost:4000/api/v1`

### Endpoints Summary

| Tag | Endpoints | Auth |
|---|---|---|
| **Auth** | Register, Login, Logout, Refresh, Me, Google OAuth, Verify Email, Forgot/Reset Password | Public / JWT / Cookie |
| **Movies** | Trending, Now Playing, Popular, Top Rated, Upcoming, Detail, Similar, Genres, Discover | Public |
| **Persons** | Person Detail, Person Credits | Public |
| **Search** | Full-text Search, Autocomplete Suggestions | Public |
| **Watchlist** | Create, List, Update, Delete, Add Movie, Remove Movie | JWT |
| **Reviews** | List, Create, Update, Delete, Like, Report | Public / JWT |
| **Users** | Get Profile, Update Profile, Upload Avatar | JWT |
| **Notifications** | List, Mark Read, Mark All Read, Register FCM Token, Remove FCM Token | JWT |

### Response Format

```json
// ✅ Success
{
  "success": true,
  "data": { ... },
  "message": "OK",
  "meta": { "page": 1, "limit": 20, "total": 150, "totalPages": 8, "hasNext": true }
}

// ❌ Error
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Movie not found" }
}
```

### Authentication

All protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

Access tokens expire in **15 minutes**. Use `POST /api/v1/auth/refresh` with the `refreshToken` cookie to get a new one.

---

## Architecture

```
Client (Mobile App)
        │
        ▼
   Express.js API  ──────────────────────────────────┐
        │                                             │
   ┌────┴────┐                                   Socket.IO
   │  Routes │                                   (real-time)
   └────┬────┘
        │
   ┌────▼────────┐    ┌──────────────┐    ┌──────────────────┐
   │ Controllers │───▶│   Services   │───▶│  External APIs   │
   └─────────────┘    └──────┬───────┘    │  - TMDB          │
                             │            │  - Firebase FCM   │
                    ┌────────▼────────┐   │  - AWS S3        │
                    │  MongoDB        │   │  - SendGrid      │
                    │  (Mongoose)     │   │  - Elasticsearch │
                    └────────┬────────┘   └──────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Redis Cache    │
                    │  + Blacklist    │
                    └─────────────────┘
                             │
                    ┌────────▼────────┐
                    │  BullMQ Queues  │
                    │  - Notifications│
                    │  - Emails       │
                    │  - Cache Inval. │
                    └─────────────────┘
```

**Key design decisions:**
- **Cache-aside pattern** for all TMDB responses (Redis TTL varies by endpoint: 15min–7d)
- **Search fallback**: Elasticsearch primary → TMDB API fallback (no cache on search)
- **JWT blacklist**: Redis SET stores revoked JTIs — checked on every authenticated request
- **Singleton pattern** for Redis, Firebase, BullMQ connections with graceful init
- **Ownership guard** on all user-scoped resources (watchlist, review, notification)

---

## Testing

```bash
# Run all tests
npm run test

# Run with coverage report
npm run test -- --coverage --forceExit

# Run a specific test file
npm run test -- --testPathPatterns="auth.test"

# Run with open handles detection
npm run test -- --detectOpenHandles
```

**Coverage (as of Week 6):**

| Metric | Result | Target |
|---|---|---|
| Statements | >77% | >70% ✅ |
| Functions | >79% | >70% ✅ |
| Lines | >78% | >70% ✅ |
| Branches | >62% | >60% ✅ |

**Test strategy:**
- **Integration tests** — `mongodb-memory-server` + `supertest` for API routes (auth, movies, watchlist, reviews, users, notifications, search)
- **Unit tests** — `jest.mock` for isolated service tests (FCM, Redis, BullMQ processor)
- **Load tests** — `k6` scripts in `k6/` directory (requires [k6](https://k6.io/) installed separately)

```bash
# Load test (requires k6)
k6 run k6/load-test.js
```

---

## Deployment

### Docker Build

```bash
# Build production image
docker build -t moviehub-backend:latest ./backend

# Run with env file
docker run -p 4000:4000 --env-file ./backend/.env moviehub-backend:latest
```

### Queue Dashboard

BullMQ queue monitoring is available at (development only):

```
http://localhost:4000/admin/queues
```

### Available npm scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload (ts-node-dev) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server from `dist/` |
| `npm run lint` | ESLint check |
| `npm run type-check` | TypeScript type check (no emit) |
| `npm run test` | Run Jest test suite |

---

## Contributing

```bash
# Before every commit
npm run lint && npm run type-check && npm run test

# Branch naming
feat/A-<feature-name>   # new feature
fix/A-<bug-name>        # bug fix
chore/A-<task>          # maintenance

# Commit convention
feat(auth): add Google OAuth2 callback handler
fix(search): handle Elasticsearch connection timeout
test(notifications): add FCM token dedup integration test
```

All PRs must pass CI (lint + type-check + test) before merge.

---

<div align="center">

**MovieHub Backend** — Built with ❤️ using Node.js, TypeScript, and Express.js

</div>
