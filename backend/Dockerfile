# syntax=docker/dockerfile:1

# Stage di build: richiede le devDependencies (tsoa, tsx, typescript) per
# rigenerare src/routes (gitignored, vedi tsoa.json) e compilare in dist/.
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Immagine finale: solo dist/ compilato + dipendenze di produzione.
# postgresql16-client fornisce pg_dump/pg_restore usati da backupService.ts
# come processi esterni (vedi README, PG_DUMP_PATH/PG_RESTORE_PATH in
# .env.example) — il "16" deve restare allineato alla major dell'immagine
# postgres usata per il servizio "db" in docker-compose.yml.
FROM node:24-alpine AS runtime
RUN apk add --no-cache postgresql16-client
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p backups

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000', r => process.exit(0)).on('error', () => process.exit(1))"

# L'entrypoint applica le migration pendenti (schema_migrations, stesso
# meccanismo di `npm run migrate:up`) prima di avviare il server: necessario
# perché qui non c'è uno sviluppatore che lancia il comando a mano dopo il
# deploy.
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
