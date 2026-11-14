// Copies the Noto font files the templates use into every public directory that
// serves them, so preview (web) and export (render worker) load identical fonts.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

const FONTS = [
  ["@fontsource/noto-sans", "noto-sans-latin"],
  ["@fontsource/noto-sans-devanagari", "noto-sans-devanagari-devanagari"],
  ["@fontsource/noto-sans-gujarati", "noto-sans-gujarati-gujarati"],
];
const WEIGHTS = [400, 700];
const TARGETS = [join(here, "../public/fonts"), join(here, "../../../apps/web/public/fonts")];

for (const target of TARGETS) mkdirSync(target, { recursive: true });

for (const [pkg, prefix] of FONTS) {
  let root;
  try {
    root = dirname(require.resolve(`${pkg}/package.json`));
  } catch {
    console.warn(`copy-fonts: ${pkg} is not installed yet, skipping`);
    continue;
  }
  for (const weight of WEIGHTS) {
    const file = `${prefix}-${weight}-normal.woff2`;
    const source = join(root, "files", file);
    if (!existsSync(source)) throw new Error(`copy-fonts: missing ${source}`);
    for (const target of TARGETS) copyFileSync(source, join(target, file));
  }
}
console.log("copy-fonts: done");
