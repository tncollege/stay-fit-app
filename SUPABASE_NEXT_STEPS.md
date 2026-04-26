# Running the app locally

Use two terminals:

1. Backend/API:
```bash
npm run dev
```

2. Frontend/Vite:
```bash
npx vite
```

The Vite dev server proxies `/api/*` to `http://localhost:3000`, so AI requests work from `http://localhost:5173`.
