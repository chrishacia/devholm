# Deployment Guide

This guide covers the complete deployment process for this Next.js application using Docker and GitHub Actions.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [GitHub Secrets Setup](#github-secrets-setup)
3. [Server Setup](#server-setup)
4. [Nginx Configuration](#nginx-configuration)
5. [First-Time Deployment](#first-time-deployment)
6. [Maintenance Commands](#maintenance-commands)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Server Requirements
- Ubuntu 22.04 LTS or similar Linux distribution
- Minimum 2GB RAM, 2 vCPU
- 20GB disk space
- Domain with DNS pointing to server IP
- Existing SSL certificate (or use Let's Encrypt)

### Software to Install
- Docker Engine 24.0+
- Docker Compose v2
- PostgreSQL 16 (can run in Docker)
- Nginx (for reverse proxy)
- Git

---

## GitHub Secrets Setup

Navigate to your GitHub repository → Settings → Secrets and variables → Actions

See [GITHUB_SECRETS.md](./GITHUB_SECRETS.md) for detailed instructions on setting up all required secrets.

---

## Port Configuration

The application port is configured via the `APP_PORT` GitHub Secret. This port is used to:
1. Map the Docker container's port 3000 to the host port
2. Configure the nginx reverse proxy to forward traffic

**Default:** `3000`

**Multiple Sites:** If you're running multiple DevHolm instances (or other apps) on the same server, use different ports:
- Site 1: `APP_PORT=3000`
- Site 2: `APP_PORT=3001`
- Site 3: `APP_PORT=3002`

Your nginx configuration must match the port you specify. See the [Nginx Configuration](#nginx-configuration) section below.

---

## Server Setup

### 1. Install Docker

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

### 2. Install PostgreSQL (Option A: Native)

```bash
# Install PostgreSQL 16
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install postgresql-16 postgresql-contrib-16

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql << EOF
CREATE USER youruser WITH PASSWORD 'your-secure-password';
CREATE DATABASE yourdb OWNER youruser;
GRANT ALL PRIVILEGES ON DATABASE yourdb TO youruser;
\q
EOF

# Configure PostgreSQL to accept connections from Docker
# Edit /etc/postgresql/16/main/pg_hba.conf
# Add: host    yourdb    youruser    172.17.0.0/16    md5

# Edit /etc/postgresql/16/main/postgresql.conf
# Set: listen_addresses = '*'

sudo systemctl restart postgresql
```

### 3. Install PostgreSQL (Option B: Docker - Recommended)

PostgreSQL is included in docker-compose.yml, so it will run in Docker alongside the app.

```bash
# Just ensure the deployment path exists
sudo mkdir -p /var/www/yoursite.com
sudo chown $USER:$USER /var/www/yoursite.com
```

### 4. Create Deployment Directory

```bash
# Create deployment directory
sudo mkdir -p /var/www/yoursite.com
sudo chown $USER:$USER /var/www/yoursite.com
cd /var/www/yoursite.com

# Create necessary directories
mkdir -p nginx/ssl nginx/sites-enabled backups
```

### 5. Setup SSH Key for GitHub Actions

```bash
# On your LOCAL machine, generate a deploy key
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key

# Copy the public key to your server
ssh-copy-id -i ~/.ssh/deploy_key.pub user@your-server

# The PRIVATE key content goes into GitHub Secrets as DEPLOY_KEY
cat ~/.ssh/deploy_key
```

---

## Nginx Configuration

### Create Site Configuration

Create `/etc/nginx/sites-available/yoursite.com`:

```nginx
# HTTP - Redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name yoursite.com www.yoursite.com;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS - Main configuration
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yoursite.com www.yoursite.com;

    # SSL Configuration (update paths to your certs)
    ssl_certificate /etc/letsencrypt/live/yoursite.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yoursite.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/yoursite.com/chain.pem;
    
    # SSL Settings
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    # Proxy settings
    # NOTE: The port (3000) must match your APP_PORT GitHub Secret
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files (port must match APP_PORT)
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 60m;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /uploads {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 60m;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;
}
```

### Enable the Site

```bash
# Enable the site
sudo ln -sf /etc/nginx/sites-available/yoursite.com /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## First-Time Deployment

### 1. Initial Server Setup

```bash
# SSH into your server
ssh user@yoursite.com

# Create deployment directory
sudo mkdir -p /var/www/yoursite.com
sudo chown $USER:$USER /var/www/yoursite.com
cd /var/www/yoursite.com

# Create directories for volumes
mkdir -p postgres_data uploads
```

### 2. Create Environment File

```bash
# Create .env file with your production values
cat << 'EOF' > .env
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://yoursite.com
NEXT_PUBLIC_SITE_NAME=Your Site Name

# Database (Docker internal network)
DATABASE_URL=postgresql://user:password@postgres:5432/dbname
POSTGRES_USER=user
POSTGRES_PASSWORD=your-secure-password
POSTGRES_DB=dbname

# Auth
NEXTAUTH_URL=https://yoursite.com
NEXTAUTH_SECRET=your-generated-secret
AUTH_SECRET=your-generated-secret

# Admin
ADMIN_EMAIL=admin@yoursite.com
ADMIN_PASSWORD=your-admin-password

# Docker
DOCKER_IMAGE=ghcr.io/yourusername/yourrepo:latest
EOF

# Secure the file
chmod 600 .env
```

### 3. Pull and Start Services

```bash
# Pull the Docker image
docker compose pull

# Start the services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f app
```

### 4. Run Database Migrations

```bash
# Run migrations
docker compose exec app npx knex migrate:latest

# Seed admin user (first time only)
docker compose exec app pnpm seed:admin
```

### 5. Verify Deployment

```bash
# Check health endpoint
curl -s http://localhost:3000/api/health

# Check via domain (after nginx is configured)
curl -s https://yoursite.com/api/health
```

---

## Maintenance Commands

### Container Management

```bash
# View running containers
docker compose ps

# View logs
docker compose logs -f app
docker compose logs -f postgres

# Restart services
docker compose restart app

# Stop all services
docker compose down

# Start all services
docker compose up -d

# Pull latest image and restart
docker compose pull && docker compose up -d
```

### Database Management

```bash
# Access PostgreSQL CLI
docker compose exec postgres psql -U youruser -d yourdb

# Backup database
docker compose exec postgres pg_dump -U youruser yourdb > backup.sql

# Restore database
docker compose exec -T postgres psql -U youruser yourdb < backup.sql

# Run migrations
docker compose exec app npx knex migrate:latest

# Rollback migration
docker compose exec app npx knex migrate:rollback
```

### Cleanup

```bash
# Remove unused images
docker image prune -f

# Remove all unused resources
docker system prune -f
```

---

## Troubleshooting

### Application Won't Start

```bash
# Check logs
docker compose logs app

# Check if port is in use
sudo lsof -i :3000

# Restart with fresh containers
docker compose down && docker compose up -d
```

### Database Connection Issues

```bash
# Check if postgres is running
docker compose ps postgres

# Check postgres logs
docker compose logs postgres

# Test connection
docker compose exec postgres pg_isready -U youruser
```

### Nginx Issues

```bash
# Test nginx configuration
sudo nginx -t

# Check nginx logs
sudo tail -f /var/log/nginx/error.log

# Reload nginx
sudo systemctl reload nginx
```

---

## Automated Backups

Create a cron job for automated backups:

```bash
# Edit crontab
crontab -e

# Add daily backup at 3 AM
0 3 * * * cd /var/www/yoursite.com && docker compose exec -T postgres pg_dump -U youruser yourdb | gzip > /var/www/yoursite.com/backups/db-$(date +\%Y\%m\%d).sql.gz

# Add weekly cleanup (keep last 7 days)
0 4 * * 0 find /var/www/yoursite.com/backups -name "db-*.sql.gz" -mtime +7 -delete
```

---

## Security Checklist

- [ ] SSH key-based authentication only (disable password auth)
- [ ] Firewall configured (UFW: allow 22, 80, 443)
- [ ] SSL certificate installed and auto-renewing
- [ ] Database only accessible from Docker network
- [ ] Environment variables secured (chmod 600 .env)
- [ ] Regular backups configured
- [ ] Log rotation configured
- [ ] Fail2ban installed for SSH protection
