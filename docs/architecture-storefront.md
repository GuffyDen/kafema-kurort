# Tablo Storefront Architecture

This document describes the current storefront data flow for the Kafema
Sanatornaya pilot tenant.

## Sources of truth

| Data | Source of truth | Runtime copy |
| --- | --- | --- |
| Categories, products, prices, modifiers, images | iiko External Menu v2 | Redis menu snapshot |
| Product availability and balances | iiko stop-list | Redis stop-list snapshot, fresh for 10 seconds |
| Storefront names, descriptions, images, visibility, badges and sorting | Tablo overrides | Redis overrides document |
| Cart and current client interaction | Browser state | Client memory/local storage where applicable |

The iiko menu snapshot and Tablo overrides are intentionally stored
separately. A menu synchronization replaces the source snapshot but does not
delete or overwrite presentation overrides.

## Menu synchronization

```text
Vercel Cron (every 15 minutes)
        |
        v
GET /api/cron/storefront-sync
        |
        v
iiko Cloud API
  POST /api/v2/access_token
  POST /api/1/organizations
  POST /api/1/terminal_groups
  POST /api/2/menu
  POST /api/2/menu/by_id
        |
        v
Redis: tablo:kafema-sanatornaya:storefront-menu:v1
        |
        v
GET /api/storefront
        |
        +---- reads Redis overrides
        |     tablo:kafema-sanatornaya:storefront-overrides:v1
        |
        v
Normalized client menu
```

The cron route is protected by `CRON_SECRET`. Admin's **Обновить из iiko**
button calls the same `syncStorefrontMenu()` function immediately. If no menu
snapshot exists yet, the storefront performs one initial server-side sync.

The browser never calls iiko directly. It receives the normalized menu from
`GET /api/storefront`.

## Availability flow

```text
Visible browser tab
        |
        | GET every 15 seconds
        v
GET /api/storefront/availability
        |
        v
Availability service
        |
        +---- reads a shared snapshot newer than 10 seconds
        |     from Redis
        |
        +---- otherwise acquires a short Redis refresh lock
        |          |
        |          v
        |     iiko Cloud API
        |       POST /api/v2/access_token
        |       POST /api/1/stop_lists
        |
        v
Redis: tablo:kafema-sanatornaya:stop-list:v1
        |
        v
Compact productId -> availability map
```

The browser uses the Page Visibility API:

- polling starts only while the tab is visible;
- polling stops completely when the tab is hidden;
- returning to the tab triggers an immediate refresh and restarts polling.

Multiple browsers share the 10-second Redis snapshot and the distributed lock,
so they do not each create an independent iiko request stream.

If iiko cannot refresh the stop-list, the last successful snapshot remains in
use and is marked stale. Products are not all silently changed to unavailable
or available.

## Stop-list ID matching

iiko stop-list entries are read from:

```text
terminalGroupStopLists[]
  -> items[]                  terminal group lists
     -> items[]               stopped products/modifiers
        -> productId
        -> balance
```

`productId` is the only matching key. It is compared with the stable iiko
`itemId` used by storefront products and modifier options. Product names,
category names and display overrides are never used for availability matching.

The compact snapshot has this shape:

```json
{
  "checkedAt": "ISO timestamp",
  "items": {
    "<iiko productId>": {
      "available": false,
      "balance": 0
    }
  }
}
```

An ID absent from the stop-list is treated as available. Before adding or
increasing a cart item, Tablo checks the main product ID and all selected
modifier option IDs. Checkout repeats the availability validation.

## Overrides

Admin changes are stored under:

```text
tablo:kafema-sanatornaya:storefront-overrides:v1
```

The document contains separate maps:

- `products[itemId]` for product overrides;
- `categories[categoryId]` for category overrides.

A field reset removes only that field from the override. A full product reset
removes the entire product override object. On every storefront read, Tablo
loads the latest iiko snapshot and overlays these values without modifying the
source menu.

## Storage modes

- **Production with Redis:** shared persistent snapshots, overrides and locks.
- **Development without Redis:** `.data/*.json` files are used locally.
- **Production without Redis:** persistence is reported as unconfigured;
  override writes and durable snapshots are unavailable.

Required production storage variables:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
CRON_SECRET
```

## iiko requests

Only server-side modules call iiko. Current storefront requests are:

| Endpoint | Purpose | Changes iiko data |
| --- | --- | --- |
| `POST /api/v2/access_token` | Obtain a server token | No |
| `POST /api/1/organizations` | Resolve tenant organization | No |
| `POST /api/1/terminal_groups` | Resolve configured terminal group | No |
| `POST /api/2/menu` | List External Menus | No |
| `POST /api/2/menu/by_id` | Read External Menu contents | No |
| `POST /api/1/stop_lists` | Read current availability | No |

Redis operations are limited to menu snapshots, overrides, stop-list snapshots
and the short-lived stop-list refresh lock. The client has no Redis or iiko
credentials.

## Admin diagnostics

Admin reads the same menu snapshot and availability service as the storefront.
The compact status shows:

- latest menu synchronization time;
- latest stop-list check time;
- whether the stop-list snapshot is stale;
- the latest safe error message.

Technical stack traces and credentials are not included in the admin response.
