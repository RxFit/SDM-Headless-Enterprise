FROM node:20-alpine
WORKDIR /app

# Copy package files first for layer caching
COPY package.json ./
RUN npm install --omit=dev

# Copy node source (exclude .env and credentials from image)
COPY stripe-node.js ./
COPY node.js ./
COPY lib/ ./lib/
COPY handlers/ ./handlers/

# Never bake secrets into image — all values come from Cloud Run env vars at runtime
ENV PORT=8080
ENV NODE_ENV=production
ENV NODE_NAME=stripe-node
# NOTE: .env is NOT copied into the image.
# All secrets are injected via Cloud Run environment variables / Secret Manager at runtime.

EXPOSE 8080
CMD ["node", "node.js"]
