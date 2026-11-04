# ECO Professional DP Generator – production image
# Build:  docker build -t eco-dp .
# Run:    docker run -p 3000:3000 --env-file .env.production -v /secure/brand:/app/public/brand:ro eco-dp

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node scripts/fetch-models.mjs && npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd -r app && useradd -r -g app app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/models ./models
# Native modules for the AI runtime and image processing
COPY --from=build /app/node_modules/onnxruntime-node ./node_modules/onnxruntime-node
COPY --from=build /app/node_modules/onnxruntime-common ./node_modules/onnxruntime-common
COPY --from=build /app/node_modules/sharp ./node_modules/sharp
COPY --from=build /app/node_modules/@img ./node_modules/@img
# CPU-only inference: drop GPU providers and other platforms' binaries (~690 MB). Verified to work without them.
RUN cd node_modules/onnxruntime-node/bin/napi-v3 && rm -rf darwin win32 linux/arm64 \
    linux/x64/libonnxruntime_providers_cuda.so linux/x64/libonnxruntime_providers_tensorrt.so
USER app
EXPOSE 3000
CMD ["node", "server.js"]
