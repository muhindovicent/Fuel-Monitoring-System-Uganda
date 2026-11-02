FROM node:22-alpine AS build
WORKDIR /service
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /service
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /service/dist ./dist
COPY scripts ./scripts
COPY migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
