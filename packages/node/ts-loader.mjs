import { readFileSync } from "node:fs";
import ts from "typescript";

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("@aqua/protocol")) {
    return defaultResolve(specifier.replace("@aqua/protocol", "../../protocol/src/index.ts"), context);
  }
  if (specifier.startsWith("@aqua/shared")) {
    return defaultResolve(specifier.replace("@aqua/shared", "../../shared/src/index.ts"), context);
  }
  if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL?.includes("/src/")) {
    try {
      return await defaultResolve(specifier.replace(/\.js$/, ".ts"), context);
    } catch {
      return defaultResolve(specifier, context);
    }
  }
  return defaultResolve(specifier, context);
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".ts")) {
    const source = readFileSync(new URL(url), "utf8");
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
      }).outputText
    };
  }
  return defaultLoad(url, context, defaultLoad);
}
