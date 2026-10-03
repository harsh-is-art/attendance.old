# attendance/migrations/0003_add_harsh_student.py
"""Migration to add a single student record: Harsh Grover (roll 25bcon2637).
This migration assumes the core models (User, Student) already exist – it can be
run after the initial demo data migration or on a fresh database.
"""

from django.db import migrations


def add_harsh_student(apps, schema_editor):
    # Get the historic models via the apps registry
    User = apps.get_model("auth", "User")
    Student = apps.get_model("attendance", "Student")
    Section = apps.get_model("attendance", "Section")

    # Create a dummy Section for the student (required non‑null FK)
    demo_section = Section.objects.create(
        name="Demo Section",
        course="Demo Course",
        semester=1,
    )

    # Create a Django auth user for the student (username = roll number)
    harsh_user = User.objects.create_user(
        username="25bcon2637",
        email="harsh.grover@example.com",
        first_name="Harsh",
        last_name="Grover",
        password="student123",
    )

    # Create the Student, linking to the demo section
    Student.objects.create(
        user=harsh_user,
        enrollment_no="25bcon2637",
        name="Harsh Grover",
        section=demo_section,
        active=True,
    )


def remove_harsh_student(apps, schema_editor):
    User = apps.get_model("auth", "User")
    Student = apps.get_model("attendance", "Student")

    # Delete the Student first (it has a FK to User)
    Student.objects.filter(enrollment_no="25bcon2637").delete()
    # Then delete the auth user
    User.objects.filter(username="25bcon2637").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("attendance", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(add_harsh_student, reverse_code=remove_harsh_student),
    ]
