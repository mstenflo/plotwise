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
- AWS CLI and Session Manager plugin (for RDS over SSM)

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

If you are using the local Docker database, the default example values already point to `localhost:5432`.

If you are using the personal RDS instance through an SSM tunnel, keep your RDS credentials in `backend/.env` and make sure the tunnel override is present:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=5432
DB_SSL=true
```

`DB_HOST` and `DB_PORT` override the host and port inside `DATABASE_URL`, so you do not need to rewrite the full connection string just to use the tunnel.

### 4. Choose a database path

For local Docker PostgreSQL:

```bash
docker compose up -d postgres
```

For the personal RDS instance over SSM, use the one-command startup:

```bash
npm run dev:rds
```

This command:

- Starts the SSM port-forwarding tunnel to RDS
- Waits for `127.0.0.1:5432` to be ready
- Runs frontend and backend dev servers
- Closes the tunnel when you stop the app

It uses these defaults:

- `AWS_REGION=us-east-2`
- `RDS_BASTION_INSTANCE_ID=i-0431b05da5c97b8cc`
- `RDS_HOST=plotwise-sql.crauuk6ck45m.us-east-2.rds.amazonaws.com`
- `RDS_PORT=5432`
- `LOCAL_DB_PORT=5432`

Override them for a different bastion or database, for example:

```bash
AWS_REGION=us-east-1 RDS_BASTION_INSTANCE_ID=i-abc123 npm run dev:rds
```

### 5. Run the full app with local Docker PostgreSQL

```bash
npm run dev
```

This starts:

- Frontend at http://localhost:4200
- Backend API at http://localhost:3000

The `dev` and `dev:rds` scripts both run backend migrations before starting the API.

## Running Services Separately

Frontend only:

```bash
npm run start:frontend
```

Backend only:

```bash
npm run start:backend
```

RDS tunnel + frontend/backend together:

```bash
npm run dev:rds
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
