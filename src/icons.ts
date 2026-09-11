import type { Kind } from "./inventory.ts";

const KIND_ICONS: Record<Kind, string> = {
  skill: "◆",
  extension: "◇",
  mcp: "●",
  package: "□",
  theme: "◐",
  prompt: "¶",
};

export function iconForKind(kind: Kind): string {
  return KIND_ICONS[kind];
}

export function iconForTab(id: "overview" | "all" | "packages" | Kind): string {
  if (id === "overview") return "◈";
  if (id === "all") return "≡";
  return iconForKind(id === "packages" ? "package" : id);
}
