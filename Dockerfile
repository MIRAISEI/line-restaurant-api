# Use Node.js 22 LTS
FROM node:22-slim

# Set working directory
WORKDIR /app

# Install dependencies for Prisma and native modules
RUN apt-get update && apt-get install -y \
    openssl \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install all dependencies (including dev dependencies for build)
# Use npm install instead of npm ci for better compatibility
RUN npm install && npm cache clean --force

# Copy source code
COPY . .

# Generate Prisma Client and build TypeScript
RUN npm run build

# Expose port
EXPOSE ${PORT:-5001}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 5001) + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["npm", "run", "start"]

