# Survegio Docker Documentation

This document provides comprehensive instructions for deploying the Survegio application using Docker.

## Architecture Overview

The Survegio application consists of two main services:

1. **Frontend**: Vue.js 3 application served via Nginx
2. **Backend**: Directus CMS with SQLite database

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│                  (survegio-network)                      │
│                                                          │
│  ┌──────────────────┐      ┌──────────────────────────┐ │
│  │     Frontend     │      │        Directus          │ │
│  │   (Nginx:80)     │ ───► │     (Node.js:8055)       │ │
│  │                  │      │                          │ │
│  │   Port: 3000     │      │      Port: 8061          │ │
│  └──────────────────┘      └──────────────────────────┘ │
│                                      │                   │
│                                      ▼                   │
│                            ┌──────────────────┐         │
│                            │  SQLite Database │         │
│                            │   (Persistent)   │         │
│                            └──────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

- Docker Engine 20.10.0 or later
- Docker Compose V2 (comes with Docker Desktop)
- At least 2GB of available RAM
- At least 5GB of available disk space

## Quick Start

### 1. Clone and Navigate

```bash
cd /path/to/typescript-version/full-version
```

### 2. Start the Application

```bash
# Build and start all services
docker compose up -d --build

# View logs
docker compose logs -f
```

### 3. Access the Application

- **Frontend**: http://localhost:3000
- **Directus Admin**: http://localhost:8061

Default Directus credentials:
- Email: `admin@example.com`
- Password: `d1r3ctu5`

## Configuration

### Environment Variables

Create a `.env` file in the project root to customize the deployment:

```env
# Directus Configuration
DIRECTUS_SECRET=your-secure-random-secret-key
DIRECTUS_ADMIN_EMAIL=admin@yourschool.edu
DIRECTUS_ADMIN_PASSWORD=your-secure-password

# API URL (used during frontend build)
VITE_API_BASE_URL=http://localhost:8061
```

### docker-compose.yml Configuration Options

| Service | Variable | Default | Description |
|---------|----------|---------|-------------|
| frontend | Port mapping | 3000:80 | Frontend access port |
| directus | Port mapping | 8061:8055 | Directus API port |
| directus | DIRECTUS_SECRET | auto-generated | JWT signing secret |
| directus | ADMIN_EMAIL | admin@example.com | Admin login email |
| directus | ADMIN_PASSWORD | d1r3ctu5 | Admin login password |
| directus | CORS_ORIGIN | localhost:3000,5173 | Allowed origins |

## Docker Commands Reference

### Basic Operations

```bash
# Start services (detached mode)
docker compose up -d

# Start with rebuild
docker compose up -d --build

# Stop services
docker compose down

# Stop and remove volumes (WARNING: deletes database)
docker compose down -v

# View running containers
docker compose ps

# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f frontend
docker compose logs -f directus
```

### Maintenance

```bash
# Restart a specific service
docker compose restart frontend
docker compose restart directus

# Rebuild a specific service
docker compose up -d --build frontend

# Enter container shell
docker compose exec directus sh
docker compose exec frontend sh

# Check container resource usage
docker stats
```

## File Structure

```
full-version/
├── Dockerfile              # Frontend build configuration
├── docker-compose.yml      # Multi-service orchestration
├── nginx.conf              # Nginx server configuration
├── .dockerignore           # Files excluded from Docker build
├── .env                    # Environment variables (create this)
├── DOCKER.md               # This documentation
│
├── src/                    # Vue.js source code
├── public/                 # Static assets
│
└── Directus-of-Survegio/   # Directus backend
    ├── database/           # SQLite database (persistent)
    ├── uploads/            # File uploads (persistent)
    └── extensions/         # Custom Directus extensions
```

## Data Persistence

The following data is persisted via Docker volumes:

| Path | Description | Location |
|------|-------------|----------|
| `/directus/database` | SQLite database | `./Directus-of-Survegio/database/` |
| `/directus/uploads` | Uploaded files | `./Directus-of-Survegio/uploads/` |
| `/directus/extensions` | Custom extensions | `./Directus-of-Survegio/extensions/` |

### Backup

```bash
# Backup database
cp ./Directus-of-Survegio/database/survegioData.db ./backups/survegioData_$(date +%Y%m%d).db

# Backup uploads
tar -czvf ./backups/uploads_$(date +%Y%m%d).tar.gz ./Directus-of-Survegio/uploads/
```

### Restore

```bash
# Stop services
docker compose down

# Restore database
cp ./backups/survegioData_YYYYMMDD.db ./Directus-of-Survegio/database/survegioData.db

# Start services
docker compose up -d
```

## Production Deployment

### Security Checklist

1. **Change default credentials**
   ```env
   DIRECTUS_ADMIN_EMAIL=secure-admin@yourschool.edu
   DIRECTUS_ADMIN_PASSWORD=very-secure-password-here
   ```

2. **Generate a secure secret**
   ```bash
   # Generate a random secret
   openssl rand -base64 32
   ```
   Add to `.env`:
   ```env
   DIRECTUS_SECRET=your-generated-secret
   ```

3. **Update CORS settings** in docker-compose.yml:
   ```yaml
   CORS_ORIGIN: "https://your-production-domain.com"
   ```

4. **Use HTTPS** - Consider using a reverse proxy like Traefik or nginx-proxy

### Recommended Production Setup

For production, consider:

1. **Using PostgreSQL instead of SQLite**
   ```yaml
   # Add to docker-compose.yml
   postgres:
     image: postgres:15-alpine
     environment:
       POSTGRES_DB: survegio
       POSTGRES_USER: directus
       POSTGRES_PASSWORD: secure-password
     volumes:
       - postgres_data:/var/lib/postgresql/data

   directus:
     environment:
       DB_CLIENT: pg
       DB_HOST: postgres
       DB_PORT: 5432
       DB_DATABASE: survegio
       DB_USER: directus
       DB_PASSWORD: secure-password
   ```

2. **Adding SSL/TLS with Traefik**
3. **Implementing automated backups**
4. **Setting up monitoring and logging**

## Troubleshooting

### Common Issues

#### Port Already in Use

```bash
# Check what's using the port
lsof -i :3000
lsof -i :8061

# Kill the process or change ports in docker-compose.yml
```

#### Database Permission Issues

```bash
# Fix permissions on Directus directories
chmod -R 755 ./Directus-of-Survegio/database
chmod -R 755 ./Directus-of-Survegio/uploads
```

#### Frontend Can't Connect to API

1. Check that Directus is running:
   ```bash
   docker compose ps
   curl http://localhost:8061/server/health
   ```

2. Verify CORS settings in docker-compose.yml

3. Ensure the API URL is correct in the frontend build

#### Container Won't Start

```bash
# Check logs for errors
docker compose logs directus
docker compose logs frontend

# Remove and recreate containers
docker compose down
docker compose up -d --build
```

### Reset Everything

```bash
# WARNING: This will delete all data!
docker compose down -v
rm -rf ./Directus-of-Survegio/database/*.db
docker compose up -d --build
```

## Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| Command | `pnpm dev` | `docker compose up -d` |
| Frontend Port | 5173 | 3000 |
| Hot Reload | Yes | No |
| Database | Shared SQLite | Container volumes |
| CORS | localhost:5173 | Your domain |

## Support

For issues specific to:
- **Docker/Deployment**: Check this documentation and Docker logs
- **Directus**: https://docs.directus.io
- **Vue.js/Frontend**: Check the frontend source code and Vue documentation

---

Last updated: December 2025
