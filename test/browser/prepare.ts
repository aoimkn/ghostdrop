import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const out = join(import.meta.dirname, ".generated");
const project = join(out, "project.inlang");
const settings = JSON.parse(readFileSync(join(root, "project.inlang/settings.json"), "utf8"));

mkdirSync(project, { recursive: true });
mkdirSync(join(out, "messages"), { recursive: true });
for (const locale of settings.locales) {
  const messages = JSON.parse(readFileSync(join(root, `messages/${locale}.json`), "utf8"));
  const keyed = Object.fromEntries(
    Object.keys(messages)
      .filter((key) => key !== "$schema")
      .map((key) => [key, `[${key}]`]),
  );
  writeFileSync(join(out, `messages/${locale}.json`), JSON.stringify(keyed, null, 2));
}
writeFileSync(
  join(project, "settings.json"),
  JSON.stringify(
    {
      ...settings,
      modules: settings.modules.map((module: string) => resolve(root, module)),
      "plugin.inlang.messageFormat": { pathPattern: join(out, "messages/{locale}.json") },
    },
    null,
    2,
  ),
);
writeFileSync(
  join(project, "paraglide.config.ts"),
  readFileSync(join(root, "project.inlang/paraglide.config.ts"), "utf8"),
);
