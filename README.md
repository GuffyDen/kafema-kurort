# Tablo

Tablo is a SaaS platform for coffee shops and restaurants: QR storefront, barista queue, manager panel, and iiko integrations.

Kafema Kurort is the first pilot tenant. It is not the name of the whole system.

## Interfaces

- Client storefront: `/`
- Barista queue: `/bar`
- Manager/Admin: `/admin`

The client storefront stays under the restaurant brand. The Admin and Bar interfaces may show the Tablo platform brand.

## Branding

- Tablo logo: `public/tablo-logo.png`
- `/admin` shows Tablo as the management platform.
- `/bar` shows compact Tablo branding.
- `/` shows the tenant coffee shop brand, currently Kafema Kurort.

## iiko

iiko remains the source of truth for operational menu data:

- menu items;
- prices;
- categories;
- modifiers;
- stop lists;
- availability.

Credential ownership:

- `IIKO_APP_ID` and `IIKO_CLIENT_SECRET` belong to the Tablo application in iiko Developer Portal.
- `IIKO_API_KEY` and `IIKO_TERMINAL_GROUP_ID` belong to a specific tenant restaurant or coffee shop.
- Secrets must never be committed to the repository or exposed to the client bundle.

## Local Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Required Environment Variables

Use `.env.local` locally and Vercel Environment Variables in production.

```bash
IIKO_API_BASE_URL=https://api-ru.iiko.services/api/1/
IIKO_API_KEY=
IIKO_APP_ID=
IIKO_CLIENT_SECRET=
IIKO_TERMINAL_GROUP_ID=
IIKO_WEBHOOK_TOKEN=
NEXT_PUBLIC_APP_URL=
```

Do not commit `.env.local`.

## Checks

Before deploy:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Architecture Notes

Read `PROJECT.md` before changing architecture.

Read `VISION.md` before changing product direction.

Future architecture must support multi-tenant separation:

- global Tablo platform settings;
- tenant-specific restaurant settings;
- tenant-specific iiko credentials;
- tenant-specific storefront branding and QR settings.
