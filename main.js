const AUTH_TOKEN = "RIGDOC_LOCAL_SECURE_TOKEN_2026";
let socket = null;
let currentTargetDevice = null;
let systemManufacturer = "";

// State persistence across reboots
window.addEventListener("DOMContentLoaded", () => {
  initLocalBridge();
  checkPostRebootState();
});

function initLocalBridge() {
  socket = new WebSocket("ws://127.0.0.1:8765");

  socket.onopen = () => {
    document.getElementById("radarStatus").innerText = "RigDoctor Native Bridge Online. Ready for inspection.";
    socket.send(JSON.stringify({ token: AUTH_TOKEN, action: "GET_SYSTEM_INFO" }));
  };

  socket.onerror = () => {
    document.getElementById("radarStatus").innerHTML = 
      "<span style='color: #ff3366;'>Local Agent Offline.</span> Run <code>python agent/bridge.py</code> as Administrator.";
  };

  socket.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    handleBridgeResponse(payload);
  };
}

function handleBridgeResponse(msg) {
  if (msg.type === "SYSTEM_INFO") {
    systemManufacturer = msg.data.Manufacturer || "Generic";
    document.getElementById("oemDisplay").innerText = `Host: ${systemManufacturer} ${msg.data.Model || ""}`;
  } else if (msg.type === "SCAN_RESULTS") {
    renderScanResults(msg.data);
  } else if (msg.type === "RESTORE_STATUS") {
    console.log("Restore Point Status:", msg.status);
  } else if (msg.type === "FIX_STATUS") {
    sessionStorage.setItem("RIGDOC_IN_PROGRESS", "true");
    alert("Driver reset operation executed. A system restart may be required to clear kernel rings.");
    showFeedbackUI();
  }
}

document.getElementById("btnStartScan").addEventListener("click", () => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    document.getElementById("radarStatus").innerText = "Inspecting Windows PnP subsystem...";
    socket.send(JSON.stringify({ token: AUTH_TOKEN, action: "SCAN_DRIVERS" }));
  }
});

function renderScanResults(issues) {
  const container = document.getElementById("findingsContainer");
  const resultsView = document.getElementById("resultsView");
  document.getElementById("scanView").classList.add("hidden");
  resultsView.classList.remove("hidden");
  container.innerHTML = "";

  if (issues.length === 0) {
    container.innerHTML = "<p style='color: #00ff88;'>All present hardware devices report operational status (Status: OK).</p>";
    return;
  }

  issues.forEach((dev) => {
    const card = document.createElement("div");
    card.className = "metric-card";
    card.style.marginBottom = "1rem";
    card.innerHTML = `
      <h4>${dev.FriendlyName || "Unknown PnP Entity"}</h4>
      <p>Class: ${dev.Class} | Code: ${dev.Problem} (${dev.Status})</p>
      <button class="btn-secondary" style="margin-top: 8px;" onclick="probeDevice('${dev.InstanceId}', '${dev.Class}')">
        Isolate & Fix
      </button>
    `;
    container.appendChild(card);
  });
}

window.probeDevice = async function(instanceId, deviceClass) {
  currentTargetDevice = instanceId;
  const probeSection = document.getElementById("probeSection");
  probeSection.classList.remove("hidden");

  // Query FastAPI knowledge base
  const res = await fetch("/api/diagnose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: deviceClass })
  });
  const data = await res.json();

  document.getElementById("probeContext").innerText = 
    `Root Cause Profile: ${data.analysis.known_bugs} Refer to: ${data.analysis.ms_ref}`;

  setupEducationGate(deviceClass);
};

function setupEducationGate(deviceClass) {
  const gate = document.getElementById("educationGate");
  const eduText = document.getElementById("educationText");
  gate.classList.remove("hidden");

  eduText.innerText = `You are about to initiate recovery on ${deviceClass}. RigDoctor will execute standard PnP renegotiation without modifying personal files.`;

  const consentBox = document.getElementById("userConsentCheckbox");
  const fixBtn = document.getElementById("btnExecuteFix");

  consentBox.onchange = () => {
    fixBtn.disabled = !consentBox.checked;
  };

  fixBtn.onclick = () => {
    // 1. Create Restore Point
    socket.send(JSON.stringify({ token: AUTH_TOKEN, action: "CREATE_RESTORE" }));
    // 2. Trigger Safe Rollback/Reset
    socket.send(JSON.stringify({ token: AUTH_TOKEN, action: "EXECUTE_FIX", instance_id: currentTargetDevice }));
  };
}

function showFeedbackUI() {
  document.getElementById("resultsView").classList.add("hidden");
  document.getElementById("feedbackPanel").classList.remove("hidden");
  
  const stars = document.querySelectorAll("#ratingContainer span");
  let selectedScore = 5;
  stars.forEach((s) => {
    s.addEventListener("click", () => {
      selectedScore = parseInt(s.getAttribute("data-value"));
      stars.forEach(st => st.classList.remove("active"));
      for (let i = 0; i < selectedScore; i++) stars[i].classList.add("active");
    });
  });

  document.getElementById("btnSendFeedback").onclick = async () => {
    const comments = document.getElementById("feedbackComment").value;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: selectedScore, comment: comments })
    });
    sessionStorage.removeItem("RIGDOC_IN_PROGRESS");
    alert("Feedback logged. Thank you for using RigDoctor.");
    window.location.reload();
  };
}

function checkPostRebootState() {
  if (sessionStorage.getItem("RIGDOC_IN_PROGRESS") === "true") {
    showFeedbackUI();
  }
}