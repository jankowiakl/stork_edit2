FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gdal-bin && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY test ./test
EXPOSE 3000
CMD ["npm", "start"]
