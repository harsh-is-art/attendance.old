import json
from pathlib import Path
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from attendance.models import Section, Student

class Command(BaseCommand):
    help = "Import all EDP Phase 7 students from static/data/students.json"

    def handle(self, *args, **options):
        base = Path(__file__).resolve().parents[3]
        path = base / "static" / "data" / "students.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        User = get_user_model()

        created = updated = 0
        for item in data["students"]:
            section, _ = Section.objects.get_or_create(
                name=item["section"],
                course=item["course"],
                semester=1,
            )
            user, _ = User.objects.get_or_create(
                username=item["enrollment_no"],
                defaults={"first_name": item["name"]},
            )
            if user.first_name != item["name"]:
                user.first_name = item["name"]
                user.save()

            obj, was_created = Student.objects.update_or_create(
                enrollment_no=item["enrollment_no"],
                defaults={
                    "user": user,
                    "name": item["name"],
                    "section": section,
                    "active": item.get("active", True),
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(self.style.SUCCESS(
            f"EDP students imported: {created} created, {updated} updated, "
            f"{data['total_students']} total."
        ))
