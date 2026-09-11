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

function AdminPanelFixture() {}
function BaristaLoginFixture() {}

const originalLoad = Module._load;
Module._load = function (id, parent, main) {
  if (id === "next/headers") {
    return {
      cookies: async () => ({
        get: (name) =>
          name === "tablo_barista_session" && cookieValue
            ? { name, value: cookieValue }
            : undefined,
      }),
    };
  }
  if (id === "@/components/admin/AdminPanel") return { AdminPanel: AdminPanelFixture };
  if (id === "@/components/bar/BaristaLogin") return { BaristaLogin: BaristaLoginFixture };
  if (id === "@/lib/serverBaristaAuth") {
    return {
      getBaristaSessionCookieName: () => "tablo_barista_session",
      hasBaristaSession: async (token) => sessionIsValid && token === cookieValue,
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

const barPage = load(path.join(root, "app/bar/page.tsx"));

test("/bar renders login on the server without a valid session", async () => {
  cookieValue = undefined;
  sessionIsValid = false;
  const element = await barPage.default();
  assert.equal(element.type, BaristaLoginFixture);
});

test("/bar renders the queue only after server session validation", async () => {
  cookieValue = "opaque-session-token";
  sessionIsValid = true;
  const element = await barPage.default();
  assert.equal(element.type, AdminPanelFixture);
});
