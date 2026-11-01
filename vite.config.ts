import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

function publicFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? publicFiles(path) : [path];
  });
}

/** Emits /sw.js with every built file precached, versioned by their contents. */
function serviceWorker(): Plugin {
  return {
    name: "parrot-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      if (this.environment.name !== "client") return;
      const built = Object.keys(bundle).filter((f) => !f.endsWith(".map"));
      const fromPublic = publicFiles("public")
        .map((p) => relative("public", p));
      // Skip build metadata (.assetsignore, _headers) that is never served.
      const served = (f: string) => !f.split("/").some((part) => part.startsWith(".") || part.startsWith("_"));
      const files = [...new Set([...built, ...fromPublic])].filter(served).sort();
      const hash = createHash("sha256");
      for (const f of built) {
        const chunk = bundle[f];
        hash.update(f).update(chunk.type === "chunk" ? chunk.code : chunk.source);
      }
      for (const f of fromPublic) hash.update(f).update(readFileSync(join("public", f)));
      const version = hash.digest("hex").slice(0, 12);
      const precache = ["/", ...files.map((f) => `/${f}`)];
      const source = readFileSync("sw/sw.js", "utf8")
        .replace("__VERSION__", version)
        .replace("__PRECACHE__", JSON.stringify(precache));
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}

export default defineConfig({
  plugins: [react(), cloudflare(), serviceWorker()],
});
