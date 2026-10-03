import json
import re
from datetime import date, time, datetime
from pathlib import Path
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from attendance.models import FacultyProfile, Section, Student, Lecture, Attendance
from attendance.views import _ensure_section_and_students, _normalize_course

class Command(BaseCommand):
    help = "Seed demo data with real EDP Phase 7 timetable lectures and student rosters"

    def handle(self, *args, **kwargs):
        U = get_user_model()
        fu, _ = U.objects.get_or_create(username="vanisha", defaults={"first_name": "Vanisha bhardwaj"})
        fu.set_password("jufac908")
        fu.save()
        fp, _ = FacultyProfile.objects.get_or_create(user=fu, defaults={"employee_id": "FAC001", "department": "Computer Science"})

        # Ensure all EDP Phase 7 students are imported into SQLite
        from django.core.management import call_command
        call_command('import_edp_students')

        # Remove all dummy lectures and students that are not part of EDP Phase 7
        Lecture.objects.filter(subject__in=["Data Structures", "Database Management Systems"]).delete()
        Student.objects.filter(enrollment_no__startswith="25BCON").delete()
        Section.objects.filter(name="O", course="BCON").delete()
        U.objects.filter(username__startswith="25BCON").delete()

        # Load timetable entries
        base_dir = Path(__file__).resolve().parents[3] / "static" / "data"
        timetable_path = base_dir / "timetable.json"

        entries = []
        if timetable_path.exists():
            try:
                payload = json.loads(timetable_path.read_text(encoding="utf-8"))
                entries = payload if isinstance(payload, list) else payload.get("entries", [])
            except Exception:
                entries = []

        today_str = date.today().isoformat()
        today_entries = [e for e in entries if e.get("date") == today_str]
        selected_entries = today_entries if today_entries else entries[:2]

        demo_student_roll = None
        created_count = 0

        for entry in selected_entries:
            course = _normalize_course(entry.get("course"))
            raw_groups = [t.strip().upper() for t in str(entry.get("section_group") or "L").split("+")]

            section = None
            roster = []
            for token in raw_groups:
                section, roster = _ensure_section_and_students(course, token)
                if section and roster:
                    break

            if not section or not roster:
                section, roster = _ensure_section_and_students("B.Tech", "L")

            if roster and not demo_student_roll:
                demo_student_roll = roster[0].get("enrollment_no")

            time_text = str(entry.get("time_slot") or "11:20 - 12:50").strip()
            parts = re.split(r"\s*-\s*", time_text)
            try:
                st = datetime.strptime(parts[0].strip(), "%H:%M").time()
                et = datetime.strptime(parts[1].strip(), "%H:%M").time()
            except Exception:
                st, et = time(11, 20), time(12, 50)

            subject = str(entry.get("module") or "EDP Phase 7 Session").strip() or "EDP Phase 7 Session"
            lec, was_created = Lecture.objects.get_or_create(
                faculty=fp,
                subject=subject,
                lecture_date=date.today(),
                start_time=st,
                end_time=et,
            )
            if section:
                lec.sections.add(section)
            created_count += 1

        if demo_student_roll:
            su = U.objects.filter(username=demo_student_roll).first()
            if su:
                su.set_password("Student@12345")
                su.save()

        self.stdout.write(self.style.SUCCESS(f"EDP Phase 7 demo data ready in SQLite ({created_count} lectures)."))
        self.stdout.write("Faculty: vanisha / jufac908")
        if demo_student_roll:
            self.stdout.write(f"Student: {demo_student_roll} / Student@12345")
