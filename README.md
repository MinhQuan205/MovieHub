# MovieHub Backend

This repository currently contains the backend foundation for MovieHub. The mobile app is owned separately by the mobile teammate, so backend work should avoid creating or modifying `mobile/` files unless the team explicitly coordinates that change.

## Project Structure

```text
MovieHub/
├── backend/              # Express.js API
├── .github/workflows/    # Backend CI pipeline
└── docker-compose.yml    # Local backend + MongoDB + Redis stack
```

Docker Compose is intentionally kept at the repository root so `docker compose up` works without extra path flags.

## Prerequisites

- Node.js 20 LTS
- npm
- Docker Desktop

## Backend Setup

```bash
cd backend
npm install
npm run dev
```

Useful checks:

```bash
npm run lint
npm run type-check
npm test -- --runInBand
```

The backend health endpoint is:

```text
GET http://localhost:4000/api/v1/health
```

## Docker

Start the local stack:

```bash
docker compose up
```

Stop and remove volumes:

```bash
docker compose down -v
```

View logs:

```bash
docker compose logs -f backend
docker compose logs -f mongo
docker compose logs -f redis
```

## CI

GitHub Actions runs backend install, lint, type-check, and tests with MongoDB and Redis services.

## Week 1 Backend Status

Week 1 backend foundation includes Express + TypeScript setup, MongoDB schemas, Redis/Docker, middleware, health checks, and CI. Authentication APIs are intentionally left for Week 2.
