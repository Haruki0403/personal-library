"""
API 视图 — 卡片 CRUD + 图谱数据 + 自动连线逻辑
"""
import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_http_methods, require_POST
from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from .models import (
    Tag, BookCard, MusicCard, FilmCard, GameCard, WritingCard, Connection
)

# Card type → model mapping
CARD_MODELS = {
    'book': BookCard,
    'music': MusicCard,
    'film': FilmCard,
    'game': GameCard,
    'writing': WritingCard,
}

# Fields shared across all card types
SHARED_FIELDS = {
    'book': ['title', 'author', 'status', 'notes'],
    'music': ['title', 'artist', 'genre', 'year', 'notes'],
    'film': ['title', 'director', 'year', 'rating', 'notes'],
    'game': ['title', 'platform', 'genre', 'status', 'notes'],
    'writing': ['title', 'genre', 'body'],
}

# Fields to scan for creator overlap (author/artist/director)
CREATOR_FIELDS = {
    'book': 'author',
    'music': 'artist',
    'film': 'director',
    'game': None,
    'writing': None,
}


def _card_to_dict(card):
    """Convert any card instance to a JSON-serializable dict."""
    ct = ContentType.objects.get_for_model(card)
    base = {
        'id': f'{ct.model}-{card.pk}',
        'db_id': card.pk,
        'type': ct.model.replace('card', ''),
        'title': getattr(card, 'title', ''),
        'created_at': card.created_at.isoformat(),
        'updated_at': card.updated_at.isoformat(),
        'is_published': card.is_published,
        'tags': list(card.tags.values_list('name', flat=True)),
    }

    # Add type-specific fields
    fields = SHARED_FIELDS.get(base['type'], [])
    for field in fields:
        val = getattr(card, field, None)
        if val is not None:
            if field in ('notes', 'body'):
                base[field] = val  # Markdown text, keep as-is
            elif hasattr(val, 'isoformat'):
                base[field] = val.isoformat()
            else:
                base[field] = str(val) if val else ''

    # Add status display name if applicable
    if hasattr(card, 'get_status_display'):
        base['status_display'] = card.get_status_display()

    return base


def _connection_to_dict(conn):
    """Convert a Connection instance to JSON."""
    source = conn.source
    target = conn.target
    if not source or not target:
        return None

    source_ct = ContentType.objects.get_for_model(source)
    target_ct = ContentType.objects.get_for_model(target)
    return {
        'id': conn.pk,
        'source_id': f'{source_ct.model}-{source.pk}',
        'target_id': f'{target_ct.model}-{target.pk}',
        'reason': conn.reason,
        'connection_type': conn.connection_type,
        'is_confirmed': conn.is_confirmed,
    }


@csrf_exempt
@ensure_csrf_cookie
def cards_handler(request):
    """
    /api/cards/ — dispatches on HTTP method.
    GET → list all cards + connections (public)
    POST → create new card (login required)
    PUT → update existing card (login required)
    """
    if request.method == 'GET':
        return list_cards(request)
    elif request.method == 'POST':
        if not request.user.is_authenticated:
            return JsonResponse({'error': '请先登录'}, status=401)
        return create_card(request)
    elif request.method == 'PUT':
        if not request.user.is_authenticated:
            return JsonResponse({'error': '请先登录'}, status=401)
        return update_card(request)
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@require_http_methods(['GET'])
def list_cards(request):
    """
    GET /api/cards/ — return all published cards + connections for graph rendering.
    Supports ?type=book&tag=存在主义 for filtering.
    """
    card_type = request.GET.get('type')
    tag_filter = request.GET.get('tag')

    cards = []
    for ctype, Model in CARD_MODELS.items():
        if card_type and ctype != card_type:
            continue
        qs = Model.objects.filter(is_published=True).prefetch_related('tags')
        if tag_filter:
            qs = qs.filter(tags__name=tag_filter)
        for card in qs:
            cards.append(_card_to_dict(card))

    # Get all connections involving these cards
    connections = []
    all_conns = Connection.objects.select_related(
        'source_content_type', 'target_content_type'
    ).filter(is_confirmed=True)
    for conn in all_conns:
        d = _connection_to_dict(conn)
        if d:
            connections.append(d)

    return JsonResponse({
        'cards': cards,
        'connections': connections,
        'total': len(cards),
    })


@csrf_exempt
@require_http_methods(['POST'])
def create_card(request):
    """
    POST /api/cards/ — create a new card. Body: JSON with type, title, tags, etc.
    Returns the created card + suggested connections.
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': '无效的 JSON'}, status=400)

    card_type = data.get('type')
    if card_type not in CARD_MODELS:
        return JsonResponse({'error': f'无效的卡片类型: {card_type}'}, status=400)

    title = data.get('title', '').strip()
    if not title:
        return JsonResponse({'error': '标题不能为空'}, status=400)

    Model = CARD_MODELS[card_type]
    fields = SHARED_FIELDS[card_type]

    # Build card instance
    card = Model(title=title, is_published=True)
    for field in fields:
        if field == 'title':
            continue
        val = data.get(field)
        if val is not None and val != '':
            setattr(card, field, val)

    card.save()

    # Handle tags — create new ones if needed
    tag_names = data.get('tags', [])
    if tag_names:
        for tname in tag_names:
            tag, _ = Tag.objects.get_or_create(name=tname)
            card.tags.add(tag)

    # Auto-connect logic
    suggestions = auto_connect(card)

    return JsonResponse({
        'card': _card_to_dict(card),
        'suggested_connections': suggestions,
    })


def update_card(request):
    """
    PUT /api/cards/ — update an existing card.
    Body: JSON with card_id, type, and fields to update.
    """
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': '无效的 JSON'}, status=400)

    card_id = data.get('card_id')  # e.g. "bookcard-3"
    card = _resolve_card(card_id)
    if not card:
        return JsonResponse({'error': '卡片不存在'}, status=404)

    card_type = data.get('type', card.card_type.replace('card', ''))
    fields = SHARED_FIELDS.get(card_type, [])

    for field in fields:
        if field == 'title':
            continue
        if field in data:
            setattr(card, field, data[field])

    # Update title
    if 'title' in data:
        card.title = data['title']

    # Update tags
    if 'tags' in data:
        card.tags.clear()
        for tname in data['tags']:
            tag, _ = Tag.objects.get_or_create(name=tname)
            card.tags.add(tag)

    card.save()
    return JsonResponse({'card': _card_to_dict(card)})


@csrf_exempt
@require_http_methods(['POST'])
def confirm_connection(request):
    """POST /api/connections/confirm/ — confirm or reject a suggested connection."""
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': '无效的 JSON'}, status=400)

    conn_id = data.get('connection_id')
    action = data.get('action', 'confirm')  # 'confirm' or 'reject'

    try:
        conn = Connection.objects.get(pk=conn_id)
    except Connection.DoesNotExist:
        return JsonResponse({'error': '连线不存在'}, status=404)

    if action == 'confirm':
        conn.is_confirmed = True
        conn.save()
        return JsonResponse({'status': 'confirmed'})
    else:
        conn.delete()
        return JsonResponse({'status': 'deleted'})


@csrf_exempt
@require_http_methods(['POST'])
def create_manual_connection(request):
    """POST /api/connections/ — create a manual connection between two cards."""
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': '无效的 JSON'}, status=400)

    source_id = data.get('source_id')  # e.g. "bookcard-3"
    target_id = data.get('target_id')  # e.g. "filmcard-7"
    reason = data.get('reason', '')

    source = _resolve_card(source_id)
    target = _resolve_card(target_id)
    if not source or not target:
        return JsonResponse({'error': '卡片不存在'}, status=404)

    conn = Connection.objects.create(
        source=source,
        target=target,
        reason=reason,
        connection_type='manual',
        is_confirmed=True,
    )
    return JsonResponse(_connection_to_dict(conn))


def _resolve_card(card_id):
    """Resolve a string like 'bookcard-3' to a card instance."""
    try:
        type_str, pk = card_id.rsplit('-', 1)
    except (ValueError, AttributeError):
        return None
    model_name = type_str  # e.g. 'bookcard'
    Model = CARD_MODELS.get(model_name.replace('card', ''))
    if not Model:
        return None
    try:
        return Model.objects.get(pk=int(pk))
    except (Model.DoesNotExist, ValueError):
        return None


def auto_connect(new_card):
    """
    Scan all existing cards for connections to the new card.
    Returns a list of suggested Connection dicts.
    """
    suggestions = []
    new_ct = ContentType.objects.get_for_model(new_card)
    new_type = new_card.card_type.replace('card', '')
    new_tags = set(new_card.tags.values_list('name', flat=True))
    new_title_lower = getattr(new_card, 'title', '').lower()
    new_notes = getattr(new_card, 'notes', None) or getattr(new_card, 'body', None) or ''
    new_creator = None
    creator_field = CREATOR_FIELDS.get(new_type)
    if creator_field:
        new_creator = (getattr(new_card, creator_field, '') or '').strip().lower()

    # Iterate all other card types
    for ctype, Model in CARD_MODELS.items():
        other_ct = ContentType.objects.get_for_model(Model)
        others = Model.objects.filter(is_published=True).prefetch_related('tags')

        for other in others:
            if other.pk == new_card.pk and ctype == new_type:
                continue  # Skip self

            reasons = []
            other_tags = set(other.tags.values_list('name', flat=True))
            other_notes = getattr(other, 'notes', None) or getattr(other, 'body', None) or ''

            # Tag overlap
            shared_tags = new_tags & other_tags
            if shared_tags:
                reasons.append(f'同标签：{"、".join(shared_tags)}')

            # Same creator
            if new_creator:
                other_creator_field = CREATOR_FIELDS.get(ctype)
                if other_creator_field:
                    other_creator = (getattr(other, other_creator_field, '') or '').strip().lower()
                    if new_creator and other_creator and new_creator == other_creator:
                        creator_labels = {
                            'book': f'同作者：{other_creator}',
                            'music': f'同艺术家：{other_creator}',
                            'film': f'同导演：{other_creator}',
                        }
                        reasons.append(creator_labels.get(new_type, f'同创作者：{other_creator}'))

            # Title keyword overlap (simple word matching)
            other_title_lower = getattr(other, 'title', '').lower()
            new_words = set(w for w in new_title_lower.replace('《', '').replace('》', '') if w not in '的之了在是')
            other_words = set(w for w in other_title_lower.replace('《', '').replace('》', '') if w not in '的之了在是')
            shared_words = new_words & other_words
            if shared_words and len(shared_words) >= 2:
                reasons.append(f'标题关键词：{"、".join(list(shared_words)[:3])}')

            # Content keyword overlap
            if new_notes and other_notes:
                # Simple: check if any tag name appears in both
                for tag in new_tags:
                    if tag in other_notes and tag in new_notes:
                        if f'内容提及「{tag}」' not in reasons:
                            reasons.append(f'内容提及「{tag}」')

            if reasons:
                conn = Connection.objects.create(
                    source_content_type=new_ct,
                    source_object_id=new_card.pk,
                    target_content_type=other_ct,
                    target_object_id=other.pk,
                    reason='；'.join(reasons),
                    connection_type='auto',
                    is_confirmed=False,
                )
                suggestions.append(_connection_to_dict(conn))

    return [s for s in suggestions if s is not None]
