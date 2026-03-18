# Timesheet Submission App

Full-stack timesheet submission app with:
- React + Vite + Tailwind CSS frontend
- Node.js + Express + MongoDB backend
- JWT authentication (register/login)
- Bi-weekly timesheet with default 8:00 AM-4:00 PM weekdays
- Editable entries for leave/off/work and submit/save draft flow

## Project Structure

```text
timesheetApp/
  frontend/  # React client
  backend/   # Express API
```

## Backend Setup

1. Go to backend folder:

```bash
cd backend
```

2. Verify `.env` exists (already created):

```env
PORT=5001
CLIENT_URL=http://localhost:5173
JWT_SECRET=replace-with-a-strong-secret
MONGODB_URI=<your-atlas-uri>
```

3. Run backend server:

```bash
npm run dev
```

## Frontend Setup

1. Go to frontend folder:

```bash
cd frontend
```

2. Optional: create `.env` from `.env.example` and set API URL.

```env
VITE_API_URL=http://localhost:5001/api
```

3. Run frontend server:

```bash
npm run dev
```

## API Endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/timesheets/recent`
- `GET /api/timesheets/period/:date`
- `POST /api/timesheets/period/:date`

Example date format: `2026-03-16`.

## Run Locally On Windows

Open two terminals in PowerShell.

### 1) Start Backend

```powershell
cd C:\Users\<your-user>\Documents\timesheetApp\backend
npm install
npm run dev
```

Backend runs on `http://localhost:5001`.

### 2) Start Frontend

```powershell
cd C:\Users\<your-user>\Documents\timesheetApp\frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

### 3) Environment Files

Backend `.env` should include:

```env
PORT=5001
CLIENT_URL=http://localhost:5173
JWT_SECRET=replace-with-a-strong-secret
MONGODB_URI=<your-atlas-uri>
```

Frontend `.env` should include:

```env
VITE_API_URL=http://localhost:5001/api
```

