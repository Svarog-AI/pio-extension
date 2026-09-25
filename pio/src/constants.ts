import path from "node:path";
import { fileURLToPath } from "node:url";

/** Pio package root — single source of truth for every path derived from the
 * artifact's OWN location (mirror of version.ts). This file sits one level
 * down at src/, so ".." lands on the package root; normalized (no trailing
 * slash) so consumers join uniformly. Consumers import this constant — no
 * module re-derives the root through its own import.meta.url. */
export const PIO_PACKAGE_ROOT: string = path.resolve(
  fileURLToPath(new URL("..", import.meta.url)),
);
