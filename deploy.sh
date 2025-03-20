#!/bin/bash

# Exit on any error
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Help function
print_usage() {
    echo "Usage: $0 <remote_user> <remote_host>"
    echo "Example: $0 truto example.com"
    exit 1
}

# Validate arguments
if [ $# -ne 2 ]; then
    echo -e "${RED}Error: Remote user and host are required${NC}"
    print_usage
fi

# Configuration
REMOTE_USER="$1"
REMOTE_HOST="$2"
REMOTE_APP_DIR="/opt/truto-api"
LOCAL_ENV_FILE=".env.production"
REMOTE_ENV_FILE="${REMOTE_APP_DIR}/.env"
BINARY_NAME="truto-api"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${REMOTE_APP_DIR}/backups"
MAX_BACKUPS=5

echo -e "${GREEN}Starting deployment process...${NC}"
echo "Deploying to ${REMOTE_USER}@${REMOTE_HOST}"

# Function to check if service is running
check_service_status() {
    ssh ${REMOTE_USER}@${REMOTE_HOST} "systemctl is-active --quiet truto-api.service"
    return $?
}

# Function to perform health check
health_check() {
    local max_attempts=30
    local attempt=1
    local wait_time=2

    echo "Performing health check..."
    while [ $attempt -le $max_attempts ]; do
        if ssh ${REMOTE_USER}@${REMOTE_HOST} "curl -s -f http://localhost/"; then
            echo -e "${GREEN}Health check passed!${NC}"
            return 0
        fi
        echo "Attempt $attempt/$max_attempts - Service not healthy yet, waiting..."
        sleep $wait_time
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}Health check failed after $max_attempts attempts${NC}"
    return 1
}

# Step 1: Compile the application
echo "Compiling application..."
bun build ./index.ts --compile --outfile ${BINARY_NAME} || {
    echo -e "${RED}Compilation failed${NC}"
    exit 1
}

# Step 2: Update service file with correct user
echo "Updating service file with user ${REMOTE_USER}..."
sed -i.bak "s/User=truto/User=${REMOTE_USER}/g" truto-api.service
sed -i.bak "s/Group=truto/Group=${REMOTE_USER}/g" truto-api.service
rm -f truto-api.service.bak

# Step 3: Create remote directories
echo "Setting up remote directories..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "
    sudo mkdir -p ${REMOTE_APP_DIR} ${BACKUP_DIR} && \
    sudo chown -R ${REMOTE_USER}:${REMOTE_USER} ${REMOTE_APP_DIR}
"

# Step 4: Backup existing deployment if it exists
echo "Creating backup of current deployment..."
if ssh ${REMOTE_USER}@${REMOTE_HOST} "[ -f ${REMOTE_APP_DIR}/${BINARY_NAME} ]"; then
    ssh ${REMOTE_USER}@${REMOTE_HOST} "
        cp ${REMOTE_APP_DIR}/${BINARY_NAME} ${BACKUP_DIR}/${BINARY_NAME}_${TIMESTAMP} && \
        cp ${REMOTE_ENV_FILE} ${BACKUP_DIR}/.env_${TIMESTAMP} 2>/dev/null || true
    "
    
    # Clean old backups
    ssh ${REMOTE_USER}@${REMOTE_HOST} "
        cd ${BACKUP_DIR} && \
        ls -t ${BINARY_NAME}_* | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -f 2>/dev/null || true && \
        ls -t .env_* | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -f 2>/dev/null || true
    "
fi

# Step 5: Copy new files
echo "Copying files to remote server..."
scp ${BINARY_NAME} ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_APP_DIR}/
scp truto-api.service ${REMOTE_USER}@${REMOTE_HOST}:/tmp/
scp ${LOCAL_ENV_FILE} ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ENV_FILE}

# Step 6: Setup service and permissions
echo "Setting up service and permissions..."
ssh ${REMOTE_USER}@${REMOTE_HOST} "
    sudo mv /tmp/truto-api.service /etc/systemd/system/ && \
    sudo systemctl daemon-reload && \
    sudo setcap 'cap_net_bind_service=+ep' ${REMOTE_APP_DIR}/${BINARY_NAME} && \
    sudo systemctl restart systemd-journald
"

# Step 7: Restart service with rollback capability
echo "Restarting service..."
if check_service_status; then
    echo "Service is currently running, performing graceful restart..."
    ssh ${REMOTE_USER}@${REMOTE_HOST} "sudo systemctl restart truto-api.service"
else
    echo "Service is not running, starting it..."
    ssh ${REMOTE_USER}@${REMOTE_HOST} "sudo systemctl start truto-api.service"
fi

# Step 8: Perform health check and rollback if needed
if ! health_check; then
    echo -e "${RED}Deployment failed health check. Rolling back...${NC}"
    LATEST_BACKUP=$(ssh ${REMOTE_USER}@${REMOTE_HOST} "ls -t ${BACKUP_DIR}/${BINARY_NAME}_* | head -1")
    if [ ! -z "$LATEST_BACKUP" ]; then
        ssh ${REMOTE_USER}@${REMOTE_HOST} "
            sudo systemctl stop truto-api.service && \
            cp ${LATEST_BACKUP} ${REMOTE_APP_DIR}/${BINARY_NAME} && \
            sudo setcap 'cap_net_bind_service=+ep' ${REMOTE_APP_DIR}/${BINARY_NAME} && \
            sudo systemctl start truto-api.service
        "
        echo -e "${YELLOW}Rolled back to previous version${NC}"
        exit 1
    else
        echo -e "${RED}No backup available for rollback${NC}"
        exit 1
    fi
fi

# Step 9: Clean up local binary
echo "Cleaning up local files..."
rm ${BINARY_NAME}

echo -e "${GREEN}Deployment completed successfully!${NC}" 