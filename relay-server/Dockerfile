FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY bin ./bin
COPY src ./src
COPY README.md ./README.md

EXPOSE 8788

CMD ["node", "./bin/relay-server.mjs"]
