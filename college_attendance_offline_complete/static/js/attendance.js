let L = null, A = {}, scanner = null;
const C = window.CFG;

function getISTTimestamp() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - (offset * 60000));
  return local.toISOString().slice(0, 19) + "+05:30";
}

function msg(t, ok = true) {
  let e = document.getElementById("message");
  if (!e) return;
  if (!e.dataset.init) { e.textContent = ''; e.dataset.init = '1'; }
  let d = document.createElement("div");
  d.textContent = t;
  d.style.cssText = "padding:6px 10px;border-radius:6px;margin-bottom:3px;background:" + (ok ? "#e2f4e5" : "#fde2e2") + ";transition:opacity .3s";
  e.prepend(d);
  setTimeout(() => { d.style.opacity = "0"; setTimeout(() => d.remove(), 300); }, 4000);
  while (e.children.length > 6) e.lastChild.remove();
}

function getLectureKey(start, end, sections) {
  const clean = t => String(t || "").replace(":", "").replace(/^0/, "");
  const secs = Array.isArray(sections)
    ? [...sections].sort().join("_")
    : sections;
  return `lec_${clean(start)}_${clean(end)}_${secs}`;
}

let currentSectionFilter = "ALL";

function getRoll(student) {
  return (student?.roll_no || student?.enrollment_no || "").trim().toUpperCase();
}

function render() {
  let box = document.getElementById("students");
  if (!box) return;
  box.innerHTML = "";

  const students = L?.students || [];
  const totalInRoster = students.length;

  let totalPresentCount = 0;
  students.forEach(s => {
    let roll = getRoll(s);
    if (A[roll]?.status === "present") totalPresentCount++;
  });

  let displayStudents = students;
  if (currentSectionFilter && currentSectionFilter !== "ALL") {
    displayStudents = students.filter(s => (s.section || "").trim().toUpperCase() === currentSectionFilter);
  }

  let filteredPresentCount = 0;
  displayStudents.forEach(s => {
    let roll = getRoll(s);
    let a = A[roll], yes = a?.status === "present";
    if (yes) filteredPresentCount++;
    let d = document.createElement("div");
    d.className = "student " + (yes ? "present" : "");
    d.dataset.roll = roll;
    const studentName = (s.name || s.student_name || "").trim() || roll;
    const secBadge = s.section ? `<span class="sec-badge">Sec ${s.section}</span>` : "";
    d.innerHTML = `<span><b>${roll}</b> — ${studentName} ${secBadge}</span><button class="btn ${yes ? "secondary" : ""}">${yes ? "PRESENT" : "ABSENT"}</button>`;
    d.querySelector("button").onclick = () => setA(roll, yes ? "absent" : "present");
    box.appendChild(d);
  });

  const presEl = document.getElementById("present");
  const totEl = document.getElementById("total");
  const absEl = document.getElementById("absent");

  const showPresent = currentSectionFilter === "ALL" ? totalPresentCount : filteredPresentCount;
  const showTotal = currentSectionFilter === "ALL" ? totalInRoster : displayStudents.length;

  if (presEl) presEl.textContent = showPresent;
  if (totEl) totEl.textContent = showTotal;
  if (absEl) absEl.textContent = showTotal - showPresent;
}

async function setA(roll, status) {
  if (!L) return;
  roll = roll.trim().toUpperCase();
  let st = L.students.find(x => getRoll(x) === roll);
  if (!st) {
    msg("Student Not Found: " + roll, false);
    return;
  }
  
  const KEY = getLectureKey(C.startTime, C.endTime, C.sectionName);
  let records = JSON.parse(localStorage.getItem(KEY) || "{}");
  const recordId = records[roll]?.record_id || A[roll]?.record_id || crypto.randomUUID();
  const timestamp = status === "present" ? getISTTimestamp() : null;
  
  records[roll] = { record_id: recordId, status, timestamp };
  localStorage.setItem(KEY, JSON.stringify(records));
  A[roll] = records[roll];
  
  let pending = JSON.parse(localStorage.getItem("pendingSyncs") || "[]");
  if (!pending.includes(KEY)) pending.push(KEY);
  localStorage.setItem("pendingSyncs", JSON.stringify(pending));
  
  render();
  
  if (navigator.onLine) {
    try {
      const csrf = document.querySelector('meta[name="csrf-token"]')?.content || "";
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), 5000);
      const r = await fetch(C.markUrl, {
        method: "POST",
        signal: ac.signal,
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrf },
        body: JSON.stringify({
          lecture_id: C.lectureId,
          record_id: recordId,
          student_roll: roll,
          status,
          timestamp
        })
      });
      clearTimeout(tid);
      if (!r.ok) throw Error("Server rejected attendance");
      const d = await r.json();
      let fresh = JSON.parse(localStorage.getItem(KEY) || "{}");
      fresh[roll] = { ...fresh[roll], record_id: d.record_id };
      localStorage.setItem(KEY, JSON.stringify(fresh));
      A[roll] = fresh[roll];
      msg(`${d.student_name} (${d.student_roll}) marked ${status.toUpperCase()}.`);
      return;
    } catch (e) {
      console.warn("Failed to sync attendance online:", e);
      msg(`${st.name} marked ${status.toUpperCase()} locally. Will sync when online.`);
      return;
    }
  }
  msg(`${st.name} marked ${status.toUpperCase()} OFFLINE. It will sync automatically.`);
}

async function scan(x) {
  if (!x) return;
  x = String(x).replace(/[\r\n\t]/g, "").trim().toUpperCase();

  // If a URL or path was scanned, extract the terminal ID
  if (x.includes("://") || x.includes("/")) {
    const parts = x.split("/").filter(Boolean);
    const lastPart = parts[parts.length - 1].split("?")[0].trim();
    if (L?.students?.some(q => getRoll(q) === lastPart)) {
      x = lastPart;
    }
  }

  let s = L?.students?.find(q => getRoll(q) === x);
  if (!s) {
    if (scanner) scanner.triggerHighlight(false);
    msg("Student not in roster: " + x, false);
    return;
  }
  if (A[x]?.status === "present") {
    if (scanner) scanner.triggerHighlight(true);
    msg(x + " is already PRESENT.");
    return;
  }
  if (scanner) scanner.triggerHighlight(true);
  await setA(x, "present");
}

async function load() {
  const KEY = C.lectureKey || getLectureKey(C.startTime, C.endTime, C.sectionName);
  let localData = JSON.parse(localStorage.getItem(KEY) || "null");
  let schedule = JSON.parse(localStorage.getItem("dailySchedule") || "null");

  const netEl = document.getElementById("network");
  if (netEl) {
    netEl.textContent = navigator.onLine ? "Online" : "Offline";
    netEl.className = "status " + (navigator.onLine ? "online" : "offline");
  }

  // 1. Immediately initialize from preloaded roster if available (zero-delay render)
  if (!L && Array.isArray(C.preloadedStudents) && C.preloadedStudents.length > 0) {
    L = {
      id: C.lectureId,
      lecture_key: C.lectureKey || getLectureKey(C.startTime, C.endTime, C.sectionName),
      subject: C.subject,
      course: C.course,
      section: C.sectionName,
      sections: C.sections,
      is_combined: C.isCombined,
      students: C.preloadedStudents
    };
    if (!localData) {
      localData = {};
      C.preloadedStudents.forEach(s => {
        let roll = getRoll(s);
        if (s.attendance) {
          localData[roll] = {
            record_id: s.attendance.record_id,
            status: s.attendance.status,
            timestamp: s.attendance.timestamp
          };
        } else {
          localData[roll] = {
            record_id: crypto.randomUUID(),
            status: "absent",
            timestamp: null
          };
        }
      });
      localStorage.setItem(KEY, JSON.stringify(localData));
    }
    A = localData;
    render();
  }

  // 2. Fetch latest updates from server
  if (navigator.onLine) {
    try {
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), 5000);
      let r = await fetch(C.bootstrapUrl, { signal: ac.signal });
      clearTimeout(tid);
      if (r.ok) {
        let d = await r.json();
        localStorage.setItem("dailySchedule", JSON.stringify(d));
        schedule = d;

        let currentLec = d.lectures ? d.lectures.find(q => q.id === C.lectureId) : null;
        if (currentLec) {
          L = currentLec;
          if (!localData) {
            localData = {};
            currentLec.students.forEach(s => {
              let roll = getRoll(s);
              if (s.attendance) {
                localData[roll] = {
                  record_id: s.attendance.record_id,
                  status: s.attendance.status,
                  timestamp: s.attendance.timestamp
                };
              } else {
                localData[roll] = {
                  record_id: crypto.randomUUID(),
                  status: "absent",
                  timestamp: null
                };
              }
            });
            localStorage.setItem(KEY, JSON.stringify(localData));
          }
          A = localData;
          render();
        }
      }
    } catch (e) {
      console.error("Failed to bootstrap schedule from server:", e);
    }
  }

  // 3. Fallback to cached schedule
  if (!L && schedule && schedule.lectures) {
    let currentLec = schedule.lectures.find(q => q.id === C.lectureId);
    if (currentLec) {
      L = currentLec;
    }
  }

  if (L) {
    if (!localData) {
      localData = {};
      L.students.forEach(s => {
        let roll = getRoll(s);
        localData[roll] = {
          record_id: crypto.randomUUID(),
          status: "absent",
          timestamp: null
        };
      });
      localStorage.setItem(KEY, JSON.stringify(localData));
    }
    A = localData;
    render();
  } else {
    msg("Lecture roster not cached. Connect to internet first.", false);
  }
}

function showSyncConfirmation(details = {}) {
  const modal = document.getElementById("syncModal");
  const syncBadge = document.getElementById("syncBadge");
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  if (syncBadge) {
    syncBadge.textContent = `✓ Synced ${timeStr}`;
    syncBadge.style.display = "inline-flex";
  }

  const students = L?.students || [];
  let presentCount = 0;
  students.forEach(s => {
    let roll = getRoll(s);
    if (A[roll]?.status === "present") presentCount++;
  });
  const totalCount = students.length;
  const absentCount = totalCount - presentCount;

  const totalEl = document.getElementById("modalTotal");
  const presEl = document.getElementById("modalPresent");
  const absEl = document.getElementById("modalAbsent");
  const syncTimeEl = document.getElementById("modalSyncTime");
  const descEl = document.getElementById("modalDesc");
  const subjEl = document.getElementById("modalSubject");
  const secEl = document.getElementById("modalSections");

  if (totalEl) totalEl.textContent = totalCount;
  if (presEl) presEl.textContent = presentCount;
  if (absEl) absEl.textContent = absentCount;
  if (syncTimeEl) syncTimeEl.textContent = `${timeStr} (IST)`;
  if (subjEl && (L?.subject || C?.subject)) subjEl.textContent = L?.subject || C?.subject;
  if (secEl) {
    if (C?.isCombined || (L?.sections && L.sections.length > 1)) {
      const names = Array.isArray(L?.sections) ? L.sections.join(", ") : (C?.sections?.join(", ") || C?.sectionName);
      secEl.textContent = `Sections ${names} (Combined)`;
    } else {
      secEl.textContent = `Section ${C?.sectionName || ""}`;
    }
  }

  if (descEl) {
    if (details.acceptedCount !== undefined && details.acceptedCount > 0) {
      descEl.textContent = `Successfully uploaded ${details.acceptedCount} offline attendance record(s) and synced roster with server.`;
    } else {
      descEl.textContent = "All student records and attendance states are fully synchronized with the server.";
    }
  }

  if (modal) {
    modal.style.display = "flex";
  }

  msg(`Attendance synced successfully (${presentCount} Present, ${absentCount} Absent).`);
}

function hideSyncConfirmation() {
  const modal = document.getElementById("syncModal");
  if (modal) modal.style.display = "none";
}

function initSectionFilters() {
  const filterBtns = document.querySelectorAll(".sec-filter-btn");
  filterBtns.forEach(btn => {
    btn.onclick = () => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentSectionFilter = btn.dataset.sec || "ALL";
      render();
    };
  });
}

async function sync(isManual = false) {
  const syncBtn = document.getElementById("sync");
  const origBtnText = syncBtn ? syncBtn.textContent : "Sync Attendance";
  if (syncBtn) {
    syncBtn.disabled = true;
    syncBtn.textContent = "Syncing...";
  }

  if (!navigator.onLine) {
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.textContent = origBtnText;
    }
    msg("Offline: Cannot sync attendance now. Changes saved locally.", false);
    return;
  }

  let totalAccepted = 0;
  let pending = JSON.parse(localStorage.getItem("pendingSyncs") || "[]");

  if (pending.length > 0) {
    msg("Syncing offline records...");

    const KEY = L?.lecture_key || getLectureKey(C.startTime, C.endTime, C.sectionName);

    for (let key of [...pending]) {
      let recordsObj = JSON.parse(localStorage.getItem(key) || "{}");
      let targetLectureId = null;

      if (key === KEY) {
        targetLectureId = C.lectureId;
      } else {
        let schedule = JSON.parse(localStorage.getItem("dailySchedule") || "{}");
        if (schedule && schedule.lectures) {
          let matchedLec = schedule.lectures.find(l => {
            let k = l.lecture_key || getLectureKey(l.start_time, l.end_time, l.sections || l.section);
            return k === key;
          });
          if (matchedLec) {
            targetLectureId = matchedLec.id;
          }
        }
      }

      if (!targetLectureId) {
        console.warn("Could not resolve lecture ID for key: " + key);
        continue;
      }

      let records = Object.entries(recordsObj).map(([student_roll, v]) => ({
        record_id: v.record_id,
        student_roll: student_roll,
        status: v.status,
        timestamp: v.timestamp
      }));

      try {
        let csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";
        const ac = new AbortController();
        const tid = setTimeout(() => ac.abort(), 10000);
        let r = await fetch(C.syncUrl, {
          method: "POST",
          signal: ac.signal,
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken
          },
          body: JSON.stringify({
            lecture_id: targetLectureId,
            records: records
          })
        });
        clearTimeout(tid);

        if (!r.ok) throw new Error("Sync failed on server");
        let d = await r.json();
        totalAccepted += (d.accepted || 0);

        pending = pending.filter(k => k !== key);
        localStorage.setItem("pendingSyncs", JSON.stringify(pending));
      } catch (e) {
        console.error("Failed to sync key: " + key, e);
        msg("Sync failed; attendance remains offline.", false);
        if (syncBtn) {
          syncBtn.disabled = false;
          syncBtn.textContent = origBtnText;
        }
        return;
      }
    }
  }

  // Fetch the latest state from the server
  try {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 5000);
    let r = await fetch(C.bootstrapUrl, { signal: ac.signal });
    clearTimeout(tid);
    if (r.ok) {
      let d = await r.json();
      localStorage.setItem("dailySchedule", JSON.stringify(d));
      let currentLec = d.lectures.find(q => q.id === C.lectureId);
      if (currentLec) {
        L = currentLec;
        const KEY = currentLec.lecture_key || getLectureKey(C.startTime, C.endTime, C.sectionName);
        let localData = JSON.parse(localStorage.getItem(KEY) || "{}");
        
        currentLec.students.forEach(s => {
          let roll = getRoll(s);
          if (s.attendance) {
            localData[roll] = {
              record_id: s.attendance.record_id,
              status: s.attendance.status,
              timestamp: s.attendance.timestamp
            };
          } else if (!localData[roll]) {
            localData[roll] = {
              record_id: crypto.randomUUID(),
              status: "absent",
              timestamp: null
            };
          }
        });
        
        localStorage.setItem(KEY, JSON.stringify(localData));
        A = localData;
        render();
      }
    }

    // Always show sync confirmation modal and badge on manual or completed sync!
    showSyncConfirmation({ acceptedCount: totalAccepted });
  } catch (e) {
    console.error("Failed to fetch latest from server:", e);
    msg("Could not fetch latest updates from server.", false);
  } finally {
    if (syncBtn) {
      syncBtn.disabled = false;
      syncBtn.textContent = origBtnText;
    }
  }
}

async function markAll(status) {
  if (!L || !L.students) return;
  const KEY = L.lecture_key || getLectureKey(C.startTime, C.endTime, C.sectionName);
  let records = JSON.parse(localStorage.getItem(KEY) || "{}");

  L.students.forEach(s => {
    let roll = getRoll(s);
    if (roll) {
      records[roll] = {
        record_id: records[roll]?.record_id || crypto.randomUUID(),
        status: status,
        timestamp: status === "present" ? getISTTimestamp() : null
      };
    }
  });

  localStorage.setItem(KEY, JSON.stringify(records));
  A = records;

  let pending = JSON.parse(localStorage.getItem("pendingSyncs") || "[]");
  if (!pending.includes(KEY)) {
    pending.push(KEY);
    localStorage.setItem("pendingSyncs", JSON.stringify(pending));
  }

  render();
  msg(`All marked ${status.toUpperCase()}.`);
}

document.addEventListener("DOMContentLoaded", async () => {
  await load();
  initSectionFilters();

  const flashBtn = document.getElementById("flashToggle");

  const startBtn = document.getElementById("start");
  if (startBtn) {
    startBtn.onclick = async () => {
      try {
        scanner = new NativeBarcodeScanner(document.getElementById("barcodeVideo"), scan);
        await scanner.start();
        msg("Scanner started. Point camera at student ID card barcode.");
        if (flashBtn) {
          flashBtn.style.display = "inline-block";
          flashBtn.textContent = "⚡ Flash OFF";
        }
      } catch (e) {
        msg(e.message, false);
      }
    };
  }

  if (flashBtn) {
    flashBtn.onclick = async () => {
      if (!scanner || !scanner.running) {
        msg("Start camera first to enable flashlight.", false);
        return;
      }
      try {
        const isOn = await scanner.toggleTorch();
        flashBtn.textContent = isOn ? "⚡ Flash ON" : "⚡ Flash OFF";
        msg(`Flashlight turned ${isOn ? "ON" : "OFF"}.`);
      } catch (e) {
        msg(e.message, false);
      }
    };
  }

  const stopBtn = document.getElementById("stop");
  if (stopBtn) {
    stopBtn.onclick = () => {
      if (scanner) {
        scanner.stop();
        msg("Scanner stopped.");
        if (flashBtn) {
          flashBtn.style.display = "none";
          flashBtn.textContent = "⚡ Flash OFF";
        }
      }
    };
  }

  const syncBtn = document.getElementById("sync");
  if (syncBtn) syncBtn.onclick = () => sync(true);

  const closeBtn = document.getElementById("modalCloseBtn");
  if (closeBtn) closeBtn.onclick = hideSyncConfirmation;

  const modalOverlay = document.getElementById("syncModal");
  if (modalOverlay) {
    modalOverlay.onclick = (e) => {
      if (e.target === modalOverlay) hideSyncConfirmation();
    };
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideSyncConfirmation();
  });

  const manualBtn = document.getElementById("manualBtn");
  if (manualBtn) {
    manualBtn.onclick = () => {
      let e = document.getElementById("manual");
      let x = e ? e.value.trim().toUpperCase() : "";
      if (x) scan(x);
      if (e) e.value = "";
    };
  }

  const allPresBtn = document.getElementById("allPresent");
  if (allPresBtn) allPresBtn.onclick = () => markAll("present");

  const allAbsBtn = document.getElementById("allAbsent");
  if (allAbsBtn) allAbsBtn.onclick = () => markAll("absent");

  window.addEventListener("online", () => {
    const ne = document.getElementById("network");
    if (ne) { ne.textContent = "Online"; ne.className = "status online"; }
    msg("Back online. Syncing...");
    sync(false);
  });
  window.addEventListener("offline", () => {
    const ne = document.getElementById("network");
    if (ne) { ne.textContent = "Offline"; ne.className = "status offline"; }
    msg("You are offline. Attendance is saved locally.", false);
  });
  
  const netEl = document.getElementById("network");
  if (netEl) {
    netEl.textContent = navigator.onLine ? "Online" : "Offline";
    netEl.className = "status " + (navigator.onLine ? "online" : "offline");
  }
});

