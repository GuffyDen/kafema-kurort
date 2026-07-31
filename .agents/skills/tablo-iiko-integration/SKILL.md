---
name: tablo-iiko-integration
description: "Изменять или диагностировать интеграцию Tablo с iiko Cloud API: v2-авторизацию, External Menu, terminal groups, stop-list, webhook и серверную синхронизацию. Использовать для любых iiko endpoint, credentials, parser или availability-задач."
---

# Цель

Работать с iiko по фактической реализации и актуальной официальной схеме, сохраняя server-only секреты, read/write границы и витринные overrides.

# Применять

- При изменении `lib/iikoCloudClient.ts`, iiko API routes, sync, webhook или stop-list.
- При диагностике авторизации, организации, terminal group, меню и availability.
- При изменении parser внешнего меню или сопоставления ID.

# Не применять

- Для UI-задачи без iiko-контракта.
- Для write-запроса, который пользователь не разрешил явно.
- Для возврата к legacy endpoint без доказанной необходимости.

# Подтвержденная модель

- Базовая витрина: `POST /api/2/menu`, затем `POST /api/2/menu/by_id`.
- Тело `menu/by_id`: `externalMenuId`, `organizationIds`, `version: 2`, `language: "ru"`; `priceCategoryId` добавлять только при фактическом наличии.
- `/api/1/nomenclature` не является основным источником витрины.
- Stop-list загружается отдельно через официальный read-only endpoint.
- Сопоставлять товары и модификаторы по стабильным iiko ID, не по названию.

# Порядок действий

1. Прочитать `AGENTS.md`, затем найти текущие client, provider, routes, parser, cache и env usage.
2. Проверить endpoint и schema по актуальной официальной документации; для Next.js также читать локальную документацию версии.
3. Составить allowlist запросов и явно отметить read/write.
4. Выполнить минимальный безопасный запрос с `cache: "no-store"` и timeout; секреты не логировать.
5. Сохранить correlationId и безопасный текст ошибки.
6. Проверить parser на полном raw response, включая пустые и неполные массивы.
7. Убедиться, что синхронизация обновляет исходный snapshot, а overrides остаются отдельными.
8. Перед заказом проверять availability на сервере.
9. Применить `tablo-regression-check`.

# Чек-лист

- [ ] iiko вызывается только server-side.
- [ ] API Key, App ID, Client Secret и Bearer token не попали в ответ или bundle.
- [ ] Нет незаметного fallback на legacy auth или mock.
- [ ] Ошибка stop-list не превращает все товары в доступные.
- [ ] Menu, stop-list и overrides имеют отдельные ключи/хранилища.
- [ ] Timeout, correlationId, malformed response и rate limit обработаны.
- [ ] Write-операции отсутствуют либо отдельно и явно разрешены.

# Итоговый отчет

Указать endpoint и method, read/write статус, безопасный request shape, HTTP status, correlationId, результат parser, измененные файлы, проверки и подтверждение отсутствия неразрешенных write-операций.
