function renderLectures(lectures) {
  return lectures.map(l => {
    const course = l.course || "";
    const isCombined = l.is_combined || (Array.isArray(l.sections) && l.sections.length > 1);
    const sectionName = (Array.isArray(l.sections) && l.sections.length ? l.sections.join(", ") : l.section) || "";
    const parts = [];
    if (course) parts.push(course);
    if (sectionName) {
      parts.push(isCombined ? `Sections ${sectionName} (Combined)` : `Section ${sectionName}`);
    }
    const meta = parts.join(" • ");
    const count = l.students ? l.students.length : 0;
    return `
    <div class="panel">
      <h3>${l.subject || "Lecture"}</h3>
      <p><b>${l.start_time} - ${l.end_time}</b></p>
      <p>${meta ? meta + " • " : ""}${count} students</p>
      <a class="btn" href="/faculty/attendance/${l.id}/">Take Attendance</a>
    </div>
  `;
  }).join("");
}

async function load() {
  let b = document.getElementById("lectures");
  if (!b) return;
  try {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 5000);
    let r = await fetch("/api/bootstrap/", { signal: ac.signal });
    clearTimeout(tid);
    if (!r.ok) throw new Error("API network response was not ok");
    let d = await r.json();
    localStorage.setItem("dailySchedule", JSON.stringify(d));
    b.innerHTML = d.lectures && d.lectures.length
      ? renderLectures(d.lectures)
      : `<div class="panel">No lectures scheduled for today.</div>`;
  } catch (e) {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem("dailySchedule")); } catch (_) {}
    if (cached && cached.lectures && cached.lectures.length) {
      b.innerHTML = '<div class="panel" style="background:#fff8e1;margin-bottom:8px"><b>⚠ Offline</b> — showing cached lectures</div>' + renderLectures(cached.lectures);
    } else {
      b.innerHTML = '<div class="panel">Could not load lectures. Connect to the internet.</div>';
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  const refBtn = document.getElementById("refresh");
  if (refBtn) refBtn.onclick = load;
  
  let updateNet = () => {
    const netEl = document.getElementById("network");
    if (netEl) {
      netEl.textContent = navigator.onLine ? "Online" : "Offline";
      netEl.className = "status " + (navigator.onLine ? "online" : "offline");
    }
  };
  
  updateNet();
  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);
});

