from django.shortcuts import render


def index(request):
    """Homepage — the detective whiteboard."""
    return render(request, 'library/index.html')
