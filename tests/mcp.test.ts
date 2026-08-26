import { test } from "node:test";
import assert from "node:assert/strict";
import { scanMcp } from "../src/collect/mcp.ts";
import type { Readers } from "../src/collect/readers.ts";

const AGENT = "/base/agent";
const HOME = "/base/hm";
const CWD = "/base/work/proj";

const norm = (path: string): string => path.replace(/\\/g, "/");

interface Vfs {
  json?: Record<string, unknown>;
  text?: Record<string, string>;
}

function makeReaders(vfs: Vfs): Readers {
  const json = vfs.json ?? {};
  const text = vfs.text ?? {};
  return {
    readJson: (raw) => {
      const path = norm(raw);
      if (Object.hasOwn(json, path)) return json[path];
      throw new Error(`missing ${path}`);
    },
    readText: (raw) => {
      const path = norm(raw);
      if (Object.hasOwn(text, path)) return text[path] as string;
      throw new Error(`missing ${path}`);
    },
    exists: (raw) => Object.hasOwn(json, norm(raw)) || Object.hasOwn(text, norm(raw)),
    listDir: () => {
      throw new Error("not used");
    },
  };
}

function scan(vfs: Vfs, packageRoots: string[] = []) {
  return scanMcp({ agentDir: AGENT, cwd: CWD, home: HOME, packageRoots, readers: makeReaders(vfs) });
}

const byName = (entries: ReturnType<typeof scan>, name: string) =>
  entries.find((entry) => entry.name === name);

// join() emits the platform separator, so a Windows run reports backslash paths. That is the
// right thing to show a user and the wrong thing to hardcode in an assertion.
const at = (entry: { path: string } | undefined): string | undefined =>
  entry === undefined ? undefined : norm(entry.path);

test("servers are found in each of pi's config files", () => {
  const entries = scan({
    json: {
      [`${HOME}/.config/mcp/mcp.json`]: { mcpServers: { alpha: {} } },
      [`${HOME}/.agents/mcp.json`]: { mcpServers: { beta: {} } },
      [`${AGENT}/mcp.json`]: { mcpServers: { gamma: {} } },
      [`${CWD}/.mcp.json`]: { mcpServers: { delta: {} } },
      [`${CWD}/.pi/mcp.json`]: { mcpServers: { epsilon: {} } },
    },
  });
  assert.deepEqual(
    entries.map((entry) => entry.name).sort(),
    ["alpha", "beta", "delta", "epsilon", "gamma"],
  );
});

test("project config files are reported with project scope", () => {
  const entries = scan({ json: { [`${CWD}/.mcp.json`]: { mcpServers: { delta: {} } } } });
  assert.equal(byName(entries, "delta")?.scope, "project");
});

// The bug this covers: reporting the first definition points the user at the file whose value
// is being overridden, so editing it appears to do nothing.
test("a name defined twice reports the file that wins, and says what it overrode", () => {
  const entries = scan({
    json: {
      [`${HOME}/.config/mcp/mcp.json`]: { mcpServers: { shared: {} } },
      [`${AGENT}/mcp.json`]: { mcpServers: { shared: {} } },
    },
  });
  assert.equal(entries.length, 1);
  const shared = byName(entries, "shared");
  assert.equal(at(shared), `${AGENT}/mcp.json`);
  assert.deepEqual(shared?.shadows?.map(norm), [`${HOME}/.config/mcp/mcp.json`]);
});

test("an unreadable config file does not lose the readable ones", () => {
  const entries = scan({
    json: {
      [`${HOME}/.config/mcp/mcp.json`]: "not an object",
      [`${AGENT}/mcp.json`]: { mcpServers: { alpha: {} } },
    },
  });
  assert.deepEqual(entries.map((entry) => entry.name), ["alpha"]);
});

test("an explicit import pulls in another tool's servers and names its config file", () => {
  const entries = scan({
    json: {
      [`${AGENT}/mcp.json`]: { imports: ["cursor"] },
      [`${HOME}/.cursor/mcp.json`]: { mcpServers: { fromCursor: {} } },
    },
  });
  const imported = byName(entries, "fromCursor");
  assert.equal(at(imported), `${HOME}/.cursor/mcp.json`);
  assert.equal(imported?.source, "import:cursor");
});

test("an imported server never displaces one defined in a pi config", () => {
  const entries = scan({
    json: {
      [`${AGENT}/mcp.json`]: { imports: ["cursor"], mcpServers: { shared: {} } },
      [`${HOME}/.cursor/mcp.json`]: { mcpServers: { shared: {} } },
    },
  });
  assert.equal(byName(entries, "shared")?.source, "local");
});

test("host discovery is off unless a config turns it on", () => {
  const configured = { [`${HOME}/.cursor/mcp.json`]: { mcpServers: { fromCursor: {} } } };
  assert.equal(scan({ json: { ...configured, [`${AGENT}/mcp.json`]: {} } }).length, 0);
  assert.equal(
    scan({
      json: { ...configured, [`${AGENT}/mcp.json`]: { settings: { hostConfigDiscovery: "on" } } },
    }).length,
    1,
  );
});

test("codex servers are read from its TOML tables, sub-tables aside", () => {
  const entries = scan({
    json: { [`${AGENT}/mcp.json`]: { imports: ["codex"] } },
    text: {
      [`${HOME}/.codex/config.toml`]: [
        "[mcp_servers.github]",
        'command = "gh"',
        "[mcp_servers.github.env]",
        'TOKEN = "x"',
        '[mcp_servers."quoted-name"]',
      ].join("\n"),
    },
  });
  assert.deepEqual(entries.map((entry) => entry.name).sort(), ["github", "quoted-name"]);
});

test("an opencode server switched off is reported as disabled, not hidden", () => {
  const entries = scan({
    json: {
      [`${AGENT}/mcp.json`]: { imports: ["opencode"] },
      [`${HOME}/.config/opencode/opencode.json`]: {
        mcp: { live: { enabled: true }, dormant: { enabled: false } },
      },
    },
  });
  assert.equal(byName(entries, "live")?.enabled, true);
  assert.equal(byName(entries, "dormant")?.enabled, false);
});

test("a package's servers are prefixed the way pi prefixes them", () => {
  const root = "/base/agent/npm/node_modules/pi-mcp-adapter";
  const entries = scan(
    {
      json: {
        [`${root}/package.json`]: { name: "pi-mcp-adapter", pi: { mcp: "mcp.json" } },
        [`${root}/mcp.json`]: { mcpServers: { inner: {} } },
      },
    },
    [root],
  );
  const entry = byName(entries, "pi_mcp_adapter__inner");
  assert.equal(entry?.origin, "package");
  assert.equal(at(entry), `${root}/mcp.json`);
});

test("nothing configured yields nothing, without throwing", () => {
  assert.deepEqual(scan({}), []);
});
