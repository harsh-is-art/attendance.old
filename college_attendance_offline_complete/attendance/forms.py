from django import forms
from .models import Section,Student
class LoginForm(forms.Form):
    username=forms.CharField(max_length=150); password=forms.CharField(widget=forms.PasswordInput)
class StudentCreateForm(forms.Form):
    enrollment_no=forms.CharField(max_length=30); name=forms.CharField(max_length=150)
    section=forms.ModelChoiceField(queryset=Section.objects.none())
    password=forms.CharField(min_length=6,widget=forms.PasswordInput)
    def __init__(self,*a,**kw):
        super().__init__(*a,**kw); self.fields["section"].queryset=Section.objects.order_by("course","name","semester")
    def clean_enrollment_no(self):
        v=self.cleaned_data["enrollment_no"].strip().upper()
        if Student.objects.filter(enrollment_no=v).exists(): raise forms.ValidationError("Enrollment number already exists.")
        return v
