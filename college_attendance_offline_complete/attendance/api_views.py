from uuid import uuid4
from django.utils import timezone
from django.shortcuts import get_object_or_404
from django.db import transaction, models
from django.db.models import Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Attendance, FacultyProfile, Lecture, Student
from .serializers import BulkSerializer, RecordSerializer

def _faculty(request):
    try:
        return request.user.facultyprofile
    except FacultyProfile.DoesNotExist:
        return None

def _ensure_roster_attendance(lecture):
    students = list(Student.objects.filter(section__in=lecture.sections.all(), active=True))
    existing = set(Attendance.objects.filter(lecture=lecture).values_list("student_id", flat=True))
    missing = [Attendance(record_id=uuid4(), lecture=lecture, student=s, status="absent") for s in students if s.id not in existing]
    if missing:
        Attendance.objects.bulk_create(missing, ignore_conflicts=True)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def bootstrap(request):
    faculty = _faculty(request)
    if not faculty:
        return Response({"detail": "Faculty required"}, status=403)
    
    lecture_id = request.GET.get("lecture_id")
    qs = Lecture.objects.filter(faculty=faculty)
    if lecture_id:
        try:
            lid = int(lecture_id)
            lectures = qs.filter(Q(lecture_date=timezone.localdate()) | Q(id=lid)).prefetch_related("sections__students", "attendance")
        except (ValueError, TypeError):
            lectures = qs.filter(lecture_date=timezone.localdate()).prefetch_related("sections__students", "attendance")
    else:
        lectures = qs.filter(lecture_date=timezone.localdate()).prefetch_related("sections__students", "attendance")
    
    out = []
    for l in lectures:
        _ensure_roster_attendance(l)
        roster = {}
        for sec in l.sections.all():
            for stu in sec.students.filter(active=True):
                roster.setdefault(stu.roll_no, {
                    "enrollment_no": stu.roll_no,
                    "roll_no": stu.roll_no,
                    "name": stu.name,
                    "section": sec.name,
                })
        
        existing = {
            a.student.roll_no: {
                "record_id": str(a.record_id),
                "status": a.status,
                "timestamp": a.scan_time.isoformat() if a.scan_time else None
            } for a in l.attendance.all()
        }
        
        for roll, row in roster.items():
            row["attendance"] = existing.get(roll)
            
        sec_course = ", ".join(sorted(set(s.course for s in l.sections.all() if s.course))) or "EDP Phase 7"
        sec_names = ", ".join(sorted(s.name for s in l.sections.all()))
        out.append({
            "id": l.id,
            "lecture_key": l.lecture_key,
            "subject": l.subject,
            "course": sec_course,
            "section": sec_names,
            "sections": sorted(s.name for s in l.sections.all()),
            "date": l.lecture_date.isoformat(),
            "start_time": l.start_time.strftime("%H:%M"),
            "end_time": l.end_time.strftime("%H:%M"),
            "students": list(roster.values())
        })
    return Response({"today": timezone.localdate().isoformat(), "lectures": out})

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_attendance(request):
    faculty = _faculty(request)
    if not faculty:
        return Response({"detail": "Faculty required"}, status=403)
    lecture = get_object_or_404(Lecture, id=request.data.get("lecture_id"), faculty=faculty)
    ser = RecordSerializer(data={
        "record_id": request.data.get("record_id") or str(uuid4()),
        "student_roll": request.data.get("student_roll", ""),
        "status": request.data.get("status", "present"),
        "timestamp": request.data.get("timestamp")
    })
    ser.is_valid(raise_exception=True)
    roll = ser.validated_data["student_roll"].strip().upper()
    student = Student.objects.filter(enrollment_no=roll, section__in=lecture.sections.all(), active=True).first()
    if not student:
        return Response({"ok": False, "detail": "Student not in lecture roster", "student_roll": roll}, status=404)
    attendance, _ = Attendance.objects.get_or_create(
        lecture=lecture,
        student=student,
        defaults={
            "record_id": ser.validated_data.get("record_id", uuid4()),
            "status": ser.validated_data["status"],
            "scan_time": ser.validated_data.get("timestamp")
        }
    )
    attendance.status = ser.validated_data["status"]
    attendance.scan_time = ser.validated_data.get("timestamp")
    attendance.save(update_fields=["status", "scan_time", "updated_at"])
    return Response({
        "ok": True,
        "student_roll": student.enrollment_no,
        "student_name": student.name,
        "status": attendance.status,
        "record_id": str(attendance.record_id)
    })

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bulk_sync(request):
    faculty = _faculty(request)
    if not faculty:
        return Response({"detail": "Faculty required"}, status=403)
    ser = BulkSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    l = get_object_or_404(Lecture, id=ser.validated_data["lecture_id"], faculty=faculty)
    roster = {s.enrollment_no: s for s in Student.objects.filter(section__in=l.sections.all(), active=True)}
    accepted = 0
    rejected = []
    with transaction.atomic():
        for r in ser.validated_data["records"]:
            roll = r["student_roll"].strip().upper()
            s = roster.get(roll)
            if not s:
                rejected.append({"student_roll": roll, "reason": "Not in lecture roster"})
                continue
            
            a = Attendance.objects.filter(lecture=l, student=s).first()
            if a:
                a.status = r["status"]
                if r.get("timestamp"):
                    a.scan_time = r["timestamp"]
                a.save(update_fields=["status", "scan_time", "updated_at"])
            else:
                Attendance.objects.create(
                    record_id=r.get("record_id", uuid4()),
                    lecture=l,
                    student=s,
                    status=r["status"],
                    scan_time=r.get("timestamp")
                )
            accepted += 1
    return Response({"ok": True, "accepted": accepted, "rejected": rejected, "synced_at": timezone.now().isoformat()})

