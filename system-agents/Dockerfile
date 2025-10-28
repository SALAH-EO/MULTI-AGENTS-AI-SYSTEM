# Stage 1: Build the Next.js frontend
FROM node:18-alpine AS frontend_builder

# Set the working directory inside the container for the frontend
WORKDIR /app/frontend

# Copy package.json and package-lock.json from the build context's 'frontend' directory
COPY frontend/package*.json ./
RUN npm install

# Set NEXT_PUBLIC_BACKEND_URL here, before npm run build, so Next.js picks it up
ENV NEXT_PUBLIC_BACKEND_URL=http://localhost:8000

# Copy the rest of the frontend code from the build context's 'frontend' directory
COPY frontend/. ./

# Disable ESLint during the Next.js build process by modifying next.config.js
RUN echo "module.exports = { eslint: { ignoreDuringBuilds: true } }" > next.config.js

# Build the Next.js application
RUN npm run build

# Stage 2: Build the FastAPI backend (only copy source code, no pip install here)
FROM python:3.9-slim-buster AS backend_builder

# Set the working directory inside the container for the backend
WORKDIR /app/backend

# Copy backend requirements.txt and the rest of the backend code
COPY backend/requirements.txt ./
COPY backend/. ./

# Stage 3: Final image combining frontend and backend
FROM node:18-alpine

# Install Python and pip for the backend runtime
# Using apk add for alpine base image
RUN apk add --no-cache python3 py3-pip

# Removed: RUN pip install websockets
# This will now be installed via requirements.txt in the CMD command

# Set the main working directory for the combined app
WORKDIR /app

# Copy built frontend assets from frontend_builder stage
COPY --from=frontend_builder /app/frontend/.next ./.next
COPY --from=frontend_builder /app/frontend/public ./public
COPY --from=frontend_builder /app/frontend/node_modules ./node_modules
COPY --from=frontend_builder /app/frontend/package.json ./package.json
COPY --from=frontend_builder /app/frontend/next.config.js ./next.config.js

# Copy backend from backend_builder stage
COPY --from=backend_builder /app/backend ./backend

# Add the .env file from the build context (which is system-agents/) to the /app directory
COPY .env ./.env

# Expose ports for Next.js (3000) and FastAPI (8000)
EXPOSE 3000
EXPOSE 8000

# Set environment variables for Next.js to run in production mode
ENV NODE_ENV=production

# The command to run both frontend and backend
CMD sh -c "python3 -m venv /app/backend/venv && \
           . /app/backend/venv/bin/activate && \
           pip install --no-cache-dir -r /app/backend/requirements.txt && \
           /app/backend/venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 & \
           npm start --prefix /app"
