# 进度日志

> 每次工作会话的记录

---

## 2026-06-21 · 会话 1（brainstorming → 实现）

### 完成
- ✅ Phase 0: Django 6.0 项目初始化，venv，SQLite 配置
- ✅ Phase 1: 数据模型（5 种卡片 + Tag + Connection），Admin 注册，migrations
- ✅ Phase 2-5: 4 种浏览模式集成到单页（图谱/卡片墙/搜索/随机），API 端点
- ✅ Phase 6: Saul Bass 设计系统 CSS（暖纸色、5 色卡片、暗色模式、Cytoscape 图谱样式）
- ✅ Phase 7: 用户认证（login/logout，POST API 需登录，GET 公开）

### 待做
- 🔜 Phase 8: 部署到 PythonAnywhere
- 🔜 创建 GitHub 仓库并推送代码

### 技术摘要
- 后端：Django 6.0.6 + SQLite + Pillow
- 前端：原生 JS + Cytoscape.js 3.30 + marked.js
- 字体：ZCOOL KuaiLe (display) + 思源宋体 (body) + 霞鹜文楷 (tags)
- 4 种模式：图谱 / 卡片墙 / 搜索 / 随机漫步
- 自动连线：标签/创作者/标题关键词/内容关键词匹配
- 管理员：admin / library2026
- 本地运行：`./venv/Scripts/python.exe manage.py runserver`
