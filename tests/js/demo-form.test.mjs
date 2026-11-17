/** Behavior checks for extracted browser modules; no browser dependency required. */
import assert from "node:assert/strict";
import test from "node:test";
import { initDemoForm } from "../../request-demo/script.js";

function element() {
  const events = {};
  return {
    events,
    addEventListener(name, callback) {
      events[name] = callback;
    },
  };
}

function mockGlobals(context, values) {
  for (const [name, value] of Object.entries(values)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    context.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
}

test("demo form prepares an encoded email draft with entered values", (context) => {
  const form = element();
  const status = {};
  const browser = { location: { href: "" } };
  const values = new Map([
    ["name", "Test & User"],
    ["email", "test@example.com"],
    ["organization", "Example"],
    ["sector", "Agriculture"],
    ["message", "Hello\nTeam"],
  ]);
  mockGlobals(context, {
    window: browser,
    location: { search: "?intent=demo" },
    document: { querySelector: (selector) => (selector === "#demo-form" ? form : status) },
    FormData: class {
      get(key) {
        return values.get(key);
      }
    },
  });
  initDemoForm();
  assert.match(status.textContent, /Request a demo/);
  let prevented = false;
  form.events.submit({
    target: form,
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  const email = new URL(browser.location.href);
  assert.equal(email.protocol, "mailto:");
  assert.equal(email.searchParams.get("subject"), "AGMOVE demo request — Agriculture");
  assert.match(email.searchParams.get("body"), /Name: Test & User/);
  assert.match(email.searchParams.get("body"), /Hello\nTeam/);
});
