# Free Hosting Options

This project is harder to host for free than a typical CRUD web app because it needs:

- A public Node/Express API that also serves the frontend
- A Python ML service that loads a Whisper model
- `ffmpeg` for audio preprocessing
- Persistent database storage for API keys and transcription metadata

## What The Current Codebase Implies

The current app is not just a static frontend.

- The frontend is served by the Express app from `api/public`
- Browser requests currently use same-origin paths such as `/api/config` and `/transcribe`
- The API calls a separate ML service using `ML_SERVICE_URL`
- Supabase is already supported and is the best fit for free database hosting

That means a fully free deployment is possible only if you accept at least one of these tradeoffs:

- Cold starts or sleeping services
- Smaller Whisper models such as `tiny`, `base`, or `small`
- Slower CPU transcription
- Demo-grade reliability instead of production-grade uptime

## Reality Check

If you want end users to use this publicly at no cost to you, the most realistic path is:

- Supabase Free for the database
- Render Free for the Node API and static frontend
- A separate free ML host for the Whisper service

Trying to run both the API and ML service together on a single free web service is not realistic for this repo in its current form. The ML side needs more memory and CPU than most free always-on app tiers provide, especially if you keep using `large-v3`.

## Recommended Options

### Option 1: Render + Hugging Face + Supabase

Best fit with the least disruption to the current structure.

- Host the Node API on Render Free
- Keep serving the frontend from the same Node service
- Host the ML service separately on Hugging Face Spaces CPU Basic or another free ML-friendly host
- Use Supabase Free for database storage

Why this works:

- Render supports free web services, but they spin down after 15 minutes idle and take about a minute to wake up
- Hugging Face Spaces offers free CPU hosting and is more suitable for a Whisper demo than a generic Node host
- Supabase Free already matches the project's database direction

Required app choices:

- Use `small` as the default public model
- Treat `medium` as experimental
- Avoid `large` for public free hosting

Pros:

- Fits the current split architecture
- No mandatory frontend rewrite
- Free database is straightforward

Cons:

- First request after idle will be slow on Render
- Free ML hosting is still limited and may queue or throttle
- Public usage volume must stay low

### Option 2: Cloudflare Pages + Render API + Hugging Face + Supabase

Best if you want the frontend to feel fast and always available.

- Host only the static frontend on Cloudflare Pages
- Host the Node API on Render Free
- Host the ML service on Hugging Face Spaces
- Use Supabase Free for storage

Why this is attractive:

- Cloudflare Pages free tier is strong for static delivery
- The landing page stays fast even when the API is sleeping

What must change first:

- The frontend currently calls same-origin endpoints such as `/api/config` and `/transcribe`
- You would need a configurable API base URL or a reverse proxy setup
- If the frontend and API are split across domains, review CORS and the Express CSP settings

Pros:

- Best user experience for the UI
- Frontend remains free and effectively always available

Cons:

- Requires code changes before deployment
- API cold starts still exist
- Slightly more operational complexity

### Option 3: Hugging Face Demo-First Deployment

Best for a public demo, not for a general user-facing app.

- Package the user experience as a Hugging Face Space
- Use a small model only
- Keep Supabase only if you still need persistent API/admin features

This is a good path if your main goal is showing transcription capability publicly, but it is not the best fit for the current Node-admin-plus-static-site architecture.

### Option 4: Railway + Hugging Face + Supabase

Best if you want a cleaner developer workflow and are okay with near-free instead of strictly free.

- Host the Node API on Railway Free or Hobby
- Host ML separately on Hugging Face Spaces
- Keep Supabase Free for database

Important pricing reality:

- Railway offers a 30-day trial with credits
- Railway Free then includes limited monthly credit and small per-service resources
- Railway Hobby is a paid subscription with included usage credit

Why this matters for this repo:

- Railway Free resource limits are usually enough for the API layer
- Railway Free is generally not enough for reliable Whisper inference in the same service
- Treat Railway as API host only unless you are paying for more compute

Pros:

- Excellent DX for Docker and service linking
- Good path from prototype to paid scale
- More predictable than juggling multiple fragile free compute hosts

Cons:

- Not a guaranteed forever-free full solution
- Costs can appear once trial/free credits are exhausted

## Options That Look Free But Are Poor Fits

### Render Only

Not recommended for the full stack on free tier.

- Free Node hosting exists
- Free services spin down after 15 minutes idle
- Filesystem is ephemeral
- The ML service and model footprint make a single free Render deployment a weak fit

### Fly.io

Not recommended if your requirement is fully free hosting.

- Current pricing is usage-based
- Free allowances are legacy-only for older organizations
- New deployments should be treated as paid

### Koyeb

Not a reliable answer for strictly free hosting here.

- Current pricing is usage-based with included compute on paid plans
- Good platform, but not the cleanest answer when the requirement is zero ongoing cost

### Railway (for strict zero-cost requirement)

Useful platform, but it should be treated as trial/credit-based for this workload.

- Free access includes tight resource caps and limited monthly credits
- Hobby plan is explicitly paid
- Practical fit for API hosting on low traffic, not for full Whisper inference at scale

## Vendor Notes Verified During Research

- Render Free web services spin down after 15 minutes idle, lose local filesystem changes, and have monthly limits
- Supabase Free includes a Postgres database, 500 MB DB size, and pauses projects after inactivity
- Cloudflare Pages Free is strong for static hosting with generous bandwidth and request limits
- Fly.io no longer offers a general free tier to new customers
- Railway has a trial and low-cost entry, but not a robust forever-free path for this full stack

## Recommended Setup For This Repo

If the goal is public access with zero monthly spend, choose this:

1. Supabase Free for database
2. Render Free for the API plus static frontend
3. Hugging Face Spaces for the ML service
4. Default model set to `small`

This is the closest thing to a usable free deployment for the current codebase.

If you can accept very low monthly spend for better stability, swap Render API for Railway API.

## If You Want Better Reliability

The first dollar should go to compute, not the database.

Upgrade path:

1. Keep Supabase on free
2. Move API to a paid low-end instance or VPS
3. Keep ML on its own host or move both services onto one paid VM with Docker Compose

That gives you a materially better product than trying to force Whisper inference into multiple sleeping free services.
