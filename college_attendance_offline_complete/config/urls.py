import os
from django.conf import settings
from django.urls import include, path, re_path
from django.views.static import serve


def serve_static(request, path):
    if settings.STATIC_ROOT and os.path.exists(
        os.path.join(settings.STATIC_ROOT, path)
    ):
        return serve(request, path, document_root=settings.STATIC_ROOT)
    if settings.STATICFILES_DIRS and os.path.exists(
        os.path.join(settings.STATICFILES_DIRS[0], path)
    ):
        return serve(request, path, document_root=settings.STATICFILES_DIRS[0])
    return serve(request, path, document_root=settings.STATIC_ROOT)


urlpatterns = [
    path("", include("attendance.urls")),
    re_path(r"^static/(?P<path>.*)$", serve_static),
]

