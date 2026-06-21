"""
个人图书馆 · 数据模型
5 种卡片类型 + 标签 + 连线（知识图谱）
"""
from django.db import models
from django.contrib.contenttypes.fields import GenericForeignKey, GenericRelation
from django.contrib.contenttypes.models import ContentType


class Tag(models.Model):
    """标签 — 贯穿所有卡片类型"""
    name = models.CharField('名称', max_length=50, unique=True)
    color = models.CharField('颜色', max_length=7, blank=True, help_text='如 #C68B3C')
    description = models.CharField('描述', max_length=200, blank=True)

    class Meta:
        verbose_name = '标签'
        verbose_name_plural = '标签'
        ordering = ['name']

    def __str__(self):
        return self.name


class BaseCard(models.Model):
    """卡片抽象基类 — 所有卡片类型共享的字段"""
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('修改时间', auto_now=True)
    is_published = models.BooleanField('已发布', default=True)
    tags = models.ManyToManyField(Tag, verbose_name='标签', blank=True)

    # Reverse generic relation — allows Connection to point here
    outgoing_connections = GenericRelation(
        'Connection',
        content_type_field='source_content_type',
        object_id_field='source_object_id',
        related_query_name='source_card'
    )
    incoming_connections = GenericRelation(
        'Connection',
        content_type_field='target_content_type',
        object_id_field='target_object_id',
        related_query_name='target_card'
    )

    class Meta:
        abstract = True
        ordering = ['-created_at']

    @property
    def card_type(self):
        """返回卡片类型标识，用于前端着色和分类"""
        return self._meta.model_name  # 'bookcard', 'musiccard', etc.


class BookCard(BaseCard):
    """📖 书籍"""
    title = models.CharField('书名', max_length=200)
    author = models.CharField('作者', max_length=200, blank=True)
    isbn = models.CharField('ISBN', max_length=20, blank=True)
    cover = models.ImageField('封面', upload_to='covers/books/', blank=True)
    STATUS_CHOICES = [
        ('reading', '在读'),
        ('read', '已读'),
        ('want', '想读'),
    ]
    status = models.CharField('阅读状态', max_length=10, choices=STATUS_CHOICES, default='reading')
    notes = models.TextField('笔记/评价', blank=True, help_text='Markdown 格式')

    class Meta:
        verbose_name = '📖 书籍'
        verbose_name_plural = '📖 书籍'

    def __str__(self):
        return f'📖 {self.title}'


class MusicCard(BaseCard):
    """🎵 音乐"""
    title = models.CharField('专辑/曲目名', max_length=200)
    artist = models.CharField('艺术家', max_length=200, blank=True)
    genre = models.CharField('曲风/流派', max_length=100, blank=True)
    cover = models.ImageField('封面', upload_to='covers/music/', blank=True)
    year = models.PositiveSmallIntegerField('发行年份', null=True, blank=True)
    notes = models.TextField('感悟', blank=True, help_text='Markdown 格式')

    class Meta:
        verbose_name = '🎵 音乐'
        verbose_name_plural = '🎵 音乐'

    def __str__(self):
        return f'🎵 {self.title}'


class FilmCard(BaseCard):
    """🎬 电影"""
    title = models.CharField('电影名', max_length=200)
    director = models.CharField('导演', max_length=200, blank=True)
    year = models.PositiveSmallIntegerField('年份', null=True, blank=True)
    poster = models.ImageField('海报', upload_to='covers/films/', blank=True)
    rating = models.PositiveSmallIntegerField('评分', null=True, blank=True, help_text='1-10')

    notes = models.TextField('评价', blank=True, help_text='Markdown 格式')

    class Meta:
        verbose_name = '🎬 电影'
        verbose_name_plural = '🎬 电影'

    def __str__(self):
        return f'🎬 {self.title}'


class GameCard(BaseCard):
    """🎮 游戏"""
    title = models.CharField('游戏名', max_length=200)
    platform = models.CharField('平台', max_length=100, blank=True, help_text='PS / Switch / PC / 其他')
    genre = models.CharField('类型', max_length=100, blank=True)
    cover = models.ImageField('封面', upload_to='covers/games/', blank=True)
    STATUS_CHOICES = [
        ('playing', '在玩'),
        ('done', '通关'),
        ('dropped', '弃了'),
    ]
    status = models.CharField('游玩状态', max_length=10, choices=STATUS_CHOICES, default='playing')
    notes = models.TextField('感想', blank=True, help_text='Markdown 格式')

    class Meta:
        verbose_name = '🎮 游戏'
        verbose_name_plural = '🎮 游戏'

    def __str__(self):
        return f'🎮 {self.title}'


class WritingCard(BaseCard):
    """✍️ 原创文字"""
    title = models.CharField('标题', max_length=200)
    genre = models.CharField('体裁', max_length=50, blank=True, help_text='随笔 / 短篇 / 诗 / 其他')
    body = models.TextField('正文', blank=True, help_text='Markdown 格式')

    class Meta:
        verbose_name = '✍️ 原创文字'
        verbose_name_plural = '✍️ 原创文字'

    def __str__(self):
        return f'✍️ {self.title}'


class Connection(models.Model):
    """连线 — 知识图谱中两个节点之间的边"""
    # Source node (GenericForeignKey)
    source_content_type = models.ForeignKey(
        ContentType, on_delete=models.CASCADE,
        related_name='source_connections'
    )
    source_object_id = models.PositiveIntegerField()
    source = GenericForeignKey('source_content_type', 'source_object_id')

    # Target node (GenericForeignKey)
    target_content_type = models.ForeignKey(
        ContentType, on_delete=models.CASCADE,
        related_name='target_connections'
    )
    target_object_id = models.PositiveIntegerField()
    target = GenericForeignKey('target_content_type', 'target_object_id')

    reason = models.CharField('连线原因', max_length=200, blank=True)
    CONNECTION_TYPES = [
        ('auto', '自动建议'),
        ('manual', '手动连线'),
        ('system', '系统生成'),
    ]
    connection_type = models.CharField('连线类型', max_length=10, choices=CONNECTION_TYPES, default='auto')
    is_confirmed = models.BooleanField('已确认', default=False)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)

    class Meta:
        verbose_name = '连线'
        verbose_name_plural = '连线'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['source_content_type', 'source_object_id']),
            models.Index(fields=['target_content_type', 'target_object_id']),
        ]

    def __str__(self):
        return f'{self.source} → {self.target} ({self.get_connection_type_display()})'
