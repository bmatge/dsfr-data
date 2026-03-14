#!/bin/sh
# Setup script for database mode deployment.
# Generates JWT_SECRET if not present, then builds and starts the containers.

set -e

# Generate JWT_SECRET if no .env file
if [ ! -f .env ]; then
  echo "Generating JWT_SECRET..."
  echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
  echo ".env file created with JWT_SECRET"
fi

echo "Building and starting in database mode..."
docker compose -f docker-compose.yml -f docker-compose.db.yml up -d --build

echo ""
echo "Database mode is running."
echo "Register the first user (will be admin) at the web interface."
