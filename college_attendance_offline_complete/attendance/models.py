from django.conf import settings
from django.db import models

class FacultyProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    employee_id = models.CharField(max_length=30, unique=True)
    department = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return f"{self.user.get_full_name() or self.user.username} ({self.employee_id})"

class Section(models.Model):
    name = models.CharField(max_length=50)
    course = models.CharField(max_length=100)
    semester = models.PositiveSmallIntegerField(default=1)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["name", "course", "semester"], name="unique_section")]

    def __str__(self):
        return f"{self.course} - Section {self.name} (Sem {self.semester})"

class Student(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="student_profile")
    enrollment_no = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=150)
    section = models.ForeignKey(Section, on_delete=models.PROTECT, related_name="students")
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def roll_no(self):
        return self.enrollment_no

    def __str__(self):
        return f"{self.name} ({self.enrollment_no})"

class Lecture(models.Model):
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name="lectures")
    sections = models.ManyToManyField(Section, related_name="lectures")
    subject = models.CharField(max_length=120)
    lecture_date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ["start_time"]
        constraints = [models.UniqueConstraint(fields=["faculty", "subject", "lecture_date", "start_time", "end_time"], name="unique_lecture")]

    @property
    def section(self):
        return self.sections.first()

    @property
    def is_combined(self):
        return self.sections.count() > 1

    @property
    def sections_names(self):
        return ", ".join(sorted(s.name for s in self.sections.all()))

    @property
    def sections_display(self):
        secs = sorted(s.name for s in self.sections.all())
        if not secs:
            return ""
        if len(secs) == 1:
            return f"Section {secs[0]}"
        return f"Sections {', '.join(secs)} (Combined)"

    @property
    def lecture_key(self):
        clean = lambda t: str(t).replace(":", "").lstrip("0") or "0"
        secs = "_".join(sorted(s.name for s in self.sections.all()))
        return f"lec_{clean(self.start_time)}_{clean(self.end_time)}_{secs}"

    def __str__(self):
        return f"{self.subject} - {self.lecture_date} {self.start_time}-{self.end_time} [{self.lecture_key}]"

class Attendance(models.Model):
    record_id = models.UUIDField(primary_key=True)
    lecture = models.ForeignKey(Lecture, on_delete=models.CASCADE, related_name="attendance")
    student = models.ForeignKey(Student, on_delete=models.PROTECT, related_name="attendance")
    status = models.CharField(max_length=10, choices=[("present", "Present"), ("absent", "Absent")])
    scan_time = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["lecture", "student"], name="unique_attendance")]
        indexes = [models.Index(fields=["lecture", "student"]), models.Index(fields=["student", "status"])]

    def __str__(self):
        return f"{self.student.enrollment_no} - {self.lecture} ({self.status})"

