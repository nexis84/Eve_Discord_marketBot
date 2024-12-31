# Use a lightweight Node.js image
FROM node:16-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application
COPY . .

# Set the PORT environment variable
ENV PORT 8080

# Expose the port
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
