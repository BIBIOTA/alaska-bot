FROM node:22-alpine as builder

ENV NODE_ENV build

WORKDIR /home/node

RUN npm install -g pnpm

# Files required by pnpm install
COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod

COPY --chown=node:node . .

# ---

FROM node:22-alpine

ENV NODE_ENV production

USER node
WORKDIR /home/node

COPY --from=builder --chown=node:node /home/node /home/node

CMD ["node", "index.js"]
