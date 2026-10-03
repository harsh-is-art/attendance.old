from django.contrib import admin
from .models import FacultyProfile,Section,Student,Lecture,Attendance
admin.site.register([FacultyProfile,Section,Student,Lecture,Attendance])
