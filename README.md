# Formatize

Monorepo starter for a full-stack Excel normalization and merge tool.

## Stack
- Frontend: Next.js + React + TypeScript + Tailwind CSS
- Backend: Node.js + Express + TypeScript

## Repository structure
- `frontend` — Next.js app
- `backend` — Express API server

## Setup commands
From the repository root:

1. Install dependencies for all workspaces
	- `npm install`
2. (Optional) run both apps in development mode
	- `npm run dev`
3. Run only backend
	- `npm run dev:backend`
4. Run only frontend
	- `npm run dev:frontend`
5. Production builds for both
	- `npm run build`

## Environment
- Backend example: `backend/.env.example`
  - `PORT=4000`
  - `FRONTEND_ORIGIN=http://localhost:3000`
- Frontend example: `frontend/.env.local.example`
  - `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000`

## Essential dependencies
- Backend
  - `express`, `cors`, `multer`, `xlsx`, `dotenv`
- Frontend
  - `next`, `react`, `react-dom`, `axios`
