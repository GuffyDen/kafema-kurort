# Релиз

Использовать перед test или production deploy.

## Процесс

1. Зафиксировать ветку, commit range и точный состав релиза.
2. Проверить `git status`; не включать секреты и несвязанные изменения.
3. Заполнить `../templates/release-notes.md`.
4. Выполнить `npm run lint`.
5. Выполнить `npx tsc --noEmit`.
6. Выполнить `npm run build`.
7. Проверить required env для целевой среды без вывода значений.
8. Проверить Redis, cron, API routes и внешние интеграции безопасными запросами.
9. Пройти критические сценарии Client, Bar и Manager.
10. Проверить mobile viewport и interaction states.
11. Применить `tablo-performance`; проверить запросы, изображения и bundle.
12. Проверить миграции и обратную совместимость, если они есть.
13. Сформировать Release Checklist с результатом каждого пункта.
14. Deploy выполнять только после явного подтверждения.
15. После deploy проверить health, runtime logs и ключевые сценарии.

## Release Checklist

- [ ] Lint
- [ ] TypeScript
- [ ] Production build
- [ ] Environment variables
- [ ] Redis и persistence
- [ ] API и интеграции
- [ ] Client mobile flow
- [ ] Bar flow
- [ ] Manager flow
- [ ] Performance review
- [ ] Rollback понятен
- [ ] Известные ограничения записаны
