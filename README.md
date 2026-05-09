# IMP Compass

Operational reference application for EUFOR International Military Police at Camp Butmir, Sarajevo. 

## Stack

| Layer | Technology |
|---|---|
| Frontend | Single-file PWA (HTML/CSS/JS) |
| Encryption | StaticCrypt AES-256 (GitHub Actions) |
| API | Vercel Serverless Functions (Node 18+) |
| Push | Firebase FCM + Pusher |
| Roster storage | Vercel Blob (private) |
| Duty board sync | Supabase |

---

## Deployment

### 1. Fork / clone the repository

```bash
git clone https://github.com/updates00-jpg/IMP_Compass
```

### 2. Configure Vercel Environment Variables

In Vercel Dashboard → Project → Settings → Environment Variables, add:

| Variable | Description |
|---|---|
| `IMP_API_SECRET` | Shared secret for API auth (generate: `openssl rand -hex 32`) |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_PRIVATE_KEY_ID` | From service account JSON |
| `FIREBASE_PRIVATE_KEY` | From service account JSON (include `-----BEGIN...`) |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email |
| `FIREBASE_CLIENT_ID` | Firebase service account client ID |
| `PUSHER_APP_ID` | Pusher application ID |
| `PUSHER_KEY` | Pusher key |
| `PUSHER_SECRET` | Pusher secret |
| `PUSHER_CLUSTER` | Pusher cluster (e.g. `eu`) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob read/write token |

### 3. Configure GitHub Secrets

In GitHub → Repository → Settings → Secrets and variables → Actions:

| Secret | Description |
|---|---|
| `SITE_PASSWORD` | StaticCrypt password used to encrypt index.html |

### 4. Update client-side API secret

In `index.html`, find the Pusher/alarm trigger section and set the same value as `IMP_API_SECRET` in the `X-IMP-Secret` header sent with every API call.

### 5. Deploy

Push to `main` — GitHub Actions will encrypt `index.html`, then Vercel will deploy.

---

## Security Architecture

```
Browser
  └─ StaticCrypt password (Layer 1 — access control)
       └─ PIN login (Layer 2 — user identity)
            └─ API calls with X-IMP-Secret header (Layer 3 — API auth)
                 └─ Vercel env vars (Layer 4 — server secrets)
```

- **Firebase Web API key** in `sw.js` is intentionally public (required for Web Push)
- Protect Firebase with Security Rules + App Check
- Firestore rules: `allow read, write: if false;` (Admin SDK bypasses rules)
- Roster data stored as **private** blob — not accessible without auth

---

## Development

```bash
# Syntax check all API files
npm run check
```

---

## File structure

```
├── index.html              # Main app (encrypted in production)
├── sw.js                   # Service Worker + Firebase Messaging
├── manifest.json           # PWA manifest
├── alarm.mp3               # Alarm sound
├── api/
│   ├── trigger-alarm.js    # POST — trigger alarm (Pusher + FCM)
│   ├── send-push.js        # POST — send FCM push
│   ├── subscribe.js        # POST — register FCM token
│   └── roster.js           # GET/POST — duty roster
├── lib/
│   ├── auth.js             # Shared auth + rate limiting
│   ├── firebase-admin.js   # Shared Firebase Admin init (DRY)
│   └── send-push-logic.js  # Core FCM logic (imported, not HTTP-called)
└── .github/workflows/
    └── encrypt.yml         # StaticCrypt CI/CD
```
