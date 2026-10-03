# College Attendance Offline
Python + Django + Django REST Framework + SQLite + HTML + CSS + Vanilla JavaScript.

No React, Vue, Node.js, PostgreSQL, html5-qrcode, or other frontend scanner package.

Setup:
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    python manage.py migrate
    python manage.py seed_demo
    python manage.py runserver

Open http://127.0.0.1:8000/

Faculty: teacher1 / Teacher@12345
Student: 25BCON0838 / Student@12345

Faculty dashboard:
- Today's lectures from SQLite/DRF
- Scan 1-D ID-card barcode containing enrollment number
- Manual enrollment fallback
- Present/absent and mark-all
- Offline IndexedDB storage
- Bulk synchronization
- Student register/add/deactivate
- Attendance records

Student dashboard:
- Separate role-based page
- Own attendance and percentage only

Barcode:
The test ID-card uses enrollment number 25BCON0838. The native BarcodeDetector API is used.
Camera access on phones requires HTTPS (localhost is allowed for development).
