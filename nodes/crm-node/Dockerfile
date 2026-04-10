FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY crm-node.js ./
COPY node.js ./
COPY lib/ ./lib/
COPY handlers/ ./handlers/
COPY adapters/ ./adapters/
COPY routes/ ./routes/

ENV PORT=8080
ENV NODE_ENV=production
ENV NODE_NAME=crm-node
# NOTE: .env is NOT copied into the image.
# All secrets (SDM_INTERNAL_KEY, GHL_API_TOKEN, etc.) are injected
# via Cloud Run environment variables / Secret Manager at runtime.

EXPOSE 8080
CMD ["node", "node.js"]
