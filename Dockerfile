# Survegio Frontend Dockerfile
# Multi-stage build for Vue.js application

# ======================
# Stage 1: Build
# ======================
FROM node:18-alpine as builder

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package files first for better caching
COPY package.json pnpm-lock.yaml ./

# Install dependencies without running postinstall scripts
# (postinstall needs source files which aren't copied yet)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy the rest of the application code
COPY . .

# Run postinstall scripts manually now that source files are available
RUN pnpm run build:icons || true
RUN pnpm run msw:init || true

# Build argument for API URL (can be overridden during build)
ARG VITE_API_BASE_URL=http://localhost:8061
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Build the application
RUN pnpm run build

# ======================
# Stage 2: Production
# ======================
FROM nginx:stable-alpine

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
