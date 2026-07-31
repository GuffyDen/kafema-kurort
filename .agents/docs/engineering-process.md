# Инженерный процесс Tablo

Это точка входа для любой инженерной задачи.

## Жизненный цикл

```text
Идея или проблема
        ↓
Spec / Bug Report
        ↓
Product Thinking
        ↓
Platform Review
        ↓
Implementation
        ↓
Regression
        ↓
Performance Review
        ↓
Release Checklist
        ↓
Deploy
        ↓
Monitoring
```

## 1. Классифицировать задачу

| Тип | Playbook | Основной шаблон |
| --- | --- | --- |
| Новая функция | [Feature](../playbooks/feature.md) | [Feature Spec](../templates/feature-spec.md) |
| Баг | [Bugfix](../playbooks/bugfix.md) | [Bug Report](../templates/bug-report.md) |
| Рефакторинг | [Refactor](../playbooks/refactor.md) | ADR при необходимости |
| Интеграция | [API Integration](../playbooks/api-integration.md) | [API Integration Plan](../templates/api-integration-plan.md) |
| Изменение дизайна | [Design Review](../playbooks/design-review.md) | Feature Spec |
| Срочный production-блокер | [Hotfix](../playbooks/hotfix.md) | Краткий Bug Report |
| Релиз | [Release](../playbooks/release.md) | [Release Notes](../templates/release-notes.md) |

Не смешивать типы. Если баг требует рефакторинга, сначала сделать минимальный
фикс, а рефакторинг оформить отдельной задачей.

## 2. Подготовить решение

1. Прочитать `AGENTS.md`, `PROJECT.md` и `VISION.md`.
2. Заполнить подходящий шаблон.
3. Найти существующую реализацию, call sites, API и storage.
4. Применить узкие skills из `../skills/`.
5. Зафиксировать границы: что меняется и что не меняется.
6. Получить согласование, если меняется продукт, архитектура или внешний API.

## 3. Реализовать

- Делать минимальный diff в существующем пути.
- Не создавать второй источник истины.
- Не исправлять несвязанные проблемы.
- Не стирать чужие изменения в грязном worktree.
- Не выполнять commit, push, deploy и внешние write-операции без команды.

## 4. Проверить

Минимальный набор:

1. Проверить фактический сценарий.
2. Проверить error, empty, loading и persistence.
3. Запустить lint, TypeScript и production build.
4. Проверить затронутые API routes.
5. Проверить mobile при изменении клиентского UI.
6. Выполнить performance review для сетевых и UI-изменений.

Code inspection не считается ручной проверкой.

## 5. Выпустить

1. Проверить diff и отсутствие секретов.
2. Подготовить Release Notes и Release Checklist.
3. Получить явное подтверждение на commit, push и deploy.
4. После публикации проверить health, runtime logs и критические сценарии.
5. Зафиксировать известные ограничения и rollback.

## Формат финального отчета

- Что сделано.
- Какие файлы изменены.
- Что намеренно не менялось.
- Какие проверки выполнены и их результат.
- Известные ограничения и следующий шаг.
