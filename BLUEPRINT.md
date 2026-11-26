# CivicPulse AI - Project Blueprint

## 1. Project Overview
CivicPulse AI is an intelligent civic issue reporting and routing platform with two views in a single React web app: **Citizen Portal** and **Authority Dashboard**.
- **Backend:** Python FastAPI (`./backend`), storing data in a local `complaints.json` file and uploaded images in `./backend/uploads/`.
- **Frontend:** React + Vite + Tailwind CSS + Leaflet (`./frontend`).
- **AI Engine:** Google Gemini API (`google-genai` SDK using `gemini-2.5-flash`) via `GEMINI_API_KEY` in `./backend/.env`.

## 2. Core Backend Pipeline (`POST /api/reports`)
When a citizen submits a photo + GPS coordinates (`lat`, `lng`) + optional description:
1. **Save Image:** Save the uploaded image to `./backend/uploads/` and serve it via FastAPI `StaticFiles`.
2. **AI Vision Analysis (Gemini):** Send the image to `gemini-2.5-flash` requesting strict JSON output:
   - `issue_type`: one of `["pothole", "garbage", "water_leak", "streetlight", "drainage"]`
   - `base_severity`: integer `1` to `10`
   - `department`: auto-mapped to `["Roads", "Sanitation", "Water", "Electricity"]`
   - `summary`: 1-line clear description of the issue
3. **Location Sensitivity Check:** Query OpenStreetMap Overpass API within a 200-meter radius of `(lat, lng)` for `school`, `hospital`, or `primary`/`trunk` road (with a 3-second timeout fallback so offline demos never crash). If found, add `+2` to severity and tag `sensitive_zone: true`.
4. **Duplicate Detection & Merging:** Check existing open complaints in `complaints.json`. If a complaint with the **same `issue_type`** exists within **50 meters** (calculated via Haversine formula):
   - Do NOT create a new ticket.
   - Increment `duplicate_count` on the existing complaint, boost its severity by `+1` (capped at 10), recalculate priority (`Low`, `Medium`, `High`, `Critical`), and return `merged: true` with the existing `complaint_id`.
5. **Auto-Routing:** Assign the complaint to the mapped department with status `"Pending"`.

## 3. Additional Backend Endpoints
- `GET /api/reports`: Return all complaints sorted by severity/priority (supports optional `?department=` filter).
- `PATCH /api/reports/{id}/status`: Update status (`Pending` -> `In Progress` -> `Resolved`) from the Authority Dashboard.
- **Seed Data:** On startup, if `complaints.json` does not exist, initialize it with 4–5 realistic dummy complaints using the coordinates saved in `./demo_assets/coords.txt` so the map is populated immediately.

## 4. Unified Frontend UI (`./frontend`)
- **Top Navbar:** App title **CivicPulse AI** + instant view switcher tabs: `[Citizen Portal]` | `[Authority Dashboard]`.
- **Citizen Portal:**
  - **Report Form:** Image upload preview, `lat`/`lng` inputs (include a "Use Demo Location" dropdown populated from sample venue coordinates for quick testing), and Submit button showing AI classification + duplicate merge feedback.
  - **Track & Nearby:** Search/view complaint status live + interactive Leaflet map showing nearby reported issues.
- **Authority Dashboard:**
  - **KPI Cards:** Total Reports, Critical/High Priority count, Merged Duplicates saved, Resolved count.
  - **Interactive Map:** Leaflet map showing all complaints color-coded by priority.
  - **Priority Queue Table:** Sorted by severity, showing photo thumbnail, issue type, department badge, duplicate count badge, sensitive zone tag, and a live Status dropdown (`Pending`, `In Progress`, `Resolved`).
