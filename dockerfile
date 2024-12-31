# Use a specific Node.js version for consistency and security.
FROM node:16.20.2-alpine AS builder

# Set the working directory within the container.
WORKDIR /app

# Copy package files to leverage caching.
COPY package*.json ./

# Install the node modules for your project, and perform a clean install.
RUN npm ci --omit=dev

# Copy the rest of your application.
COPY . .


# Final image with minimal content
FROM node:16.20.2-alpine

WORKDIR /app

# Copy just the needed files from the builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.js ./
COPY --from=builder /app/package*.json ./
# Set an environment variable to indicate we are in google cloud run
ENV ENVIRONMENT=google_cloud_run

# Execute your application.
CMD ["node", "server.js"]