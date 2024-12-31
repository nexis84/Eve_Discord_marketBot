# 1. Use a Node.js base image (adjust version as needed)
FROM node:18-slim

# 2. Set the working directory in the container
WORKDIR /app

# 3. Copy package.json and package-lock.json (if you have it)
COPY package*.json ./

# 4. Install production dependencies only
RUN npm install --omit=dev

# 5. Copy the rest of your application code
COPY . .

# 6. Expose the port your application will use (default: 8080 for Cloud Run)
EXPOSE 8080

# 7. Start the application
CMD ["npm", "start"]