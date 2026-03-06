# CI/CD Pipeline Setup Guide

This repository has automated checks configured to run **BEFORE pushing** and on every push/pull request to GitHub.

## 🛡️ Pre-Push Protection

**All checks run locally BEFORE pushing to prevent bad code from reaching GitHub!**

When you run `git push`, a **pre-push hook** automatically:
1. ✅ Installs dependencies
2. ✅ Runs ESLint (unused vars = ❌ error)
3. ✅ Runs TypeScript type checking
4. ✅ Builds the project

**If ANY check fails, the push is blocked!**

## What Gets Checked

### API (Node.js/TypeScript)

1. **Linting** - ESLint checks for code quality issues
   - ❌ **Unused variables are ERRORS** (not warnings)
   - Uses variables prefixed with `_` are allowed (e.g., `_unusedVar`)
   - Checks for `any` types, floating promises, and more

2. **Type Checking** - TypeScript compiler checks
   - Strict mode enabled
   - Checks for unused locals and parameters
   - Verifies all return types and switch cases

3. **Build Verification** - Ensures code compiles
   - Compiles TypeScript to JavaScript
   - Verifies dist/ directory is created
   - Checks module resolution

### ML Service (Python)

1. **Linting** - Flake8 for Python code quality
2. **Type Checking** - MyPy for static type analysis
3. **Code Formatting** - Black and isort checks
4. **Syntax Check** - Validates Python syntax
5. **Import Check** - Verifies module structure

## Running Checks Locally

### Before Every Push (Automatic)
The pre-push hook runs automatically when you push. **You don't need to do anything!**

```bash
git push  # Hook runs automatically
```

### Manual Testing (Optional)

### API Checks

```bash
cd api

# Install dependencies (first time)
pnpm install

# Run all checks at once
pnpm check

# Run individual checks
pnpm lint              # ESLint (unused vars = error)
pnpm lint:fix          # Auto-fix issues
pnpm type-check        # TypeScript type checking
pnpm build             # Build verification
pnpm format            # Format code with Prettier
pnpm format:check      # Check formatting
```

### ML Service Checks

```bash
# Install Python linting tools
pip install flake8 mypy black isort

# Run checks
black ml/              # Format code
isort ml/              # Sort imports
flake8 ml/             # Lint
mypy ml/               # Type check
```

## Pre-Commit Checks

Before committing, run:

```bash
cd api
pnpm precommit         # Runs lint + type-check
```

## Pre-Push Hook Behavior

When you try to push: as a backup verification:

```
┌─────────────────────────────────────────┐
│  On Push/PR to main or develop branch  │
│  (After pre-push checks already passed)
🔍 Running pre-push checks...

📦 Installing dependencies...
✓ Dependencies installed

🔧 Running ESLint (unused vars = error)...
✓ No linting errors

🔍 Running TypeScript type checking...
✓ No type errors

🏗️  Building project...
✓ Build successful

✅ All pre-push checks passed!
🚀 Proceeding with push...
```

### If Checks Fail

```
$ git push

🔧 Running ESLint (unused vars = error)...
❌ ESLint failed! Fix linting errors before pushing.
   Run: cd api && pnpm lint:fix

error: failed to push some refs
```

**The push is blocked until you fix the issues!**

## Bypassing Pre-Push Checks (Not Recommended)

Only use this in emergencies:
```bash
git push --no-verify
```

## CI/CD Pipeline Stages

The GitHub Actions workflow runs automatically:

```
┌─────────────────────────────────────────┐
│  On Push/PR to main or develop branch  │
└─────────────────────────────────────────┘
                    ↓
        ┌──────────────────────┐
        │   Parallel Jobs      │
        └──────────────────────┘
                    ↓
    ┌───────────────────────────────┐
    │                               │
┌───┴────────┐              ┌───────┴────────┐
│ API Checks │              │ ML Checks      │
│            │              │                │
│ 1. Lint    │              │ 1. Flake8      │
│ 2. Types   │              │ 2. MyPy        │
│ 3. Build   │              │ 3. Black       │
│ 4. Modules │              │ 4. isort       │
└────────────┘              └────────────────┘
                    ↓
        ┌──────────────────────┐
        │  All Checks Passed   │
        │   ✅ Deploy Ready    │
        └──────────────────────┘
```

## Fixing Common Issues

### Unused Variable Errors

```typescript
// ❌ Error: 'unused' is declared but never used
const unused = 123;

// ✅ Fix 1: Use the variable
const used = 123;
console.log(used);

// ✅ Fix 2: Prefix with underscore
const _unused = 123;

// ✅ Fix 3: Remove it
// (deleted line)
```

### Type Errors

```typescript
// ❌ Error: any type not allowed
function bad(x: any) {}

// ✅ Fix: Use proper types
function good(x: string) {}
```

### Missing Return Types

```typescript
// ❌ Error: Missing return type
async function fetch() {}

// ✅ Fix: Add return type
async function fetch(): Promise<void> {}
```

## Pipeline Status

You can view the pipeline status on GitHub:

- Go to your repository
- Click "Actions" tab
- See build status for each commit

## Troubleshooting

If pipeline fails:

1. **Check the logs** - Click on failed job in GitHub Actions
2. **Run locally** - Use `pnpm check` in api/ directory
3. **Fix issues** - Follow error messages
4. **Commit & push** - Pipeline runs again automatically

## Configuration Files

- `.github/workflows/ci.yml` - GitHub Actions workflow
- `api/.eslintrc.js` - ESLint rules (unused vars = error)
- `api/.prettierrc.js` - Code formatting rules
- `api/tsconfig.json` - TypeScript strict configuration
- `setup.cfg` - Python linting configuration
