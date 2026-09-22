# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

ENV NODE_ENV=production

# Librerie di sistema richieste da Chromium (scaricato dal postinstall di Puppeteer)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
    libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
    libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 \
    libxkbcommon0 xdg-utils wget \
    && rm -rf /var/lib/apt/lists/*

# Installa le dipendenze prima del codice, così il layer resta in cache
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . .

ENTRYPOINT [ "bun", "run", "start" ]
