# Implementation Plan

## Goal
Add a lightweight **CMS‑style workflow** so that:
1. **Teachers can select which sections (classes) they have today** from a generated schedule.
2. **From that selection they can open the attendance page** for the chosen class.
3. **Admin staff can upload a timetable** (Excel/CSV) that populates the schedule for a given academic year.
4. **Section names can repeat each year** without ambiguity – the schedule ties a section to a specific `AcademicYear`.

---

## User Review Required
> [!IMPORTANT]
> The following design decisions need your confirmation before any code changes are made:
> - **AcademicYear model** – should it have a simple `name` (e.g., "2025‑2026") or also `start_date` / `end_date` fields?
> - **Timetable import format** – do you prefer a single sheet with columns `SectionName, Course, Semester, DayOfWeek, StartTime, EndTime, FacultyEmployeeID` (Excel) or a CSV with the same headers?
> - **UI location** – integrate the schedule/attendance‑selection pages into the existing faculty dashboard (`/faculty/dashboard/`) or create separate routes (`/faculty/schedule/` & `/faculty/attendance/`)?
> - **Permission model** – keep the existing `faculty_required` decorator, or add a new `schedule_required` that also checks the teacher is assigned to the requested lecture?
> - **Automatic lecture creation** – should the import command create `Lecture` objects for every timetable row (so the attendance view can reuse the existing `Lecture` model) or keep a separate `ClassSlot` model used only for UI selection?

---

## Open Questions
> [!WARNING]
> - How should we handle **multi‑year sections** with identical names (e.g., "CS101" in 2024 and 2025)? Using an `AcademicYear` foreign key on `Section` is one option – do you want that?
> - Do you need **support for multiple faculty per section** (co‑teaching) now, or is a one‑to‑many (faculty → sections) sufficient?
> - Will the timetable upload be a **one‑time bulk import** (similar to the previous seed script) or an **ongoing admin UI** where staff can edit rows?
> - Should the system send **email notifications** to teachers when a new timetable is uploaded?

---

## Proposed Changes
### Models (`attendance/models.py`)
- **AcademicYear**: `name` (unique), `start_date`, `end_date`.
- **Section**: add `academic_year = models.ForeignKey(AcademicYear, on_delete=models.PROTECT, related_name='sections')`.
- **Lecture** (already exists) will now include `academic_year` via its `section` relation, so no change needed.
- **TimetableImport** (optional model to store raw upload metadata).

### Admin (`attendance/admin.py`)
- Register `AcademicYear` and update `SectionAdmin` to display the new field.
- Add an admin action “Import timetable” that calls the new management command.

### Management Command (`attendance/management/commands/import_timetable.py`)
- Reads the chosen Excel/CSV.
- Creates/gets `AcademicYear` (specified via a command‑line arg `--year "2025‑2026"`).
- For each row, ensures the `Section` exists (creates if missing, linked to the year).
- Creates a `Lecture` object for each scheduled slot (day of week + times) **once per week** – we will store the weekday and time in `Lecture` and later filter by `date`.
- Uses `bulk_create` with a configurable batch size and wraps everything in a single transaction.

### Forms (`attendance/forms.py`)
- `TimetableUploadForm` – `FileField` + `academic_year` dropdown.
- `ScheduleSelectForm` – a simple form that lets a logged‑in teacher pick a date (default today) and then shows a list of their lectures for that day.

### Views (`attendance/views.py`)
- `schedule_view(request)`: shows today’s lectures for the logged‑in faculty. Uses `Lecture.objects.filter(faculty=request.user.facultyprofile, lecture_date=selected_date)`.
- `select_attendance(request, lecture_id)`: redirects to the existing attendance page for the chosen lecture.
- `timetable_upload_view(request)`: admin‑only view that processes `TimetableUploadForm` and calls the management command programmatically.

### URLs (`attendance/urls.py`)
```python
path('faculty/schedule/', schedule_view, name='faculty_schedule'),
path('faculty/schedule/select/<int:lecture_id>/', select_attendance, name='faculty_select_attendance'),
path('admin/timetable/upload/', timetable_upload_view, name='timetable_upload'),
```

### Templates (`templates/faculty/`)
- `schedule.html` – list of today’s lectures with a **“Take Attendance”** button for each.
- `timetable_upload.html` – simple form for uploading the file.

### Front‑end Enhancements
- Use a clean, modern table (CSS Grid + subtle hover animations) to display the schedule.
- Add a date picker (HTML5 `<input type="date">`) so teachers can view any day’s schedule.
- Add a micro‑animation when a lecture row is selected (e.g., a brief highlight).

---

## Verification Plan
### Automated Tests
- Run ` test attendance` after migrations to ensure model changes compile.
- Add unit tests for the new management command: verify that given a sample CSV it creates the correct number of `AcademicYear`, `Section`, and `Lecture` objects.
- Add a view test that a logged‑in faculty sees only their lectures for today.

### Manual Checks
1. **Migrate** the database.
2. **Create an AcademicYear** via admin (e.g., "2025‑2026").
3. **Upload a timetable** (CSV) for that year using `/admin/timetable/upload/`.
4. Log in as a faculty user and navigate to `/faculty/schedule/` – confirm the correct lectures appear.
5. Click “Take Attendance” on a lecture and ensure you are taken to the existing attendance page (`attendance_page`).
6. Verify that sections with the same name but different years are considered distinct (e.g., two `CS101` sections – one in 2024, one in 2025 – only the correct year shows up).

---

## Timeline (optional)
- **Day 1‑2**: Add models, migrations, admin registration.
- **Day 3‑4**: Implement management command and unit tests.
- **Day 5**: Add forms, views, URLs, and templates.
- **Day 6**: Polish UI (CSS, micro‑animations) and run manual verification.
- **Day 7**: Merge to main branch, tag release.

---

*Please review the items marked as **IMPORTANT** and **WARNING** above and let me know which choices you prefer. Once we have your confirmations, I will generate the required migrations, command, and UI code.*
