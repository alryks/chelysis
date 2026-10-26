FROM oven/bun:1.3.14-debian AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json bun.lock ./
COPY frontend/package.json ./frontend/package.json
COPY packages/chess/package.json ./packages/chess/package.json
RUN bun install --frozen-lockfile

FROM dependencies AS source
COPY . .
RUN bun frontend/scripts/prepare-engine.ts

FROM source AS development
EXPOSE 3000
CMD ["bun", "run", "dev"]

FROM source AS test
CMD ["sh", "-c", "bun run test && bun run typecheck && bun run lint"]

FROM source AS builder
RUN bun run build

FROM oven/bun:1.3.14-debian AS production
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=bun:bun /app/frontend/.next/standalone ./
COPY --from=builder --chown=bun:bun /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder --chown=bun:bun /app/frontend/public ./frontend/public
USER bun
EXPOSE 3000
CMD ["bun", "frontend/server.js"]
