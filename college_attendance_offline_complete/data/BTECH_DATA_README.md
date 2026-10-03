# B.Tech EDP Phase 7 Section Data

Added all 19 uploaded B.Tech section spreadsheets:

- btech A.xlsx -> Section A
- btech b.xlsx -> Section B
- btech c.xlsx -> Section C
- btech d.xlsx -> Section D
- btech E.xlsx -> Section E
- btech F.xlsx -> Section F
- btech G.xlsx -> Section G
- btech H.xlsx -> Section H
- btech I.xlsx -> Section I
- btech J.xlsx -> Section J
- btech K.xlsx -> Section K
- btech L.xlsx -> Section L
- btech M.xlsx -> Section M
- btech N.xlsx -> Section N
- btech P.xlsx -> Section P
- btech Q.xlsx -> Section Q
- btech R.xlsx -> Section R
- btech S.xlsx -> Section S
- btech T.xlsx -> Section T

Total unique B.Tech students: 1091
Duplicate records detected/removed: 31

JSON:
- static/data/btech_students.json
- static/data/btech_students_by_section.json
- static/data/btech_students_by_course.json
- static/data/students.json (complete BCA + BSC + MCA + B.Tech master)
- static/data/students_by_section.json
- static/data/students_by_course.json

Every student has:
- enrollment_no
- name
- course
- section
- barcode_value
- qr_value
- active

The barcode/QR value is the enrollment number, so scanner lookup can use it directly.
