# Plotwise

Plotwise is a garden planning app for designing beds, assigning crops, and tracking seasonal work.

It includes:

- An interactive planner canvas with zoom, pan, and grid snapping
- Support for rectangular and polygon bed layouts
- Seed library and bed-to-crop assignment
- Multi-project workflows with archive and duplication
- Task and planting synchronization through a NestJS API

## Tech Stack

- Frontend: Angular 21
- Backend: NestJS 11 + TypeORM
- Database: PostgreSQL 16
- Canvas rendering: Konva

## Quick Start (Local)

### 1. Prerequisites

- Node.js 22+ (recommended)
- npm 11+
- Docker Desktop (for local PostgreSQL)

### 2. Install dependencies

From the repository root:

```bash
npm install
```

Install backend dependencies:

```bash
cd backend
npm install
cd ..
```

### 3. Configure backend environment

```bash
cp backend/.env.example backend/.env
```

### 4. Start PostgreSQL

```bash
docker compose up -d postgres
```

### 5. Run the full app (frontend + backend)

```bash
npm run dev
```

This starts:

- Frontend at http://localhost:4200
- Backend API at http://localhost:3000

The `dev` script also runs backend migrations before starting the API.

## Running Services Separately

Frontend only:

```bash
npm run start:frontend
```

Backend only:

```bash
npm run start:backend
```

## Testing

Frontend tests:

```bash
npm test -- --watch=false
```

Backend tests:

```bash
cd backend
npm test
```

Backend e2e tests:

```bash
cd backend
npm run test:e2e
```

## Build

Frontend production build:

```bash
npm run build
```

Backend production build:

```bash
cd backend
npm run build
```
