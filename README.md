# CivicPulse AI — Smart Civic Issue Reporting & Priority Routing

An AI-powered civic complaint triage platform that turns citizen photo reports into prioritized, deduplicated, department-routed municipal tickets.

## Key Features
- **AI Vision Classification (`Gemini 2.5 Flash`):** Automatically identifies `pothole`, `garbage`, `water_leak`, `streetlight`, and `drainage` issues with base severity scores and summaries.
- **50m Spatial Deduplication (Haversine):** Merges duplicate reports within a 50-meter radius and escalates ticket priority instead of flooding authorities with duplicate tickets.
- **Location Sensitivity Boost (OpenStreetMap Overpass API):** Detects nearby schools, hospitals, and primary highways within 200m and automatically boosts severity (`+2`).
- **Department Auto-Routing:** Routes tickets directly to **Roads**, **Sanitation**, **Water**, or **Electricity** queues.
- **Dual Portals & Live Map:** Citizen Portal for reporting/tracking and Authority Dashboard with KPIs, priority queue, and live status updates.

## Tech Stack
- **Backend:** Python, FastAPI, Google GenAI SDK, OpenStreetMap Overpass API
- **Frontend:** React, Vite, Leaflet (`react-leaflet`), Lucide Icons
