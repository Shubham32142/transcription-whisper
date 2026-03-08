# Architecture Cleanup Guide — [Project Name]

## Overview

This document defines the target folder structure, naming conventions, and file
organization rules for this project. It is intended to be read by AI agents
(GitHub Copilot, Cursor, etc.) to refactor, move, and rename files into the
correct structure without breaking functionality.

---

## Core Principles

1. **One responsibility per file** — a file does exactly one thing
2. **Folder = feature or layer** — group by domain, not by file type
3. **No logic in route files** — routes only handle HTTP, delegate to services
4. **No business logic in controllers** — controllers call services, services
   contain logic
5. **Shared code lives in `utils/` or `lib/`** — never duplicated across modules
6. **Types live close to where they are used** — or in a central `types/` folder
7. **Config is never hardcoded** — always comes from `.env` via a `config.ts`
   file

---

## Target Folder Structure

### Backend (Node.js / Express / TypeScript)

```
src/
│
├── config/
│   ├── index.ts              # Reads all env vars, exports typed config object
│   ├── db.ts                 # Database connection setup
│   └── logger.ts             # Logger instance (winston/pino)
│
├── routes/
│   ├── index.ts              # Registers all routers on the Express app
│   ├── auth.routes.ts        # Only: define route + attach middleware + call controller
│   ├── user.routes.ts
│   └── [feature].routes.ts
│
├── controllers/
│   ├── auth.controller.ts    # Only: parse req, call service, send res
│   ├── user.controller.ts
│   └── [feature].controller.ts
│
├── services/
│   ├── auth.service.ts       # All business logic lives here
│   ├── user.service.ts
│   └── [feature].service.ts
│
├── repositories/             # (if using DB) — raw DB queries only
│   ├── user.repository.ts
│   └── [feature].repository.ts
│
├── middleware/
│   ├── auth.middleware.ts    # JWT / API key verification
│   ├── validate.middleware.ts# Request body/query validation
│   ├── rateLimit.middleware.ts
│   └── error.middleware.ts   # Global error handler
│
├── models/                   # DB schema definitions (Mongoose/Prisma/Drizzle)
│   ├── user.model.ts
│   └── [feature].model.ts
│
├── types/
│   ├── index.ts              # Re-exports all types
│   ├── api.types.ts          # Request/Response interfaces
│   ├── db.types.ts           # DB document/entity types
│   └── [feature].types.ts
│
├── utils/
│   ├── asyncHandler.ts       # Wraps async route handlers to catch errors
│   ├── ApiError.ts           # Custom error class
│   ├── ApiResponse.ts        # Standardized response wrapper
│   └── [helper].ts           # Pure helper functions only
│
├── lib/
│   ├── ffmpeg.ts             # Third-party tool wrappers
│   ├── storage.ts            # S3 / file storage abstraction
│   └── queue.ts              # BullMQ / job queue setup
│
├── jobs/                     # Background workers / queue processors
│   └── transcription.job.ts
│
├── app.ts                    # Express app setup (middleware, routes, no listen)
└── index.ts                  # Server entry point (app.listen only)
```

---

### Frontend (Next.js / React / TypeScript)

```
src/
│
├── app/                      # Next.js App Router pages
│   ├── layout.tsx
│   ├── page.tsx
│   └── [feature]/
│       ├── page.tsx
│       └── loading.tsx
│
├── components/
│   ├── ui/                   # Dumb, reusable UI primitives (Button, Input, Modal)
│   │   ├── Button.tsx
│   │   └── Input.tsx
│   └── [feature]/            # Smart components tied to a feature
│       └── TranscriptCard.tsx
│
├── hooks/
│   ├── useAuth.ts
│   └── use[Feature].ts       # Custom React hooks
│
├── services/
│   └── api.ts                # All fetch/axios calls to backend
│
├── store/                    # Global state (Zustand / Redux)
│   └── auth.store.ts
│
├── types/
│   └── index.ts
│
├── utils/
│   └── formatters.ts         # Pure formatting helpers
│
├── lib/
│   └── axios.ts              # Configured axios instance
│
└── constants/
    └── index.ts              # App-wide constants
```

---

## Naming Conventions

| Item             | Convention                                              | Example                     |
| ---------------- | ------------------------------------------------------- | --------------------------- |
| Files            | `kebab-case` for folders, `camelCase.type.ts` for files | `auth.service.ts`           |
| React components | `PascalCase.tsx`                                        | `TranscriptCard.tsx`        |
| Interfaces       | `PascalCase` prefixed with `I` (optional)               | `IUser` or `User`           |
| Types            | `PascalCase`                                            | `ApiResponse<T>`            |
| Enums            | `PascalCase`                                            | `UserRole.ADMIN`            |
| Constants        | `UPPER_SNAKE_CASE`                                      | `MAX_FILE_SIZE_MB`          |
| Functions        | `camelCase`, verb-first                                 | `getUserById`, `parseAudio` |
| Route files      | `[feature].routes.ts`                                   | `auth.routes.ts`            |
| Test files       | mirror source path + `.test.ts`                         | `auth.service.test.ts`      |
| Env variables    | `UPPER_SNAKE_CASE`                                      | `DATABASE_URL`              |

---

## File Responsibility Rules

### Routes must ONLY:

- Define the HTTP method and path
- Attach middleware (auth, validation, rate limit)
- Call the corresponding controller method
- Nothing else — no logic, no DB calls

### Controllers must ONLY:

- Extract data from `req` (body, params, query, files)
- Call one or more service methods
- Send the response using `ApiResponse`
- Catch errors and pass to `next(err)`

### Services must ONLY:

- Contain all business logic
- Call repositories for DB operations
- Call `lib/` for third-party integrations
- Return plain data objects — never `req` or `res`

### Repositories must ONLY:

- Execute raw DB queries (find, save, update, delete)
- Return DB documents or null
- No business logic whatsoever

---

## Anti-Patterns to Fix During Cleanup

| Anti-Pattern                                                               | What to Do                                            |
| -------------------------------------------------------------------------- | ----------------------------------------------------- |
| `router.post('/upload', async (req, res) => { /* 100 lines of logic */ })` | Extract logic to a service, keep route to 5 lines     |
| DB queries directly in route files                                         | Move to a repository file                             |
| `require('dotenv').config()` scattered everywhere                          | Centralize in `config/index.ts`, import config object |
| Hardcoded strings and numbers                                              | Move to `constants/index.ts`                          |
| Duplicate helper functions across files                                    | Consolidate into `utils/`                             |
| Mixed concerns in one file (auth + user logic)                             | Split into separate feature files                     |
| `any` TypeScript types                                                     | Define proper interfaces in `types/`                  |
| `console.log` in production code                                           | Replace with logger from `config/logger.ts`           |
| Missing `asyncHandler` on async routes                                     | Wrap all async controllers                            |
| `.env` values accessed directly via `process.env` in business logic        | Route through `config/index.ts`                       |

---

## Cleanup Execution Order

When refactoring an existing messy codebase, do it in this order to avoid
breaking things:

1. **Create the folder structure** — make all empty directories first
2. **Move docs** - centralize all the md into docs/typeof doc
3. **Move config** — centralize all env/config access into `config/index.ts`
4. **Move types** — extract all interfaces and types into `types/`
5. **Move utils** — extract pure helper functions into `utils/`
6. **Create repositories** — extract all DB queries from routes/services
7. **Create services** — extract all business logic from routes
8. **Create controllers** — extract request/response handling from routes
9. **Slim down routes** — routes should now be 5–10 lines each
10. **Update all imports** — fix every broken import path
11. **Run tests** — verify nothing broke (`pnpm test`)
12. **Run linter** — clean up any leftover issues (`pnpm lint`)

---

## Config Centralization Pattern

Every project must have a single `src/config/index.ts` that looks like this:

```typescript
import "dotenv/config";

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env variable: ${key}`);
  return value;
};

export const config = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",
  db: {
    url: requireEnv("DATABASE_URL"),
  },
  auth: {
    apiKey: requireEnv("API_KEY"),
    jwtSecret: requireEnv("JWT_SECRET"),
  },
  upload: {
    maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB) || 25,
    dir: process.env.UPLOAD_DIR || "./uploads",
  },
} as const;
```

No other file should ever call `process.env` directly.

---

## Standardized API Response Shape

All API responses must use a consistent shape:

```typescript
// Success
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "file is required"
  }
}
```

Create `src/utils/ApiResponse.ts` and `src/utils/ApiError.ts` to enforce this.

---

## Cleanup Checklist

- [ ] No logic in route files
- [ ] No `process.env` outside `config/index.ts`
- [ ] No `console.log` in source files (only logger)
- [ ] No `any` type without a comment explaining why
- [ ] All async route handlers wrapped in `asyncHandler`
- [ ] All DB queries isolated in repository files
- [ ] All third-party SDK calls wrapped in `lib/`
- [ ] Consistent file naming throughout
- [ ] No duplicate helper functions
- [ ] All imports use path aliases (`@/services/...` not `../../../services/...`)
- [ ] `tsconfig.json` has path aliases configured
- [ ] `.env.example` is up to date with all variables used in `config/index.ts`
