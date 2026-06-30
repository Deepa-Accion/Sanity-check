# Fresh React + Node local processor

## Setup

1. Install backend dependencies and start the server (in project root):

```bash
npm install
npm start
```

2. Install frontend dependencies and start the dev server:

```bash
cd frontend
npm install
npm run dev
```

3. Open the frontend (Vite usually at http://localhost:5173). The frontend proxies `/api` to the backend at port 3001.

Replace `transform_zip_to_persona.js` and `combine-json-steps.js` in project root with your real scripts.
