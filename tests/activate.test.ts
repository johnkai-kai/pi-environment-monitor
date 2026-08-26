import { test } from "node:test";
import assert from "node:assert/strict";
import activate from "../src/index.ts";

// The extension's contract with pi is one call: registering the commands. Everything else is
// reached through them, so if this is wrong the package installs cleanly and does nothing —
// the failure mode with no error message.

interface Registered {
  name: string;
  description?: string;
  handler: unknown;
}

function fakePi(): { registered: Registered[]; api: Parameters<typeof activate>[0] } {
  const registered: Registered[] = [];
  const api = {
    registerCommand(name: string, options: { description?: string; handler: unknown }): void {
      registered.push({ name, description: options.description, handler: options.handler });
    },
  };
  return { registered, api: api as unknown as Parameters<typeof activate>[0] };
}

test("activating registers both command names", () => {
  const { registered, api } = fakePi();
  activate(api);
  assert.deepEqual(registered.map((command) => command.name), ["pi-env", "pi-environment-monitor"]);
});

test("every registered command has a description and a callable handler", () => {
  const { registered, api } = fakePi();
  activate(api);
  for (const command of registered) {
    assert.equal(typeof command.handler, "function");
    assert.ok((command.description ?? "").length > 0, `${command.name} has no description`);
  }
});

test("a handler reports a failure instead of throwing into pi", async () => {
  const { registered, api } = fakePi();
  activate(api);
  const notices: Array<[string, string | undefined]> = [];
  const ctx = {
    cwd: "/nonexistent-project-root",
    hasUI: false,
    mode: "print",
    ui: {
      notify: (message: string, type?: string) => notices.push([message, type]),
    },
  };
  const handler = registered[0]?.handler as (args: string, ctx: unknown) => Promise<void>;
  await assert.doesNotReject(() => handler("", ctx));
  assert.ok(notices.length > 0, "the handler produced no output at all");
});
