FROM node:22-alpine AS base
WORKDIR /app

COPY package.json tsconfig.json ./
COPY src ./src

RUN corepack enable
RUN npm install
RUN npm run build

EXPOSE 8080
CMD ["node", "dist/server.js"]
