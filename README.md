# Zypherus Backend Services

This directory contains all the backend services for the Zypherus application with Supabase authentication, API key management, and real-time text streaming capabilities.

## 🎯 Features

- **Authentication**: Supabase-powered user authentication (signup/login)
- **API Key Management**: Generate, validate, and manage API keys
- **Real-time Streaming**: LiveKit-powered audio streaming and STT
- **Rate Limiting**: Per-API-key rate limiting (60 requests/min default)
- **Usage Tracking**: Comprehensive usage logging and analytics
- **Production Ready**: Docker-based deployment for Render/Railway

## 📁 Directory Structure

```
backend/
├── apps/                    # Backend applications
│   ├── dev-server/         # Token server and API
│   ├── stt-worker/         # Speech-to-text worker
│   └── llm-service/        # LLM correction service
├── packages/               # Shared packages
│   ├── shared-types/       # TypeScript types
│   ├── audio-utils/        # Audio processing utilities
│   ├── prompt-kit/         # LLM prompt utilities
│   ├── sdk/               # Client SDK
│   └── ui/                # UI components
├── docker/                # Docker startup scripts
├── .env.local            # Environment configuration
├── docker-compose.yml    # Docker services configuration
├── Dockerfile.backend    # Backend container build file
└── package.json          # Dependencies and scripts
```

## 🚀 Quick Start

### From React App Root Directory:

**Start Backend Services:**
```bash
./start-backend.sh
```

**Stop Backend Services:**
```bash
./stop-backend.sh
```

### From Backend Directory:

**Start Services:**
```bash
cd backend
docker-compose up -d
```

**Stop Services:**
```bash
cd backend
docker-compose down
```

## 🔧 Configuration

The backend services use the `.env.local` file for configuration. Key variables:

```bash
# LiveKit Configuration
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret
LIVEKIT_WS_URL=ws://livekit:7880
LIVEKIT_WS_URL_FRONTEND=ws://localhost:7880

# Groq Configuration
GROQ_API_KEY=your-groq-key
GROQ_STT_MODEL=whisper-large-v3-turbo
GROQ_LLM_MODEL=moonshotai/kimi-k2-instruct

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Service Configuration
STT_ROOM_NAME=zypherus-demo
STT_PARTICIPANT_IDENTITY=stt-worker
DEV_SERVER_PORT=4000
LLM_SERVICE_PORT=4300
```

## 🌐 Services

- **Dev Server**: http://localhost:4000 (Token generation, API)
- **LLM Service**: http://localhost:4300 (Text correction service)
- **LiveKit**: ws://localhost:7880 (WebRTC signaling)

## 🧪 Health Checks

```bash
# Check dev server
curl http://localhost:4000/health

# Check LLM service
curl http://localhost:4300/health

# Test token generation
curl -X POST http://localhost:4000/livekit/token \
  -H "Content-Type: application/json" \
  -d '{"roomName":"zypherus-demo","autoCreate":true}'
```

## 🔄 Development

To rebuild the backend container after code changes:

```bash
cd backend
docker-compose build backend
docker-compose up -d
```

## 📦 Dependencies

This backend setup is completely self-contained and includes:
- All source code for backend services
- All shared packages and utilities
- Docker configuration and build files
- Environment configuration
- Package dependencies (pnpm workspace)

---

## 🚀 Production Deployment

### Deploy to Render

**Quick Deploy:**
```bash
# Follow the comprehensive guide
cat RENDER_DEPLOYMENT.md
```

**Steps:**
1. Push code to GitHub (see `GIT_WORKFLOW.md`)
2. Connect repository to Render
3. Render auto-detects `render.yaml`
4. Add environment variables
5. Deploy! 🎉

**Documentation:**
- [RENDER_DEPLOYMENT.md](./RENDER_DEPLOYMENT.md) - Complete Render guide
- [GIT_WORKFLOW.md](./GIT_WORKFLOW.md) - Git commands and workflow

### Deploy to Railway

**Quick Deploy:**
```bash
# Follow the quickstart guide
cat RAILWAY_QUICKSTART.md
```

**Steps:**
1. Push code to GitHub
2. Connect repository to Railway
3. Railway auto-detects `railway.toml`
4. Add environment variables
5. Deploy! 🚂

**Documentation:**
- [RAILWAY_QUICKSTART.md](./RAILWAY_QUICKSTART.md) - Quick 5-minute guide
- [RAILWAY_ENV_SETUP.md](./RAILWAY_ENV_SETUP.md) - Environment variables reference

---

## 📚 API Documentation

### Authentication Endpoints

**Signup:**
```bash
POST /auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Login:**
```bash
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}

# Returns: { access_token: "jwt_token", user: {...} }
```

### API Key Management

**Generate API Key:**
```bash
POST /api/keys
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "name": "My API Key"
}

# Returns: { key: "zk_...", name: "My API Key", ... }
```

**List API Keys:**
```bash
GET /api/keys
Authorization: Bearer YOUR_ACCESS_TOKEN

# Returns: { keys: [...] }
```

**Validate API Key:**
```bash
POST /api/validate-key
Authorization: Bearer YOUR_API_KEY

# Returns: { valid: true, key: "zk_...", ... }
```

### LiveKit Token

**Generate Token:**
```bash
POST /livekit/token
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "roomName": "zypherus-demo",
  "identity": "user-123",
  "autoCreate": true
}

# Returns: { token: "livekit_token", url: "wss://..." }
```

---

## 🔐 Security

- **API Keys**: Start with `zk_` prefix, 32 characters
- **Rate Limiting**: 60 requests/min per API key (configurable)
- **Usage Tracking**: All requests logged to Supabase
- **JWT Authentication**: Supabase JWT for user sessions
- **Environment Variables**: Never commit secrets to Git

---

## 📊 Monitoring

### View Logs

**Docker (Local):**
```bash
docker-compose logs -f backend
docker-compose logs -f backend | grep "stt-worker"
```

**Render:**
```bash
# In dashboard or CLI
render logs -s zypherus-backend -f
```

**Railway:**
```bash
# In dashboard or CLI
railway logs -f
```

---

## 🆘 Troubleshooting

### Common Issues

**Services not starting:**
- Check environment variables are set
- Verify LiveKit/Groq/Supabase credentials
- Review logs for error messages

**API key generation fails:**
- Ensure Supabase service key is correct
- Run database setup script
- Check user profile exists

**STT worker not connecting:**
- Verify LiveKit credentials
- Check WebSocket URL is accessible
- Review Groq API quota

**See detailed troubleshooting in deployment guides.**

---

## 📖 Additional Resources

- **Database Setup**: `scripts/setup-database.sql`
- **Git Workflow**: `GIT_WORKFLOW.md`
- **Render Deployment**: `RENDER_DEPLOYMENT.md`
- **Railway Deployment**: `RAILWAY_QUICKSTART.md`

---

**Need Help?** Check the deployment guides or review the logs for detailed error messages.
