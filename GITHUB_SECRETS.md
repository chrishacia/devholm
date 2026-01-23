# GitHub Secrets Setup Guide

Quick reference for setting up GitHub Actions secrets for automated deployment.

## Navigate to Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** for each secret below

---

## Required Secrets

### Server Connection

| Name | Description | How to Get |
|------|-------------|------------|
| `DEPLOY_HOST` | Your server hostname | `yoursite.com` or your server IP |
| `DEPLOY_USER` | SSH username | Usually `root` or a deploy user like `deploy` |
| `DEPLOY_KEY` | SSH private key | See [Generate SSH Key](#generate-ssh-key) below |
| `DEPLOY_PATH` | Deployment directory | `/var/www/yoursite.com` |
| `APP_PORT` | Host port for the application | Default: `3000`. Use a different port if running multiple sites |

### Database

| Name | Description | Recommended Value |
|------|-------------|-------------------|
| `POSTGRES_USER` | PostgreSQL username | Your database username |
| `POSTGRES_PASSWORD` | PostgreSQL password | Generate with `openssl rand -base64 24` |
| `POSTGRES_DB` | Database name | Your database name |

### Authentication

| Name | Description | How to Get |
|------|-------------|------------|
| `NEXTAUTH_SECRET` | Session encryption key | Generate with `openssl rand -base64 32` |
| `ADMIN_EMAIL` | Initial admin email | Your admin email |
| `ADMIN_PASSWORD` | Initial admin password | Create a strong password |

---

## Generate Values

### Generate SSH Key

Run on your **local machine**:

```bash
# Generate key pair
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key -N ""

# View the private key (this goes in DEPLOY_KEY secret)
cat ~/.ssh/deploy_key

# View the public key (add this to server's authorized_keys)
cat ~/.ssh/deploy_key.pub
```

Then on your **server**:

```bash
# Add public key to authorized_keys
echo "YOUR_PUBLIC_KEY_CONTENT" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### Generate Passwords/Secrets

```bash
# Generate NEXTAUTH_SECRET (32-byte base64)
openssl rand -base64 32

# Generate POSTGRES_PASSWORD (24-byte base64)
openssl rand -base64 24

# Generate a strong admin password
openssl rand -base64 16
```

---

## Example Values

Here's what your secrets might look like (DO NOT use these exact values):

```
DEPLOY_HOST=yoursite.com
DEPLOY_USER=deploy
DEPLOY_KEY=-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
...full key content...
-----END OPENSSH PRIVATE KEY-----
DEPLOY_PATH=/var/www/yoursite.com
APP_PORT=3000

POSTGRES_USER=youruser
POSTGRES_PASSWORD=xK9mN3pQ7rT2vW5yB8cF4hJ6
POSTGRES_DB=yourdb

NEXTAUTH_SECRET=a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V2
ADMIN_EMAIL=admin@yoursite.com
ADMIN_PASSWORD=MySecureP@ssw0rd!2024
```

---

## Optional Secrets

These are optional but can enhance your deployment:

| Name | Description |
|------|-------------|
| `PROJECT_NAME` | Unique project identifier for Docker |
| `SITE_URL` | Production URL (e.g., `https://yoursite.com`) |
| `SITE_NAME` | Display name for the site |
| `CSRF_SECRET` | CSRF protection secret |
| `DOCKERHUB_USERNAME` | For Docker Hub instead of GHCR |
| `DOCKERHUB_TOKEN` | Docker Hub access token |

---

## Verify Setup

After adding all secrets, you can verify by:

1. Go to **Actions** tab
2. Select **CI/CD Pipeline** workflow
3. Click **Run workflow** (if enabled)
4. Watch the deployment step for any errors

---

## Troubleshooting

### "Permission denied" SSH error
- Ensure the public key is in server's `~/.ssh/authorized_keys`
- Check file permissions: `chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys`
- Verify SSH is enabled: `sudo systemctl status sshd`

### "Host key verification failed"
- The workflow adds the host key automatically
- If issues persist, manually add: `ssh-keyscan your-server >> ~/.ssh/known_hosts`

### Database connection refused
- Ensure PostgreSQL is running
- Check if Docker network is properly configured
- Verify the password matches

---

## Security Notes

⚠️ **Important Security Practices:**

1. **Never** commit secrets to the repository
2. Use strong, unique passwords for each secret
3. Rotate secrets periodically (every 6-12 months)
4. Use a dedicated SSH key for GitHub Actions (not your personal key)
5. Consider using GitHub Environments for additional protection
6. Enable branch protection rules for the `main` branch
