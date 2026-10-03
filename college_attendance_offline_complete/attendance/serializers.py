from rest_framework import serializers

class RecordSerializer(serializers.Serializer):
    record_id = serializers.UUIDField(required=False)
    student_roll = serializers.CharField(max_length=30)
    status = serializers.ChoiceField(choices=["present", "absent", "late"])
    timestamp = serializers.DateTimeField(required=False, allow_null=True)

class BulkSerializer(serializers.Serializer):
    lecture_id = serializers.IntegerField()
    records = RecordSerializer(many=True)
