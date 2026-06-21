from django.urls import path
from . import views, api

urlpatterns = [
    # Frontend pages
    path('', views.index, name='index'),

    # API — cards (GET = list, POST = create)
    path('api/cards/', api.cards_handler, name='api_cards'),

    # API — connections
    path('api/connections/', api.create_manual_connection, name='api_manual_connection'),
    path('api/connections/confirm/', api.confirm_connection, name='api_confirm_connection'),
]
