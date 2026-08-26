// Extension entry point.
//
// Deliberately empty. What this package scans, and whether pi hands us the resolved lists
// through an API instead, is decided by docs/investigation.md; wiring written before that
// lands would be guesswork. The stub exists so the manifest's "pi".extensions entry points
// at a real, loadable module from the first commit.
export default function activate(): void {}
