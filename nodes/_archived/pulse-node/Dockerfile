FROM node:18-slim
WORKDIR /app
COPY . .
# Note: This container requires volume mounting to access the local automation scripts
# or a full copy of the RxFit-MCP/automation directory.
CMD ["node", "pulse-engine.js"]
