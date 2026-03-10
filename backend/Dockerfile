FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8000

# Start via PM2 for clustering
CMD ["npx", "pm2-runtime", "src/server.js", "-i", "max"]
