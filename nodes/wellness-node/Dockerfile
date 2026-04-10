FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY node.js ./
COPY lib/ ./lib/
COPY handlers/ ./handlers/

ENV PORT=8080
ENV NODE_ENV=production
ENV NODE_NAME=wellness-node
# NOTE: .env is NOT copied into the image.
# All secrets injected via Cloud Run env vars / Secret Manager at runtime.

EXPOSE 8080
CMD ["node", "node.js"]
