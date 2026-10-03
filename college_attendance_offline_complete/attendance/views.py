from django import shortcuts
from django.contrib import messages
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.decorators import login_required
from django.db import transaction, IntegrityError
from django.shortcuts import get_object_or_404, redirect, render
from django.http import HttpResponse, Http404
import json
import re
from datetime import datetime
from pathlib import Path
from openpyxl import Workbook
from .forms import LoginForm, StudentCreateForm
from .models import Attendance, FacultyProfile, Lecture, Section, Student


def service_worker_view(request):
    """Serve sw.js from root so the service worker gets full site scope."""
    sw_path = Path(__file__).resolve().parent.parent / "static" / "sw.js"
    if not sw_path.exists():
        raise Http404("sw.js file not found")
    response = HttpResponse(sw_path.read_text(encoding="utf-8"), content_type="application/javascript")
    response["Service-Worker-Allowed"] = "/"
    return response


def is_faculty(u):
    """Treat any staff user or user with FacultyProfile as faculty."""
    return u.is_staff or hasattr(u, "facultyprofile")


def faculty_required(view_func):
    """Decorator to ensure the user is a faculty member."""
    @login_required
    def _wrapped_view(request, *args, **kwargs):
        if not is_faculty(request.user):
            return redirect("dashboard")
        return view_func(request, *args, **kwargs)
    return _wrapped_view


def login_view(request):
    if request.user.is_authenticated:
        return redirect("dashboard")
    f = LoginForm(request.POST or None)
    if request.method == "POST" and f.is_valid():
        u = authenticate(
            request,
            username=f.cleaned_data["username"].strip(),
            password=f.cleaned_data["password"]
        )
        if u:
            login(request, u)
            return redirect("dashboard")
        f.add_error(None, "Invalid username or password.")
    return render(request, "login.html", {"form": f})


@login_required
def logout_view(request):
    logout(request)
    return redirect("login")


@login_required
def dashboard(request):
    if is_faculty(request.user):
        return render(request, "faculty/dashboard.html")
    if hasattr(request.user, "student_profile"):
        s = request.user.student_profile
        qs = Attendance.objects.filter(student=s).select_related("lecture").order_by("-lecture__lecture_date", "-lecture__start_time")
        total = qs.count()
        present = qs.filter(status="present").count()
        return render(request, "student/dashboard.html", {
            "student": s,
            "records": qs,
            "total": total,
            "present": present,
            "absent": total - present,
            "percentage": round(present * 100 / total, 1) if total else 0
        })
    logout(request)
    return redirect("login")


@faculty_required
def attendance_page(request, lecture_id):
    lec = get_object_or_404(Lecture, id=lecture_id, faculty=request.user.facultyprofile)
    from .api_views import _ensure_roster_attendance
    _ensure_roster_attendance(lec)

    roster = []
    att_map = {a.student.enrollment_no: a for a in lec.attendance.all()}
    for sec in lec.sections.all().order_by("name"):
        for s in sec.students.filter(active=True).order_by("enrollment_no"):
            a = att_map.get(s.enrollment_no)
            roster.append({
                "enrollment_no": s.enrollment_no,
                "roll_no": s.enrollment_no,
                "name": s.name,
                "section": sec.name,
                "attendance": {
                    "record_id": str(a.record_id) if a else None,
                    "status": a.status if a else "absent",
                    "timestamp": a.scan_time.isoformat() if a and a.scan_time else None,
                } if a else None,
            })

    return render(request, "faculty/attendance.html", {
        "lecture": lec,
        "preloaded_roster_json": json.dumps(roster),
    })


@faculty_required
def students_page(request):
    students = Student.objects.filter(active=True).select_related("section").order_by("enrollment_no")
    return render(request, "faculty/students.html", {"students": students})


@faculty_required
def student_add(request):
    f = StudentCreateForm(request.POST or None)
    if request.method == "POST" and f.is_valid():
        d = f.cleaned_data
        User = get_user_model()
        try:
            with transaction.atomic():
                u = User.objects.create_user(
                    username=d["enrollment_no"],
                    password=d["password"],
                    first_name=d["name"]
                )
                Student.objects.create(
                    user=u,
                    enrollment_no=d["enrollment_no"],
                    name=d["name"],
                    section=d["section"]
                )
            messages.success(request, "Student registered successfully.")
            return redirect("students")
        except IntegrityError:
            f.add_error(None, "Could not create student.")
    return render(request, "faculty/student_form.html", {"form": f})


@faculty_required
def student_delete(request, student_id):
    s = get_object_or_404(Student, id=student_id)
    if request.method == "POST":
        s.active = False
        s.save(update_fields=["active"])
        messages.success(request, f"{s.enrollment_no} deactivated.")
        return redirect("students")
    return render(request, "faculty/student_delete.html", {"student": s})


@faculty_required
def timetable_page(request):
    return render(request, "faculty/timetable.html")


def _timetable_payload():
    path = Path(__file__).resolve().parent.parent / "static" / "data" / "timetable.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        raise Http404("Timetable data is unavailable")
    entries = payload if isinstance(payload, list) else payload.get("entries", [])
    if not isinstance(entries, list):
        raise Http404("Invalid timetable data")
    return entries


def _get_timetable_entry(entry_index):
    entries = _timetable_payload()
    for e in entries:
        if isinstance(e, dict) and e.get("id") == entry_index:
            return e
    try:
        return entries[entry_index]
    except (IndexError, TypeError):
        raise Http404("Timetable entry not found")


def _normalize_course(raw_course):
    value = str(raw_course or "").strip()
    if not value or value.lower() in ("none", "null"):
        return "B.Tech"
    return {
        "BTech": "B.Tech",
        "B.Tech": "B.Tech",
        "BTECH": "B.Tech",
        "BCA": "BCA",
        "BSC": "BSC",
        "BSc": "BSC",
        "B.Sc": "BSC",
        "MCA": "MCA",
    }.get(value, value)



def _json_sections_for_course(course):
    """Search primary and fallback JSON files for matching sections across all courses."""
    base_dir = Path(__file__).resolve().parent.parent / "static" / "data"
    files = ["students_by_section.json", "btech_students_by_section.json"]
    
    target_course = _normalize_course(course).strip().upper()
    sections = {}
    for filename in files:
        path = base_dir / filename
        if not path.exists():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            file_sections = payload.get("sections", {}) if isinstance(payload, dict) else {}
            for key, value in file_sections.items():
                sec_course = _normalize_course(value.get("course", "")).strip().upper()
                if sec_course == target_course:
                    sections[str(key)] = value
        except (json.JSONDecodeError, AttributeError):
            continue

    return sections


def _section_roster(course, section_name):
    """Return the JSON roster for one exact course/section."""
    sections = _json_sections_for_course(course)
    wanted = section_name.strip().upper()
    for value in sections.values():
        if str(value.get("section", "")).strip().upper() == wanted:
            return value.get("students", []) or []

    return []



def _ensure_section_and_students(course, section_name):
    """Sync one JSON section into SQLite so attendance can be stored normally."""
    roster = _section_roster(course, section_name)
    if not roster:
        return None, []

    section, _ = Section.objects.get_or_create(
        course=course,
        name=section_name.strip().upper(),
        semester=1,
    )
    
    # If students already imported for this section, avoid redundant write locks
    existing_count = Student.objects.filter(section=section, active=True).count()
    if existing_count >= len(roster) and existing_count > 0:
        return section, roster

    User = get_user_model()
    with transaction.atomic():
        for item in roster:
            enrollment = str(item.get("enrollment_no") or "").strip().upper()
            name = str(item.get("name") or "").strip()
            if not enrollment or not name:
                continue
            user, _ = User.objects.get_or_create(
                username=enrollment,
                defaults={"first_name": name},
            )
            if user.first_name != name:
                user.first_name = name
                user.save(update_fields=["first_name"])

            Student.objects.update_or_create(
                enrollment_no=enrollment,
                defaults={
                    "user": user,
                    "name": name,
                    "section": section,
                    "active": bool(item.get("active", True)),
                },
            )
    return section, roster


@faculty_required
def timetable_course_page(request, entry_index):
    """First selection step: show the course belonging to the selected timetable row."""
    entry = _get_timetable_entry(entry_index)
    course = _normalize_course(entry.get("course"))
    if not course:
        return render(request, "faculty/timetable_course.html", {
            "entry": entry,
            "entry_index": entry_index,
            "course": "",
            "course_available": False,
        })
    return render(request, "faculty/timetable_course.html", {
        "entry": entry,
        "entry_index": entry_index,
        "course": course,
        "course_available": True,
    })


@faculty_required
def timetable_entry_page(request, entry_index):
    """Second selection step: show every section in the timetable group separately, plus combined option."""
    entry = _get_timetable_entry(entry_index)
    course = _normalize_course(entry.get("course"))
    group = str(entry.get("section_group") or "").strip()
    tokens = [x.strip().upper() for x in re.split(r"\+|,", group) if x.strip()]

    json_sections = _json_sections_for_course(course)
    available = []
    for token in tokens:
        roster = _section_roster(course, token)
        key = next((k for k, v in json_sections.items() if str(v.get("section", "")).strip().upper() == token), None)
        db_count = Student.objects.filter(section__course=course, section__name=token, active=True).count()
        count = len(roster) if roster else db_count
        available.append({
            "name": token,
            "course": course,
            "student_count": count,
            "available": bool(roster or db_count),
            "json_key": key or "",
        })

    active_secs = [x for x in available if x["available"]]
    total_combined_students = sum(x["student_count"] for x in active_secs)

    return render(request, "faculty/timetable_entry.html", {
        "entry": entry,
        "entry_index": entry_index,
        "course": course,
        "available_sections": available,
        "has_sections": any(x["available"] for x in available),
        "is_multiple_sections": len(active_secs) > 1,
        "total_combined_students": total_combined_students,
    })


@faculty_required
def timetable_start_attendance(request, entry_index, section_name):
    """Create/find the SQLite Lecture for one section or all combined sections and open attendance."""
    entry = _get_timetable_entry(entry_index)
    course = _normalize_course(entry.get("course"))
    section_name_clean = section_name.strip().upper()

    sections_to_add = []
    if section_name_clean in ("ALL", "COMBINED"):
        group = str(entry.get("section_group") or "").strip()
        tokens = [x.strip().upper() for x in re.split(r"\+|,", group) if x.strip()]
        for token in tokens:
            sec, roster = _ensure_section_and_students(course, token)
            if sec:
                sections_to_add.append(sec)
        if not sections_to_add:
            return render(request, "faculty/section_unavailable.html", {
                "entry": entry,
                "entry_index": entry_index,
                "course": course,
                "section_name": group,
            }, status=200)
    else:
        sec, roster = _ensure_section_and_students(course, section_name_clean)
        if sec is None or not roster:
            return render(request, "faculty/section_unavailable.html", {
                "entry": entry,
                "entry_index": entry_index,
                "course": course,
                "section_name": section_name_clean,
            }, status=200)
        sections_to_add.append(sec)

    date_value = str(entry.get("date") or "").strip()
    time_text = str(entry.get("time_slot") or "").strip()
    try:
        if date_value:
            lecture_date = datetime.strptime(date_value, "%Y-%m-%d").date()
        else:
            lecture_date = date.today()
    except (ValueError, TypeError):
        lecture_date = date.today()

    try:
        parts = re.split(r"\s*-\s*", time_text)
        if len(parts) == 2:
            st_raw = parts[0].strip().replace(".", ":")
            et_raw = parts[1].strip().replace(".", ":")
            start_time = datetime.strptime(st_raw, "%H:%M").time()
            end_time = datetime.strptime(et_raw, "%H:%M").time()
        else:
            start_time, end_time = time(11, 20), time(12, 50)
    except Exception:
        start_time, end_time = time(11, 20), time(12, 50)

    subject = str(entry.get("module") or "Class Lecture").strip() or "Class Lecture"
    with transaction.atomic():
        lecture, _ = Lecture.objects.get_or_create(
            faculty=request.user.facultyprofile,
            subject=subject,
            lecture_date=lecture_date,
            start_time=start_time,
            end_time=end_time,
        )
        for sec in sections_to_add:
            lecture.sections.add(sec)
    return redirect("attendance_page", lecture_id=lecture.id)


@faculty_required
def attendance_overview(request):
    lectures = Lecture.objects.filter(faculty=request.user.facultyprofile).prefetch_related("sections").order_by("-lecture_date", "-start_time")
    return render(request, "faculty/attendance_overview.html", {"lectures": lectures})


@faculty_required
def attendance_export(request):
    import urllib.parse
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    faculty = request.user.facultyprofile
    lecture_id = request.GET.get("lecture")
    lectures = Lecture.objects.filter(faculty=faculty).prefetch_related("sections")
    if lecture_id:
        lectures = lectures.filter(id=lecture_id)

    wb = Workbook()
    ws = wb.active

    single_lecture = lectures.first() if (lecture_id or lectures.count() == 1) else None
    if single_lecture:
        secs = sorted([s.name for s in single_lecture.sections.all()])
        if len(secs) > 1:
            sec_name_part = "+".join(secs)
        elif len(secs) == 1:
            sec_name_part = f"Section {secs[0]}"
        else:
            sec_name_part = "Attendance"

        date_part = single_lecture.lecture_date.strftime("%Y-%m-%d")
        day_part = single_lecture.lecture_date.strftime("%A")
        time_part = f"{single_lecture.start_time.strftime('%H-%M')} to {single_lecture.end_time.strftime('%H-%M')}"

        # section name , date , day , time (e.g. A+B+C, 2026-08-21, Friday, 02-00 to 03-40.xlsx)
        filename = f"{sec_name_part}, {date_part}, {day_part}, {time_part}.xlsx"
        sheet_title = f"{sec_name_part}, {date_part}"
    else:
        now = datetime.now()
        date_part = now.strftime("%Y-%m-%d")
        day_part = now.strftime("%A")
        time_part = now.strftime("%H-%M")
        filename = f"All Sections, {date_part}, {day_part}, {time_part}.xlsx"
        sheet_title = "Attendance"

    # Excel sheet title max 31 chars and no invalid chars
    clean_sheet_title = re.sub(r'[:\\/?*\[\]]', '-', sheet_title)[:31]
    ws.title = clean_sheet_title or "Attendance"

    headers = ["Date", "Day", "Time", "Course", "Section", "Subject", "Roll No", "Student Name", "Status", "Scan Time"]
    ws.append(headers)

    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="172033", end_color="172033", fill_type="solid")
    center_align = Alignment(horizontal="center", vertical="center")
    left_align = Alignment(horizontal="left", vertical="center")
    thin_border = Border(
        left=Side(style="thin", color="E2E8F0"),
        right=Side(style="thin", color="E2E8F0"),
        top=Side(style="thin", color="E2E8F0"),
        bottom=Side(style="thin", color="E2E8F0"),
    )

    for col_num in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_num)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center_align

    def natural_sort_key(val):
        return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', str(val or ''))]

    for lecture in lectures.order_by("-lecture_date", "-start_time"):
        # Section-wise sorting: order strictly section-wise first, then natural order of roll no
        students = list(
            Student.objects
            .filter(section__in=lecture.sections.all(), active=True)
            .select_related("section")
        )
        students.sort(key=lambda s: (s.section.name if s.section else "", natural_sort_key(s.enrollment_no)))

        att = {a.student_id: a for a in Attendance.objects.filter(lecture=lecture)}
        for student in students:
            a = att.get(student.id)
            sec = student.section or lecture.section
            status_text = (a.status if a else "absent").upper()
            row = [
                lecture.lecture_date.isoformat(),
                lecture.lecture_date.strftime("%A"),
                f"{lecture.start_time.strftime('%H:%M')} - {lecture.end_time.strftime('%H:%M')}",
                sec.course if sec else "",
                sec.name if sec else "",
                lecture.subject,
                student.enrollment_no,
                student.name,
                status_text,
                a.scan_time.strftime("%Y-%m-%d %H:%M:%S") if a and a.scan_time else ""
            ]
            ws.append(row)
            row_idx = ws.max_row
            for c_idx in range(1, len(row) + 1):
                c = ws.cell(row=row_idx, column=c_idx)
                c.border = thin_border
                if c_idx in (1, 2, 3, 4, 5, 7, 9, 10):
                    c.alignment = center_align
                else:
                    c.alignment = left_align
                if c_idx == 9:
                    if status_text == "PRESENT":
                        c.font = Font(name="Calibri", size=11, bold=True, color="166534")
                    else:
                        c.font = Font(name="Calibri", size=11, bold=True, color="991B1B")

    for col in ws.columns:
        ws.column_dimensions[col[0].column_letter].width = min(max(len(str(c.value or "")) for c in col) + 4, 38)

    response = HttpResponse(content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    clean_filename = re.sub(r'[/\\?%*:|"<>!]', '', filename).strip()
    encoded_filename = urllib.parse.quote(clean_filename)
    response["Content-Disposition"] = f'attachment; filename="{clean_filename}"; filename*=UTF-8\'\'{encoded_filename}'
    wb.save(response)
    return response

