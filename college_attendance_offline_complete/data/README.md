# EDP Phase 7 Student Data

Source spreadsheets:
- BSC EDP Phase 7 Attendance List.xlsx
- MCA EDP Phase 7 Attendance List.xlsx
- BCA EDP Phase 7 Attendace List.xlsx

JSON files:
- `students.json` — master list plus course-wise and section-wise indexes
- `students_by_course.json` — grouped by course, then section
- `students_by_section.json` — grouped by course-section

`barcode_value` and `qr_value` are set to the student's enrollment number.
This is the value the scanner should send to the attendance lookup.

To import the students into SQLite:
`python manage.py import_edp_students`
