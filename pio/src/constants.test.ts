import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PIO_PACKAGE_ROOT } from "./constants.ts";

describe("pio package root (single source of truth for path derivations)", () => {
  it("=== the hand-computed derivation from the module's OWN url (pins the arithmetic incl. the level count — src/ sits one level down) and is normalized to the no-trailing-slash form every consumer joins against", () => {
    const moduleUrl = new URL("./constants.ts", import.meta.url);
    expect(PIO_PACKAGE_ROOT).toBe(
      path.resolve(fileURLToPath(new URL("..", moduleUrl))),
    );
    expect(PIO_PACKAGE_ROOT.endsWith("/")).toBe(false);
  });

  it("resolves onto THE pio package root itself (manifest named 'pio' + the in-bubble entry point bin/pio-run-session present beneath it)", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(PIO_PACKAGE_ROOT, "package.json"), "utf8"),
    ) as { name: string };
    expect(manifest.name).toBe("pio");
    expect(
      existsSync(path.join(PIO_PACKAGE_ROOT, "bin", "pio-run-session")),
    ).toBe(true);
  });

  it("export surface is EXACTLY ['PIO_PACKAGE_ROOT']", async () => {
    expect(Object.keys(await import("./constants.ts"))).toEqual([
      "PIO_PACKAGE_ROOT",
    ]);
  });
});
