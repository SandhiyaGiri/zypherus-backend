# Zypherus Backend Services

This directory contains all the backend services for the Zypherus application in a self-contained setup.

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

# Service Configuration
STT_ROOM_NAME=zypherus-demo
STT_PARTICIPANT_IDENTITY=stt-worker
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
