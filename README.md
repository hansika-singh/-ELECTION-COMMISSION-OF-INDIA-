# Bharat e-Vote 2026 — Complete Unified System

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   frontend.html (v8)                     │
│   Real API calls to unified server on same origin        │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTP
┌───────────────────────▼─────────────────────────────────┐
│                   server.js (Node.js)                     │
│  Combines: hello.zip + voting_systemm                     │
│                                                           │
│  ┌─────────────────┐  ┌─────────────────────────────┐   │
│  │  hello.zip      │  │  voting_systemm              │   │
│  │  ─────────────  │  │  ──────────────────────────  │   │
│  │  ZKP nullifier  │  │  Supabase (voter DB)         │   │
│  │  HMAC-SHA256    │  │  JWT authentication          │   │
│  │  Local audit DB │  │  Resend (email OTP)          │   │
│  │  Vote tally     │  │  Auth routes                 │   │
│  └─────────────────┘  └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Edit `.env` — credentials are pre-filled from your backends.

### 3. Run the server

```bash
node server.js
# or for auto-reload:
node --watch server.js
```

### 4. Open the portal

```
http://localhost:3000
```

---

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET  | /health | Server status |
| POST | /api/auth/check-aadhaar | Verify Aadhaar in voter roll |
| POST | /api/auth/send-otp | Send OTP to voter's email |
| POST | /api/auth/verify-otp | Verify OTP → returns JWT |
| GET  | /api/auth/me | Get current voter (JWT) |
| POST | /api/zkp/generate | Generate ZKP nullifier (JWT) |
| POST | /api/vote/cast | Cast vote (JWT + nullifier) |
| POST | /api/vote/revote | Reset vote for re-casting (JWT) |
| GET  | /api/vote/status | Check vote status (JWT) |
| GET  | /api/results | Live election results |
| GET  | /api/vote/tally | Local crypto tally |
| GET  | /api/blockchain/log | Immutable audit log |
| GET  | /api/blockchain/verify/:hash | Verify transaction |

---

## How the ZKP Nullifier Works

1. **Vote cast** → `nullifier = HMAC-SHA256(voterID, SERVER_SECRET_SALT)` stored as `SPENT`
2. **Old record stays** on-chain (in `database.json`) — never deleted
3. **Re-vote** → Old nullifier entry stays as evidence; Supabase reset; voter casts again
4. **Counting** → Only votes with `SPENT` nullifier AND matching latest Supabase record count

## Supabase Tables Required

```sql
-- voters table
CREATE TABLE voters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  aadhaar text UNIQUE NOT NULL,
  epic text,
  email text,
  state text,
  district text,
  ac text,
  booth text,
  has_voted boolean DEFAULT false,
  candidate_voted integer DEFAULT -1,
  tx_hash text
);

-- otp_store table
CREATE TABLE otp_store (
  email text PRIMARY KEY,
  otp text NOT NULL,
  expires_at bigint NOT NULL
);
```

## Demo Mode

If Supabase is unreachable, the frontend gracefully falls back to demo mode — all UI works, OTP is auto-filled, and votes are recorded locally only.
