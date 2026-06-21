"""
Django Admin 配置 — 所有卡片类型 + 标签 + 连线管理
"""
from django.contrib import admin
from django.utils.html import format_html
from .models import (
    Tag, BookCard, MusicCard, FilmCard, GameCard, WritingCard, Connection
)


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ['name', 'color_swatch', 'description']
    search_fields = ['name']
    fields = ['name', 'color', 'description']

    def color_swatch(self, obj):
        if obj.color:
            return format_html(
                '<span style="display:inline-block;width:16px;height:16px;'
                'border-radius:50%;background:{};border:1px solid #ccc;"></span>',
                obj.color
            )
        return '-'
    color_swatch.short_description = '颜色'


class BaseCardAdmin(admin.ModelAdmin):
    """共享的 Admin 配置"""
    list_display = ['title', 'card_type_display', 'created_at', 'is_published', 'tag_list']
    list_filter = ['is_published', 'created_at']
    search_fields = ['title', 'notes']
    filter_horizontal = ['tags']
    readonly_fields = ['created_at', 'updated_at']
    date_hierarchy = 'created_at'

    # Ensure card_type is overridden in subclasses
    def card_type_display(self, obj):
        type_map = {
            'bookcard': '📖 书籍',
            'musiccard': '🎵 音乐',
            'filmcard': '🎬 电影',
            'gamecard': '🎮 游戏',
            'writingcard': '✍️ 原创',
        }
        return type_map.get(obj.card_type, obj.card_type)
    card_type_display.short_description = '类型'

    def tag_list(self, obj):
        return ', '.join(t.name for t in obj.tags.all())
    tag_list.short_description = '标签'


@admin.register(BookCard)
class BookCardAdmin(BaseCardAdmin):
    list_display = ['title', 'author', 'status', 'created_at', 'is_published', 'tag_list']
    list_filter = BaseCardAdmin.list_filter + ['status']
    search_fields = ['title', 'author', 'notes']
    fieldsets = [
        ('基本信息', {'fields': ['title', 'author', 'isbn', 'cover', 'status']}),
        ('内容', {'fields': ['notes']}),
        ('分类', {'fields': ['tags']}),
        ('元数据', {'fields': ['created_at', 'updated_at']}),
    ]
    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('tags')


@admin.register(MusicCard)
class MusicCardAdmin(BaseCardAdmin):
    list_display = ['title', 'artist', 'genre', 'year', 'created_at', 'is_published', 'tag_list']
    search_fields = ['title', 'artist', 'genre', 'notes']
    fieldsets = [
        ('基本信息', {'fields': ['title', 'artist', 'genre', 'year', 'cover']}),
        ('内容', {'fields': ['notes']}),
        ('分类', {'fields': ['tags']}),
        ('元数据', {'fields': ['created_at', 'updated_at']}),
    ]
    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('tags')


@admin.register(FilmCard)
class FilmCardAdmin(BaseCardAdmin):
    list_display = ['title', 'director', 'year', 'rating', 'created_at', 'is_published', 'tag_list']
    search_fields = ['title', 'director', 'notes']
    fieldsets = [
        ('基本信息', {'fields': ['title', 'director', 'year', 'rating', 'poster']}),
        ('内容', {'fields': ['notes']}),
        ('分类', {'fields': ['tags']}),
        ('元数据', {'fields': ['created_at', 'updated_at']}),
    ]
    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('tags')


@admin.register(GameCard)
class GameCardAdmin(BaseCardAdmin):
    list_display = ['title', 'platform', 'genre', 'status', 'created_at', 'is_published', 'tag_list']
    list_filter = BaseCardAdmin.list_filter + ['status']
    search_fields = ['title', 'platform', 'notes']
    fieldsets = [
        ('基本信息', {'fields': ['title', 'platform', 'genre', 'cover', 'status']}),
        ('内容', {'fields': ['notes']}),
        ('分类', {'fields': ['tags']}),
        ('元数据', {'fields': ['created_at', 'updated_at']}),
    ]
    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('tags')


@admin.register(WritingCard)
class WritingCardAdmin(BaseCardAdmin):
    list_display = ['title', 'genre', 'created_at', 'is_published', 'tag_list']
    search_fields = ['title', 'body']
    fieldsets = [
        ('基本信息', {'fields': ['title', 'genre']}),
        ('内容', {'fields': ['body']}),
        ('分类', {'fields': ['tags']}),
        ('元数据', {'fields': ['created_at', 'updated_at']}),
    ]
    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('tags')


@admin.register(Connection)
class ConnectionAdmin(admin.ModelAdmin):
    list_display = ['id', 'source_display', 'arrow', 'target_display', 'connection_type', 'is_confirmed', 'reason', 'created_at']
    list_filter = ['is_confirmed', 'connection_type', 'created_at']
    search_fields = ['reason', 'source_object_id', 'target_object_id']
    list_editable = ['is_confirmed']
    actions = ['confirm_connections', 'unconfirm_connections']

    def source_display(self, obj):
        return str(obj.source) if obj.source else '(已删除)'
    source_display.short_description = '来源'

    def target_display(self, obj):
        return str(obj.target) if obj.target else '(已删除)'
    target_display.short_description = '目标'

    def arrow(self, obj):
        return '→'
    arrow.short_description = ''

    @admin.action(description='确认选中的连线')
    def confirm_connections(self, request, queryset):
        queryset.update(is_confirmed=True)

    @admin.action(description='取消确认选中的连线')
    def unconfirm_connections(self, request, queryset):
        queryset.update(is_confirmed=False)
