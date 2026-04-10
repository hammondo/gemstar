# ── Build stage ───────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS builder

WORKDIR /build

# Dashboard deps + build
COPY dashboard/package*.json ./dashboard/
RUN npm ci --prefix dashboard
COPY dashboard/ ./dashboard/
ARG VITE_API_BASE_URL
RUN VITE_API_BASE_URL=$VITE_API_BASE_URL npm run build --prefix dashboard

# Server deps + build
COPY server/package*.json ./server/
RUN npm ci --prefix server
COPY server/ ./server/
RUN npm run build --prefix server
# Prune to prod-only so we can copy a lean node_modules to runtime
RUN npm prune --prefix server --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS runtime

WORKDIR /app

# Copy pre-built, pre-pruned server node_modules from builder (avoids recompiling native addons)
COPY --from=builder /build/server/node_modules ./server/node_modules

# Install Playwright's Chromium (system deps already present in base image)
RUN cd /app/server && npx playwright install chromium

# Copy build artifacts and static config
COPY --from=builder /build/server/dist ./server/dist
COPY --from=builder /build/dashboard/dist ./dashboard/dist
COPY server/config ./server/config

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "--enable-source-maps", "/app/server/dist/index.js"]
