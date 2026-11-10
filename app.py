import json
import os
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="RigDoctor Engine")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Mount static files (style.css, main.js) from current folder
app.mount("/static", StaticFiles(directory=BASE_DIR), name="static")

KB_RULES = {
    "Audio": {
        "symptoms": ["No sound output", "Distorted audio", "Microphone not detected"],
        "known_bugs": "Windows audio service conflicts often occur after cumulative updates when vendor audio drivers (Realtek/Nahimic) get out of sync with Windows Audio Endpoint Builder.",
        "ms_ref": "https://support.microsoft.com/en-us/windows/fix-sound-or-audio-problems-in-windows-73025246-b61c-40fb-671a-2535c082b640"
    },
    "Display": {
        "symptoms": ["Screen flickering", "Resolution locked at 1024x768", "Black screen on game launch"],
        "known_bugs": "Windows Update may overwrite dedicated GPU drivers (Nvidia/AMD/Intel) with generic DCH packages, breaking custom display configurations.",
        "ms_ref": "https://support.microsoft.com/en-us/windows/troubleshoot-screen-flickering-in-windows-47d5b0a7-89ea-bcda-42d8-149816dec55a"
    },
    "Net": {
        "symptoms": ["Frequent Wi-Fi drops", "No networks found", "Code 43 on Wireless Adapter"],
        "known_bugs": "Power Management features can force network adapters into selective suspend, preventing device recovery after waking from sleep.",
        "ms_ref": "https://support.microsoft.com/en-us/windows/fix-wi-fi-connection-issues-in-windows-9424a1f7-6a3b-65a6-4d78-7f07eee84d2c"
    }
}

OEM_PORTALS = {
    "Dell": "https://www.dell.com/support/home",
    "HP": "https://support.hp.com/drivers",
    "Lenovo": "https://pcsupport.lenovo.com",
    "Asus": "https://www.asus.com/support/Download-Center/",
    "Acer": "https://www.acer.com/support/drivers-and-manuals"
}

@app.get("/")
async def serve_dashboard():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))

@app.get("/download-agent")
async def download_agent():
    agent_path = os.path.join(BASE_DIR, "RigDoctorAgent.exe")
    return FileResponse(agent_path, filename="RigDoctorAgent.exe", media_type="application/octet-stream")

@app.post("/api/diagnose")
async def analyze_symptom(request: Request):
    data = await request.json()
    category = data.get("category", "General")
    rule = KB_RULES.get(category, {
        "symptoms": ["Device not starting (Code 10)", "Driver crashed (Code 43)"],
        "known_bugs": "Hardware resource conflict or corrupted inf registration.",
        "ms_ref": "https://learn.microsoft.com/en-us/windows-hardware/drivers/install/device-manager-error-messages"
    })
    return JSONResponse({"analysis": rule})

@app.post("/api/oem-lookup")
async def get_oem_portal(request: Request):
    data = await request.json()
    mfg = data.get("manufacturer", "")
    target_link = "https://support.microsoft.com/windows"
    for brand, link in OEM_PORTALS.items():
        if brand.lower() in mfg.lower():
            target_link = link
            break
    return JSONResponse({"portal": target_link})

@app.post("/api/feedback")
async def submit_feedback(request: Request):
    feedback_data = await request.json()
    feedback_file = os.path.join(BASE_DIR, "feedback_store.json")
    
    entries = []
    if os.path.exists(feedback_file):
        with open(feedback_file, "r") as f:
            try:
                entries = json.load(f)
            except Exception:
                entries = []
    
    entries.append(feedback_data)
    with open(feedback_file, "w") as f:
        json.dump(entries, f, indent=2)
        
    return JSONResponse({"status": "received"})