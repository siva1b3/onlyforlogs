FROM node:25.2.1-bookworm-slim

WORKDIR /app

COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev

COPY app/src/ ./src/

EXPOSE 3001

CMD ["node", "src/index.js"]