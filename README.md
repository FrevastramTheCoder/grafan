# Grafan

Grafan is a Tanzania-focused job discovery and career tools app. The React frontend reads public job listings and matching data from a FastAPI backend. SQLite stores jobs, saved-job keys, profiles, and legacy application records. Scraping and job administration are restricted to server-authenticated admin routes.

## Run locally

Open two PowerShell terminals from the repository folder.

Backend:

```powershell
cd D:\PROJECTS\grafan\grafan\backend
python -m pip install -r requirements.txt
python -m uvicorn app:app --reload --port 5000
```

Frontend:

```powershell
cd D:\PROJECTS\grafan\grafan\frontend
npm install
npm start
```

The frontend uses the CRA development proxy to reach `http://127.0.0.1:5000`. For another backend address, set `REACT_APP_API_URL` in `frontend/.env` to its `/api` URL.

## Configuration

Copy `backend/.env.example` to `backend/.env` and set a random `ADMIN_API_TOKEN` with at least 32 characters. The admin dashboard sends this token to the backend as a bearer token; the browser stores it only for the current session. Keep this token and all provider keys server-side.

Scheduled scraping is off by default. Set `ENABLE_SCRAPE_SCHEDULER=true` to enable the six-hour schedule. Scraping can also be started manually from the authenticated Admin dashboard. Source URLs and scraper provenance appear only in admin responses.

CV AI is optional. Set `CV_AI_PROVIDER=openai`, `CV_AI_API_KEY`, and optionally `CV_AI_MODEL` in `backend/.env`. If no provider key is configured, profile editing, CV analysis, preview, and export remain available while AI actions stay disabled. Uploaded CVs are parsed temporarily and removed after analysis. Profile data stays in the browser until the user explicitly syncs it; synced profiles use a random browser-held access key rather than a user account.

SQLite defaults to `backend/instance/grafan.db`. Migrations add job metadata and create the saved-job/profile tables; existing job rows are preserved. Use a separate `DATABASE_URL` for test runs.

## Main flows

- Job seekers can search and filter published listings, inspect available job details, save/share listings, check keyword matches, and follow a verified application URL or email link. Grafan does not claim to submit an application.
- The CV Builder accepts selectable-text PDF and DOCX files for extraction, edits a reusable profile, previews five templates, and exports PDF or DOCX. Scanned PDFs need OCR and are not currently supported.
- Admins can inspect source metadata, manage job content and status, fix application links, review statistics, and run configured scrapers.

## Checks

```powershell
cd D:\PROJECTS\grafan\grafan\frontend
npm run build
npm test -- --watchAll=false
```

```powershell
cd D:\PROJECTS\grafan\grafan\backend
python -m py_compile app.py scraper.py cv_parser.py email_sender.py cv_ai.py
```
