# Dockerfile for telegram-bot service (multi-stage build)

# Builder stage: installs dependencies and builds TypeScript
FROM node:20-alpine AS builder

# Install build deps
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first for caching
COPY telegram-bot/package.json telegram-bot/package-lock.json* ./telegram-bot/

# Copy entire telegram-bot source
COPY telegram-bot ./telegram-bot

WORKDIR /app/telegram-bot

# Install and build
RUN npm ci --silent
RUN npm run build --if-present

# Runtime stage
FROM node:20-alpine
WORKDIR /app/telegram-bot

# Copy built artifacts and package.json
COPY --from=builder /app/telegram-bot .

ENV NODE_ENV=production

# Start the app
CMD ["npm", "start"]
