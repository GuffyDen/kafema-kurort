import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Module, { createRequire } from "node:module";
import ts from "typescript";

const load = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");
let cookieValue;
let sessionIsValid = false;

function ManagePanelFixture() {}
function AdminLoginFixture() {}

const originalLoad = Module._load;
Module._load = function (id, parent, main) {
  if (id === "next/headers") {
    return {
      cookies: async () => ({
        get: (name) =>
          name === "tablo_admin_session" && cookieValue
            ? { name, value: cookieValue }
            : undefined,
      }),
    };
  }
  if (id === "@/components/manage/ManagePanel") {
    return { ManagePanel: ManagePanelFixture };
  }
  if (id === "@/components/manage/AdminLogin") {
    return { AdminLogin: AdminLoginFixture };
  }
  if (id === "@/lib/serverAdminAuth") {
    return {
      getAdminSessionCookieName: () => "tablo_admin_session",
      hasAdminSession: async (token) =>
        Boolean(token) && sessionIsValid && token === cookieValue,
    };
  }
  return originalLoad.call(this, id, parent, main);
};
Module._extensions[".tsx"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );

const adminPage = load(path.join(root, "app/admin/page.tsx"));

test("/admin renders login on the server without a valid Admin session", async () => {
  cookieValue = undefined;
  sessionIsValid = false;
  const element = await adminPage.default();
  assert.equal(element.type, AdminLoginFixture);
});

test("/admin renders the existing panel only with a valid Admin session", async () => {
  cookieValue = "opaque-admin-session-token";
  sessionIsValid = true;
  const element = await adminPage.default();
  assert.equal(element.type, ManagePanelFixture);
});

test("a Barista cookie does not satisfy the Admin page check", async () => {
  cookieValue = undefined;
  sessionIsValid = true;
  const element = await adminPage.default();
  assert.equal(element.type, AdminLoginFixture);
});
