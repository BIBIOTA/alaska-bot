FROM node:18-slim as builder

ENV NODE_ENV build

WORKDIR /home/node

RUN npm install -g pnpm

# Files required by pnpm install
COPY package.json ./

RUN pnpm install --prod

COPY --chown=node:node . .

# ---

FROM node:18-slim

# Install dependencies needed by Chrome
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libasound2 \
    libnss3 \
    libxss1 \
    libxcomposite1 \
    libxrandr2 \
    libxdamage1 \
    libgbm1 \
    wget \
    ca-certificates \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium
    
ENV NODE_ENV production

USER node
WORKDIR /home/node

COPY --from=builder --chown=node:node /home/node /home/node/

CMD ["node", "index.js"]
