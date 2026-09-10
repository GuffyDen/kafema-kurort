# Интеграция ЮKassa и фискализация

Состояние на 11 сентября 2026 года: техническая реализация завершена локально. `YOOKASSA_MODE` по умолчанию равен `disabled`; production не развёртывался, реальные платежи и чеки не создавались, настройки Vercel и личного кабинета не менялись.

## Архитектура

Интеграция встроена в существующий server order flow Next.js 16 App Router. Заказ создаётся и оценивается сервером по актуальному storefront menu, затем тот же заказ получает payment intent и фискальное состояние. Отдельной сущности заказа и второго источника цены нет.

Хранилище — tenant-scoped Redis JSON с атомарными Lua/CAS-операциями; локальная разработка использует существующее файловое JSON-хранилище. Поддерживаются существующий прямой `REDIS_URL` (`redis://` или TLS `rediss://`) через официальный `redis` client и прежние Upstash/KV REST credentials. SQL/ORM и schema migration в проекте отсутствуют. Все новые поля необязательны при чтении, поэтому старые JSON-записи остаются совместимыми.

Статусы разделены:

- приготовление: `new → in_progress → ready → completed`;
- оплата: `pending | waiting_for_capture | succeeded | canceled`;
- фискализация: регистрация первого чека и отдельное состояние второго чека.

`completed` — существующий статус «Выдан» в barista flow. Именно переход `ready → completed` фиксирует физическую выдачу и создаёт устойчивое задание на второй чек. Факт выдачи сохраняется до обращения к ЮKassa и не откатывается при временной ошибке провайдера.

## Официальные источники

Повторно проверены актуальные официальные материалы ЮKassa:

- [Формат взаимодействия с API](https://yookassa.ru/developers/using-api/interaction-format): REST API v3, Basic Auth, `Idempotence-Key`, окно идемпотентности 24 часа.
- [Создание платежа и состав первого чека](https://yookassa.ru/developers/payment-acceptance/receipts/54fz/yoomoney/payments): `receipt`, контакт покупателя, предметы расчёта.
- [Чек после зачёта предоплаты](https://yookassa.ru/developers/payment-acceptance/receipts/54fz/yoomoney/payments): отдельный `POST /v3/receipts`, связь через `payment_id`, `full_payment`, `settlements` с `prepayment`.
- [Значения параметров чеков](https://yookassa.ru/developers/payment-acceptance/receipts/54fz/yoomoney/parameters-values): `vat_code=1`, `commodity`, `full_prepayment`, `full_payment`, `piece`.
- [HTTP-уведомления](https://yookassa.ru/developers/using-api/webhooks): HTTPS POST, HTTP 200 после успешной обработки, повторная доставка при другом ответе.
- [Официальная OpenAPI-спецификация](https://yookassa.ru/developers/api/yookassa-openapi-specification.yaml): обязательность email для сервиса «Чеки от ЮKassa», ограничения телефона и структуры receipt.

Сторонний SDK не добавлен. Сервер использует `fetch` к официальному REST API `https://api.yookassa.ru/v3`.

## Checkout и первый чек

Checkout требует «Email для электронного чека» и поясняет, что на него придут чеки об оплате и выдаче. Поле проверяется общей функцией на клиенте и повторно на сервере. Нормализованный email сохраняется только во внутреннем `ServerOrder`; customer/barista API его не возвращают.

При создании платежа сервер строит первый `receipt` из замороженного снимка заказа:

- `receipt.customer.email` — нормализованный email;
- `receipt.customer.phone` — существующий телефон в формате цифр;
- `internet: true`;
- название включает товар, вариант и добавки, не более 128 Unicode-символов;
- `quantity` и цена единицы берутся из server order;
- все проверки и суммы выполняются в целых копейках;
- сумма строк обязана совпасть с `order.totalMinor` и amount платежа;
- каждая строка: `vat_code: 1`, `payment_subject: commodity`, `payment_mode: full_prepayment`, `measure: piece`.

Payment intent хранит `receiptVersion: 2`. Старый intent без этой версии нельзя повторно отправить с изменившимся телом под прежним ключом.

## Второй чек после выдачи

После атомарного сохранения `completed` создаётся `fiscal.settlement` со статусом `pending`, собственным UUID `idempotencyKey`, временем требования и счётчиком попыток. Затем Next.js `after()` запускает быструю попытку; плановый cron остаётся устойчивым механизмом восстановления.

Перед созданием чека worker повторно получает исходный платёж через `GET /v3/payments/{payment_id}` и проверяет сохранённый payment ID, shop ID, tenant/order metadata, RUB-сумму, test/live mode, статус `succeeded` и `paid=true`. Также первый чек должен иметь `receipt_registration=succeeded`.

Второй чек создаётся официальным запросом:

```text
POST https://api.yookassa.ru/v3/receipts
Idempotence-Key: <сохранённый UUID>
```

Тело содержит:

- `type: payment`;
- `payment_id` исходного платежа;
- `customer.email` и `customer.phone`;
- те же серверные позиции и суммы;
- `payment_mode: full_payment`;
- `payment_subject: commodity`, `vat_code: 1`, `measure: piece`, `internet: true`;
- `settlements: [{ type: prepayment, amount: <полная сумма RUB> }]`;
- `send: true`.

Ответ проверяется против исходного платежа и ожидаемого состава. Сохраняются `receiptId`, регистрационный статус (`pending | succeeded | canceled`) и итоговое состояние (`pending | succeeded | needs_review`). Известный `receiptId` проверяется через `GET /v3/receipts/{id}` без повторного POST.

## Идемпотентность и восстановление

- Повторное нажатие «Выдан» возвращает уже завершённый заказ и не создаёт новое fiscal-задание.
- Статус заказа и первое fiscal-задание сохраняются одной Lua-операцией в Redis.
- Worker получает lease через CAS; параллельные `after`, cron и несколько экземпляров приложения не выполняют один POST одновременно.
- Ключ второго чека сохраняется до первого внешнего POST и не меняется при retry.
- При сетевой ошибке, 429 или 5xx заказ остаётся выданным, задание возвращается в очередь с ограниченным exponential backoff.
- Если ответ POST потерян, повтор в пределах 23 часов идёт с тем же ключом и восстанавливает тот же чек.
- Если `receiptId` не известен после 23 часов, новый ключ не создаётся: заказ переводится в `needs_review`, чтобы не получить дубль после официального 24-часового окна идемпотентности.
- `canceled`, несовпадение ответа и незарегистрированный первый чек старше трёх суток также требуют ручной проверки.
- Ошибки и cron-логи содержат только безопасные коды и агрегированные количества, без credentials, email, телефона и provider payload.

Очередь хранится в tenant Redis sorted set, а проблемные записи — в tenant set. Один запуск worker обрабатывает до пяти заказов параллельно; это ограничивает нагрузку и не добавляет polling в браузер. Точный интервал не участвует в расчёте: worker выбирает только записи с наступившим `nextAttemptAt`, поэтому запоздалые, повторные и параллельные вызовы безопасны.

## Webhook и возврат клиента

Production webhook после согласованного deploy:

```text
POST https://kafema-kurort.ru/api/yookassa/webhook
```

События в личном кабинете: `payment.succeeded` и `payment.canceled`. Endpoint публичный, без cookies, CSRF, customer/barista/admin token. Payload служит сигналом: для `payment.succeeded` backend обязательно получает платёж через API ЮKassa и проверяет ID, metadata, shop, сумму, RUB, mode и `paid=true`. Только затем оплата сохраняется. Повторные уведомления идемпотентны; неизвестные события отвечают HTTP 200 без изменения заказа. Ошибка проверки/API/storage возвращает не-200, чтобы ЮKassa повторила доставку.

`/payment/return?orderId=<UUID>` не считает переход доказательством оплаты. Страница получает фактический статус защищённым запросом backend и показывает оплату, обработку или незавершённый результат.

## ENV и защита включения

```dotenv
NEXT_PUBLIC_APP_URL=https://kafema-kurort.ru
YOOKASSA_MODE=disabled
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
YOOKASSA_CRON_SECRET=
```

`YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` и `YOOKASSA_CRON_SECRET` используются только сервером. Наличие credentials ничего не включает: допустимы только явные `disabled`, `test` или `live`; сейчас остаётся `disabled`. Test mode запрещён в `VERCEL_ENV=production`. Live отклоняет test key и `*.vercel.app` return origin. Старый `CRON_SECRET` остаётся у существующих задач и для ЮKassa не используется.

Старый общий guard `PAYMENT_FISCALIZATION_NOT_CONFIGURED` удалён после реализации двух чеков. Его заменяет точная проверка: для live-создания требуется отдельный `YOOKASSA_CRON_SECRET` длиной не менее 32 символов и работающая очередь повторов. Это дополнительная защита, а не команда включить live.

Проект остаётся на Vercel Hobby. Встроенного Vercel Cron для fiscal worker в `vercel.json` нет: поминутная запись удалена, чтобы она не блокировала deploy. Endpoint остаётся обычным защищённым HTTPS Route Handler для внешнего scheduler:

```text
GET https://kafema-kurort.ru/api/cron/yookassa-fiscal
Authorization: Bearer <YOOKASSA_CRON_SECRET>
```

Секрет принимается только в заголовке и не читается из query string. Отсутствующий или неверный заголовок получает HTTP 401. Успешный запуск, включая пустую очередь, получает HTTP 200 с коротким JSON. cron-job.org поддерживает HTTPS, GET и произвольные заголовки; рекомендуемый интервал — пять минут. Основной `ready → completed` flow по-прежнему сразу запускает попытку через Next.js `after()`, внешний scheduler нужен только для восстановления.

Инфраструктурные ограничения сверены с [официальными лимитами Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) и [FAQ cron-job.org о HTTPS, custom headers и HTTP methods](https://cron-job.org/en/faq/).

## Что сделать перед контролируемым запуском

1. Проверить Production ENV: `NEXT_PUBLIC_APP_URL=https://kafema-kurort.ru`, существующий `REDIS_URL`, правильные `YOOKASSA_SHOP_ID` и `YOOKASSA_SECRET_KEY`; отдельно добавить новый `YOOKASSA_CRON_SECRET` длиной не менее 32 символов. Существующий `CRON_SECRET` не менять и не использовать для ЮKassa.
2. Оставить `YOOKASSA_MODE=disabled` до отдельного разрешения и согласованного deploy.
3. После deploy создать в cron-job.org задачу: GET production URL раз в пять минут, custom header `Authorization` со значением `Bearer <YOOKASSA_CRON_SECRET>`; не добавлять секрет в URL.
4. При disabled проверить ответы 401 без заголовка и 200 с корректным заголовком: provider calls при этом не выполняются.
5. Для теста использовать отдельный тестовый магазин/ключи и Preview, не production credentials.
6. Перед одним live-платежом проверить в ЛК события webhook и домен, затем отдельно разрешить `YOOKASSA_MODE=live`.
7. Контролируемым заказом проверить первый чек, `payment.succeeded`, появление заказа у бариста, выдачу, второй чек и его регистрацию в ЛК/ОФД.

До выполнения этих шагов интеграция остаётся технической подготовкой: deploy, реальные запросы, платежи и чеки не выполняются.
