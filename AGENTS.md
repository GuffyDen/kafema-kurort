<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:tablo-product-rules -->
# Tablo product rules

Before changing product behavior or architecture, read `PROJECT.md` and `VISION.md`.

Tablo is the SaaS platform. Kafema Kurort is the first pilot tenant, not the name of the whole system.

Keep platform branding and tenant branding separate:

- `/admin` may show Tablo as the management platform.
- `/bar` may show compact Tablo branding.
- `/` must stay under the tenant coffee shop / restaurant brand.

iiko credentials are split by ownership:

- `IIKO_APP_ID` and `IIKO_CLIENT_SECRET` belong to the Tablo application.
- `IIKO_API_KEY` and `IIKO_TERMINAL_GROUP_ID` belong to a specific tenant.
- Secrets must never be committed or exposed to the client bundle.
<!-- END:tablo-product-rules -->
