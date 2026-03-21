One-time setup on Railway:

  1. Create a new project → "Deploy from GitHub repo"
  2. Set Root Directory to skelly/
  3. Add your env vars (copy from .env.example)
  4. Add a Volume mounted at /data, then set DATA_DIR=/data
  5. Push to main → Railway picks it up automatically from there

  One-time setup on Vercel (website):

  1. Import GitHub repo → set Root Directory to website/
  2. Framework auto-detected as Next.js
  3. Add your Sanity env vars → deploy

  After that, every push to main auto-deploys both.