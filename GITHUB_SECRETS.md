# GitHub Secrets Setup Guide

This is the exact repository secret contract used by `.github/workflows/ci.yml` for production deploys.

## Navigate to Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** for each secret below

---

## Required Secrets

### Project Identity

| Name           | Description                                                 | Example                |
| -------------- | ----------------------------------------------------------- | ---------------------- |
| `PROJECT_NAME` | Unique project identifier for Docker container/volume names | `mysite`               |
| `SITE_URL`     | Production URL (with https)                                 | `https://yoursite.com` |
| `SITE_NAME`    | Display name for the site                                   | `My Site`              |

### Server Connection

| Name          | Description                    | How to Get                                      |
| ------------- | ------------------------------ | ----------------------------------------------- |
| `DEPLOY_HOST` | Your server hostname           | `yoursite.com` or your server IP                |
| `DEPLOY_USER` | SSH username                   | Usually `root` or a deploy user like `deploy`   |
| `DEPLOY_KEY`  | SSH private key                | See [Generate SSH Key](#generate-ssh-key) below |
| `DEPLOY_PATH` | Deployment directory           | `/var/www/yoursite.com`                         |
| `APP_PORT`    | Unique host port for this site | `3001`                                          |

### Database

| Name                | Description         | Recommended Value                       |
| ------------------- | ------------------- | --------------------------------------- |
| `POSTGRES_USER`     | PostgreSQL username | Your database username                  |
| `POSTGRES_PASSWORD` | PostgreSQL password | Generate with `openssl rand -base64 24` |
| `POSTGRES_DB`       | Database name       | Your database name                      |

### Authentication

| Name              | Description            | How to Get                              |
| ----------------- | ---------------------- | --------------------------------------- |
| `NEXTAUTH_SECRET` | Session encryption key | Generate with `openssl rand -base64 32` |
| `ADMIN_EMAIL`     | Initial admin email    | Your admin email                        |
| `ADMIN_PASSWORD`  | Initial admin password | Create a strong password                |

Important:

- The workflow injects `NEXTAUTH_SECRET` into both `NEXTAUTH_SECRET` and `AUTH_SECRET` in production.
- You do not need to create a separate `AUTH_SECRET` repository secret for the current deploy workflow.
- Production boot-time admin seeding is disabled by default (`ENABLE_ADMIN_SEED_ON_BOOT` must be `true` to enable it).

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

These are optional and have sensible defaults:

| Name                 | Description                    | Default                                |
| -------------------- | ------------------------------ | -------------------------------------- |
| `CSRF_SECRET`        | CSRF protection secret         | Not currently wired into deploy output |
| `DOCKERHUB_USERNAME` | For Docker Hub instead of GHCR | Uses GHCR                              |
| `DOCKERHUB_TOKEN`    | Docker Hub access token        | Uses GHCR                              |

Important:

- `APP_PORT` is optional on first install and is treated as a preferred host-port hint.
- On first install, if `APP_PORT` is missing or in use, deploy auto-selects a free port in `3000-3999`.
- Deploy persists the resolved port in `DEPLOY_PATH/.devholm/deploy-state.env` and reuses it on future updates.
- First-install reverse-proxy templates are generated at:
  - `DEPLOY_PATH/.devholm/templates/nginx-<PROJECT_NAME>.conf`
  - `DEPLOY_PATH/.devholm/templates/apache-<PROJECT_NAME>.conf`

---

## Verify Setup

After adding all secrets, you can verify by:

1. Go to **Actions** tab
2. Select **CI/CD Pipeline** workflow
3. Click **Run workflow** (if enabled)
4. Watch the deployment step for any errors

---

## Troubleshooting

### Lost admin credentials (GitHub Secrets are write-only)

If you no longer know the current admin password, you can force-reset it with an explicit one-off command on the server.

1. Pick a new temporary password.
2. Run this on your local machine (replace values):

```bash
ssh -i ~/.ssh/your_deploy_key root@your-server '
docker exec \
	-e ADMIN_EMAIL="admin@yoursite.com" \
	-e ADMIN_PASSWORD="NEW_TEMP_PASSWORD" \
	-e FORCE_ADMIN_PASSWORD_RESET="true" \
	yourproject-app \
	node /app/seed-admin.js
'
```

How this works:

- Production startup does not run admin seeding unless explicitly enabled.
- `seed-admin.js` is create-only by default for existing admins.
- Password updates require explicit `FORCE_ADMIN_PASSWORD_RESET=true`.
- You do not need to read old GitHub Secret values to recover access.

After recovery:

1. Log in to `/admin/login` with the new password.
2. Change the password in admin profile/settings immediately.
3. Update `ADMIN_PASSWORD` in GitHub Secrets so your recovery baseline stays current.

### Missing secret names or mismatched values

- Copy the names exactly as they appear above.
- `SITE_URL` must include `https://`.
- `DEPLOY_PATH` must already exist on the server.
- Your active nginx/apache upstream must match the resolved `APP_PORT` from `DEPLOY_PATH/.devholm/deploy-state.env`.

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
