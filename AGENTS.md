<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:tablo-product-rules -->
# Tablo product rules

Before changing product behavior or architecture, read `PROJECT.md` and `VISION.md`.

Tablo is the SaaS platform. Kafema Kurort / Кафема Санаторная is the first pilot tenant, not the name of the whole system.

Keep platform branding and tenant branding separate:

- `/admin` may show Tablo as the management platform.
- `/bar` may show compact Tablo branding.
- `/` must stay under the tenant coffee shop / restaurant brand.

Determine the active stack, package manager, scripts, routes, and conventions from `package.json` and the current codebase. Inspect the existing implementation and all call sites before editing. Reuse working modules and established patterns; do not create a parallel source of truth or rewrite adjacent pages and components without a direct need.

iiko is the operational source of truth for menu items, prices, categories, modifiers, stop-lists, and availability. Do not substitute mock data when real iiko data is available. Tablo storefront overrides are a separate presentation layer and must survive menu synchronization.

iiko credentials are split by ownership:

- `IIKO_APP_ID` and `IIKO_CLIENT_SECRET` belong to the Tablo application.
- `IIKO_API_KEY` and `IIKO_TERMINAL_GROUP_ID` belong to a specific tenant.
- Secrets and iiko requests must remain server-side. Never commit secrets, expose them to the client bundle, or print them in UI and logs.

Preserve the approved visual language unless the user explicitly requests a redesign. Add dependencies only when the existing stack cannot safely solve the task.

Do not commit, push, deploy, or change external systems without an explicit user command. Before reporting completion, run the checks exposed by `package.json`, including lint, TypeScript, and production build when available. Verify the changed behavior factually; never claim that a feature works based only on code inspection.

The final report must list changed files, checks performed, their results, and known limitations. Project-specific workflows are available in `.agents/skills/`; apply the narrowest relevant skill rather than duplicating those instructions here.

For the task lifecycle, templates, and release process, start with the [engineering process](.agents/docs/engineering-process.md).
<!-- END:tablo-product-rules -->
