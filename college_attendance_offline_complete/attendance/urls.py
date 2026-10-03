from django.urls import path
from . import views, api_views

urlpatterns = [
    path("", views.dashboard, name="home"),
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("faculty/students/", views.students_page, name="students"),
    path("faculty/timetable/", views.timetable_page, name="timetable"),
    path("faculty/timetable/<int:entry_index>/course/", views.timetable_course_page, name="timetable_course"),
    path("faculty/timetable/<int:entry_index>/", views.timetable_entry_page, name="timetable_entry"),
    path("faculty/timetable/<int:entry_index>/<str:section_name>/start/", views.timetable_start_attendance, name="timetable_start_attendance"),
    path("faculty/students/add/", views.student_add, name="student_add"),
    path("faculty/students/<int:student_id>/delete/", views.student_delete, name="student_delete"),
    path("faculty/attendance/", views.attendance_overview, name="attendance_overview"),
    path("faculty/attendance/<int:lecture_id>/", views.attendance_page, name="attendance_page"),
    path("api/bootstrap/", api_views.bootstrap, name="api_bootstrap"),
    path("api/attendance/mark/", api_views.mark_attendance, name="api_mark_attendance"),
    path("api/attendance/bulk-sync/", api_views.bulk_sync, name="api_bulk_sync"),
    path("faculty/attendance/export/", views.attendance_export, name="attendance_export"),
    path("sw.js", views.service_worker_view, name="service_worker"),
]

