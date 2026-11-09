FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
ENV NODE_ENV=production DB_PATH=/app/data/shuker.db
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "--no-warnings", "src/index.js"]
