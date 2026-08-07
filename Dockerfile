FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4021
ENV DATA_DIR=/app/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY config ./config
COPY public ./public

# Reservations and the ledger live here — mount a volume to keep them across deploys.
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 4021
CMD ["node", "dist/server.js"]
