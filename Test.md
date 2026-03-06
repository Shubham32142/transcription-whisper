# Testing Guide — [Project Name]

## Overview

This document defines the complete testing strategy for this project. It covers
unit tests, integration tests, end-to-end tests, and guidelines for writing new
tests. This file is intended to be read by AI agents (GitHub Copilot, Cursor,
etc.) to automatically scaffold and execute the full test suite.

---

## Testing Stack

| Layer             | Tool               | Purpose                             |
| ----------------- | ------------------ | ----------------------------------- |
| Unit Tests        | Vitest / Jest      | Pure functions, utilities, services |
| Integration Tests | Supertest + Vitest | API routes with real DB/services    |
| E2E Tests         | Playwright         | Full user flows in browser          |
| Coverage          | c8 / Istanbul      | Code coverage reports               |
| Mocking           | Vitest mocks / MSW | External APIs, DB, services         |
| Load Testing      | k6                 | Stress test critical endpoints      |

> Replace tools in the table above with whatever this project actually uses.

---

## Folder Structure

```
tests/
├── unit/                   # Pure logic, no I/O
│   ├── services/           # Business logic tests
│   ├── utils/              # Helper/utility function tests
│   └── validators/         # Input validation tests
│
├── integration/            # Tests that hit real DB or services
│   ├── routes/             # API endpoint tests via Supertest
│   └── db/                 # Database query/model tests
│
├── e2e/                    # Full browser/flow tests (Playwright)
│   └── flows/
│
├── fixtures/               # Reusable test data (JSON, audio, images)
│   └── sample_audio.wav
│
├── mocks/                  # Shared mock implementations
│   ├── db.mock.ts
│   └── external-api.mock.ts
│
└── helpers/
    ├── setup.ts            # Global test setup (DB seed, env, server start)
    └── teardown.ts         # Cleanup after test runs
```

---

## Running Tests

```bash
# Run all tests
pnpm test

# Run only unit tests
pnpm test:unit

# Run only integration tests
pnpm test:integration

# Run E2E tests (requires app to be running)
pnpm test:e2e

# Run with coverage report
pnpm test:coverage

# Watch mode (development)
pnpm test:watch

# Run a specific test file
pnpm test tests/unit/services/transcriber.test.ts
```

---

## Environment for Tests

Create a `.env.test` file at the root:

```env
NODE_ENV=test
PORT=3001
DATABASE_URL=mongodb://localhost:27017/project_test    # separate test DB
API_KEY=test_api_key_123
EXTERNAL_API_URL=http://localhost:9090                 # mocked server
LOG_LEVEL=silent
```

> **Rule:** Tests must NEVER run against the production or development database.
> Always use a dedicated test DB that gets wiped before each test suite run.

---

## What to Test — Layer by Layer

### Unit Tests

Test every function in `src/utils/`, `src/services/`, and `src/validators/` in
complete isolation. No database calls, no HTTP calls, no file system access.
Mock everything external.

**Each unit test file must:**

- Mirror the source file path (e.g., `src/utils/ffmpeg.ts` → `tests/unit/utils/ffmpeg.test.ts`)
- Have a `describe` block named after the function/module
- Cover: happy path, edge cases, invalid inputs, boundary values
- Not exceed 50 lines per test case

```typescript
// Example unit test structure
describe('normalizeAudio()', () => {
  it('should return 16kHz mono WAV for valid mp3 input', async () => { ... })
  it('should throw InvalidFileError for non-audio input', async () => { ... })
  it('should handle empty file gracefully', async () => { ... })
})
```

---

### Integration Tests

Test every API route using Supertest. The real Express app runs but external
services (OpenAI, S3, email, etc.) must be mocked via MSW or manual mocks.
A real test database should be used and seeded before each suite.

**Each route test file must:**

- Cover: 200 success, 400 bad input, 401 unauthorized, 404 not found, 500 server error
- Assert both the response status code AND the response body shape
- Clean up any DB records created during the test

```typescript
// Example integration test structure
describe('POST /transcribe', () => {
  it('should return 200 with transcript for valid audio upload', async () => { ... })
  it('should return 400 if no file is attached', async () => { ... })
  it('should return 401 if API key is missing', async () => { ... })
  it('should return 415 for unsupported file type', async () => { ... })
  it('should return 413 if file exceeds size limit', async () => { ... })
})
```

---

### E2E Tests (Playwright)

Only for projects with a frontend. Test critical user flows from the browser's
perspective — login → action → outcome. Do not test UI aesthetics.

**Flows to always cover:**

1. Authentication flow (sign up, log in, log out, session expiry)
2. Core feature flow (the primary thing users do)
3. Error flow (what happens when the server is down or input is wrong)
4. Permission flow (admin vs regular user behavior)

```typescript
// Example E2E test structure
test("user can upload audio and receive transcript", async ({ page }) => {
  await page.goto("/dashboard");
  await page.setInputFiles(
    "input[type=file]",
    "tests/fixtures/sample_audio.wav",
  );
  await page.click("button[type=submit]");
  await expect(page.locator("#transcript-output")).toContainText("Hello");
});
```

---

## Mocking Guidelines

- **External HTTP APIs** (OpenAI, Stripe, etc.) — use MSW (`msw`) to intercept
  at the network level. Never make real API calls in tests.
- **Database** — use a real test DB for integration tests; use in-memory mocks
  for unit tests.
- **File system** — use `memfs` or `tmp` for temp file operations.
- **Time/Date** — always mock `Date.now()` and timers with `vi.useFakeTimers()`.
- **Environment variables** — set in `.env.test`, never hardcode in test files.

---

## Coverage Requirements

| Layer      | Minimum Coverage |
| ---------- | ---------------- |
| Statements | 80%              |
| Branches   | 75%              |
| Functions  | 85%              |
| Lines      | 80%              |

CI will fail if coverage drops below these thresholds. Run `pnpm test:coverage`
to check locally before pushing.

---

## Writing New Tests — Checklist

Before submitting a PR, verify:

- [ ] New feature has unit tests for all exported functions
- [ ] New API route has integration tests covering all status codes
- [ ] No test uses production environment variables
- [ ] No `console.log` left in test files
- [ ] All async tests use `await` — no floating promises
- [ ] Tests are deterministic — same result every run regardless of order
- [ ] No test depends on another test's state
- [ ] External APIs are mocked
- [ ] Test DB is cleaned up after the suite

---

## CI Integration

Tests run automatically on every push and pull request via GitHub Actions.
The pipeline runs in this order:

1. `pnpm lint` — fail fast on syntax errors
2. `pnpm test:unit` — fast feedback
3. `pnpm test:integration` — requires test DB service
4. `pnpm test:coverage` — enforce coverage thresholds
5. `pnpm test:e2e` — runs last (slowest)

No PR can be merged if any step fails.

---

## Common Issues

| Problem                    | Fix                                                     |
| -------------------------- | ------------------------------------------------------- |
| Tests hitting real DB      | Check `.env.test` is loaded, not `.env`                 |
| Flaky async tests          | Add proper `await` and increase timeout if needed       |
| Mock not working           | Ensure mock is registered before the module is imported |
| Port already in use        | Set `PORT=3001` in `.env.test`                          |
| Playwright browser missing | Run `npx playwright install`                            |
