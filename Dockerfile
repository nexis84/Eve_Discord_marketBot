# Use a lightweight Node.js image
FROM node:16-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install production dependencies
RUN npm install --production

# Copy the rest of the application
COPY . .

# Set the PORT environment variable
ENV PORT 8080

# Expose the port for Cloud Run
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
