import os
import re
import json
import math
import uuid
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
ENV_PATH = BASE_DIR / ".env"

if ENV_PATH.exists():
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

try:
    from dotenv import load_dotenv
    load_dotenv(ENV_PATH)
except ImportError:
    pass

try:
    from google import genai
    from google.genai import types
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False

UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
COMPLAINTS_FILE = BASE_DIR / "complaints.json"
COORDS_FILE = ROOT_DIR / "demo_assets" / "coords.txt"

app = FastAPI(title="CivicPulse AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")

DEPT_MAP = {
    "pothole": "Roads",
    "drainage": "Roads",
    "garbage": "Sanitation",
    "water_leak": "Water",
    "streetlight": "Electricity",
}


class StatusUpdate(BaseModel):
    status: str


def calculate_priority(severity: int) -> str:
    if severity >= 9:
        return "Critical"
    if severity >= 7:
        return "High"
    if severity >= 4:
        return "Medium"
    return "Low"


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_demo_locations() -> list[dict]:
    locations = []
    if COORDS_FILE.exists():
        for idx, line in enumerate(COORDS_FILE.read_text().splitlines(), start=1):
            match = re.search(r"(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)", line)
            if match:
                lat, lng = float(match.group(1)), float(match.group(2))
                label_part = line[: match.start()].strip(" :-")
                label = label_part if label_part else f"Demo Zone {idx}"
                locations.append({"label": label, "lat": lat, "lng": lng})
    if not locations:
        locations = [
            {"label": "Main Gate Junction", "lat": 26.8467, "lng": 80.9462},
            {"label": "City Hospital Road", "lat": 26.8485, "lng": 80.9480},
            {"label": "Central Market Lane", "lat": 26.8450, "lng": 80.9445},
        ]
    return locations


def read_complaints() -> list[dict]:
    if not COMPLAINTS_FILE.exists():
        return []
    try:
        data = json.loads(COMPLAINTS_FILE.read_text())
        return data if isinstance(data, list) else []
    except Exception:
        return []


def write_complaints(data: list[dict]) -> None:
    COMPLAINTS_FILE.write_text(json.dumps(data, indent=2))


def seed_initial_data() -> None:
    if COMPLAINTS_FILE.exists() and len(read_complaints()) > 0:
        return
    locs = parse_demo_locations()
    samples = [
        ("pothole", 7, "Roads", "Deep asphalt pothole blocking left lane near junction.", True, 2, "Pending"),
        ("garbage", 5, "Sanitation", "Overflowing municipal waste bin spilling onto sidewalk.", False, 1, "In Progress"),
        ("water_leak", 8, "Water", "Pressurized underground water pipe burst flooding road.", True, 3, "Pending"),
        ("streetlight", 4, "Electricity", "Broken streetlamp pole causing dark stretch at night.", False, 1, "Pending"),
        ("drainage", 6, "Roads", "Clogged storm drain causing stagnant water accumulation.", False, 1, "Resolved"),
    ]
    seeded = []
    for i, (itype, sev, dept, summary, sens, dupes, status) in enumerate(samples):
        loc = locs[i % len(locs)]
        offset = i * 0.0006
        seeded.append({
            "id": f"CP-{1001 + i}",
            "issue_type": itype,
            "severity": sev,
            "priority": calculate_priority(sev),
            "department": dept,
            "summary": summary,
            "lat": round(loc["lat"] + offset, 6),
            "lng": round(loc["lng"] + offset, 6),
            "sensitive_zone": sens,
            "duplicate_count": dupes,
            "status": status,
            "image_url": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    write_complaints(seeded)


@app.on_event("startup")
def on_startup():
    seed_initial_data()


def analyze_image_with_gemini(image_bytes: bytes, mime_type: str, user_desc: str) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if GENAI_AVAILABLE and api_key:
        try:
            client = genai.Client(api_key=api_key)
            prompt = (
                "Analyze this civic infrastructure issue photo. Return ONLY valid JSON with keys: "
                "'issue_type' (must be one of: pothole, garbage, water_leak, streetlight, drainage), "
                "'base_severity' (integer 1 to 10 based on hazard size and urgency), "
                "'department' (Roads, Sanitation, Water, or Electricity), "
                "'summary' (concise 1-sentence description of the issue). "
                f"Citizen note: {user_desc or 'None'}"
            )
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type or "image/jpeg"),
                    prompt,
                ],
                config=types.GenerateContentConfig(response_mime_type="application/json"),
            )
            parsed = json.loads(response.text)
            itype = str(parsed.get("issue_type", "pothole")).lower().strip()
            if itype not in DEPT_MAP:
                itype = "pothole"
            sev = max(1, min(10, int(parsed.get("base_severity", 6))))
            dept = DEPT_MAP[itype]
            summary = str(parsed.get("summary", f"Reported {itype.replace('_', ' ')} issue."))
            return {"issue_type": itype, "base_severity": sev, "department": dept, "summary": summary}
        except Exception as e:
            print("Gemini fallback triggered:", e)

    text_hint = (user_desc or "").lower()
    if "garbage" in text_hint or "trash" in text_hint or "waste" in text_hint:
        itype, sev = "garbage", 5
    elif "water" in text_hint or "leak" in text_hint or "pipe" in text_hint:
        itype, sev = "water_leak", 7
    elif "light" in text_hint or "lamp" in text_hint:
        itype, sev = "streetlight", 4
    elif "drain" in text_hint:
        itype, sev = "drainage", 6
    else:
        itype, sev = "pothole", 6
    return {
        "issue_type": itype,
        "base_severity": sev,
        "department": DEPT_MAP[itype],
        "summary": user_desc if user_desc else f"Detected {itype.replace('_', ' ')} requiring municipal inspection.",
    }


def check_location_sensitivity(lat: float, lng: float) -> bool:
    query = f"""
    [out:json][timeout:3];
    (
      node(around:200,{lat},{lng})["amenity"~"school|hospital"];
      way(around:200,{lat},{lng})["amenity"~"school|hospital"];
      way(around:200,{lat},{lng})["highway"~"primary|trunk"];
    );
    out body 1;
    """
    try:
        data = urllib.parse.urlencode({"data": query}).encode("utf-8")
        req = urllib.request.Request("https://overpass-api.de/api/interpreter", data=data)
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return len(result.get("elements", [])) > 0
    except Exception:
        return False


@app.get("/api/demo-locations")
def get_demo_locations():
    return parse_demo_locations()


@app.get("/api/reports")
def get_reports(department: Optional[str] = None):
    complaints = read_complaints()
    if department and department.lower() != "all":
        complaints = [c for c in complaints if c.get("department", "").lower() == department.lower()]
    return sorted(complaints, key=lambda x: x.get("severity", 0), reverse=True)


@app.post("/api/reports")
async def create_report(
    image: UploadFile = File(...),
    lat: float = Form(...),
    lng: float = Form(...),
    description: Optional[str] = Form(""),
):
    ext = Path(image.filename or "upload.jpg").suffix or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = UPLOADS_DIR / filename
    image_bytes = await image.read()
    file_path.write_bytes(image_bytes)
    image_url = f"/uploads/{filename}"

    ai_result = analyze_image_with_gemini(image_bytes, image.content_type or "image/jpeg", description or "")
    sensitive_zone = check_location_sensitivity(lat, lng)

    severity = ai_result["base_severity"] + (2 if sensitive_zone else 0)
    severity = min(10, severity)

    complaints = read_complaints()

    for existing in complaints:
        if (
            existing.get("status") != "Resolved"
            and existing.get("issue_type") == ai_result["issue_type"]
            and haversine_meters(lat, lng, existing["lat"], existing["lng"]) <= 50.0
        ):
            existing["duplicate_count"] = existing.get("duplicate_count", 1) + 1
            existing["severity"] = min(10, max(existing.get("severity", 5), severity) + 1)
            existing["priority"] = calculate_priority(existing["severity"])
            if sensitive_zone:
                existing["sensitive_zone"] = True
            existing["image_url"] = image_url
            write_complaints(complaints)
            return {
                "merged": True,
                "message": f"Merged with existing nearby complaint {existing['id']} and escalated priority!",
                "complaint": existing,
            }

    next_num = 1001 + len(complaints)
    new_complaint = {
        "id": f"CP-{next_num}",
        "issue_type": ai_result["issue_type"],
        "severity": severity,
        "priority": calculate_priority(severity),
        "department": ai_result["department"],
        "summary": ai_result["summary"],
        "lat": lat,
        "lng": lng,
        "sensitive_zone": sensitive_zone,
        "duplicate_count": 1,
        "status": "Pending",
        "image_url": image_url,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    complaints.append(new_complaint)
    write_complaints(complaints)
    return {"merged": False, "complaint": new_complaint}


@app.patch("/api/reports/{complaint_id}/status")
def update_report_status(complaint_id: str, payload: StatusUpdate):
    complaints = read_complaints()
    for c in complaints:
        if c["id"] == complaint_id:
            c["status"] = payload.status
            write_complaints(complaints)
            return c
    raise HTTPException(status_code=404, detail="Complaint not found")