# College Attendance Offline

Python + Django + Django REST Framework + SQLite + HTML + CSS + Vanilla JavaScript.

No heavy external libraries like React, Vue, Node.js, PostgreSQL, `html5-qrcode`, or third-party frontend scanner packages.

---

## 🔥 Key Highlights & Standout Features

- ⚡ **Ultra-Fast Client-Side Barcode Scanning**: Uses the native browser `BarcodeDetector` API directly on video frames. Scans student 1D ID-card barcodes instantly with zero network roundtrip latency or heavy JavaScript libraries.
- 📡 **Low-Connectivity & Offline Resilience**: Attendance can be taken seamlessly in low connectivity or complete offline environments (classrooms with poor cellular coverage, basements, network dropouts).
- 💾 **IndexedDB Local Storage & Instant Feedback**: Roster data and attendance state are stored locally in IndexedDB, giving immediate visual and audio feedback to faculty upon barcode detection.
- 🔄 **Atomic Bulk Sync**: Queued offline attendance records are automatically or manually bulk-synchronized in a single atomic transaction when connectivity is restored.
- 🏫 **Combined Section Support**: Merge multiple sections into a single lecture session without duplicate record issues.
- 👥 **Role-Based Portals**: Dedicated dashboards for Faculty (taking attendance, scanning, roster management) and Students (attendance history and percentage tracking).

---

## 🚀 Quick Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

Open `http://127.0.0.1:8000/`

---

## 🔑 Demo Credentials

- **Faculty**: `teacher1` / `Teacher@12345`
- **Student**: `25BCON0838` / `Student@12345`

---

## 📱 Feature Overview

### Faculty Dashboard:
- Today's lectures loaded from SQLite/DRF and cached to IndexedDB
- Lightning-fast 1-D ID-card barcode scanning via camera
- Manual enrollment fallback & quick toggles (Present/Absent/Mark-All)
- Low-connectivity offline storage with background bulk sync
- Student registration, roster management & status toggles
- Attendance record overview and CSV/Excel export

### Student Dashboard:
- Dedicated role-based view
- Subject-wise attendance breakdown and overall percentage calculations

---

## 🔍 Technical Notes (Barcode & Camera)

- Test ID-card uses enrollment number `25BCON0838`.
- Uses native browser `window.BarcodeDetector` for lightweight performance.
- Mobile camera access requires HTTPS (localhost is permitted for local development).
- **[Feature Documentation](FEATURES.md)**: User-friendly feature breakdown, workflows, and functional benefits.
- **[System Architecture Documentation](ARCHITECTURE.md)**: Data models, API endpoints, offline workflow, IndexedDB strategy, and camera scanning mechanism.

