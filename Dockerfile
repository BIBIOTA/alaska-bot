FROM node:18-alpine as builder

ENV NODE_ENV build

WORKDIR /home/node

RUN npm install -g pnpm

# Files required by pnpm install
COPY package.json ./

RUN pnpm install --prod

COPY --chown=node:node . .

# ---

FROM node:18-alpine

ENV NODE_ENV production

USER node
WORKDIR /home/node

COPY --from=builder --chown=node:node /home/node /home/node

CMD ["node", "index.js"]
