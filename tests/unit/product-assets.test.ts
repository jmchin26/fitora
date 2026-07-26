import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getCatalogue } from "@/lib/catalogue/repository";

type AssetManifestEntry = {
  imagePath: string;
  source: string;
  license: string;
  attribution: string | null;
};

const publicRoot = path.join(process.cwd(), "public");
const productsRoot = path.join(publicRoot, "products");
const manifestPath = path.join(productsRoot, "manifest.json");

function toPublicFile(imagePath: string): string {
  return path.join(publicRoot, imagePath.replace(/^\/+/, ""));
}

function readManifest(): Record<string, AssetManifestEntry> {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    AssetManifestEntry
  >;
}

describe("product asset integrity", () => {
  it("references exactly 30 unique local product images that exist", () => {
    const imagePaths = getCatalogue().map((product) => product.imagePath);

    expect(imagePaths).toHaveLength(30);
    expect(new Set(imagePaths).size).toBe(30);
    expect(imagePaths.every((imagePath) => existsSync(toPublicFile(imagePath)))).toBe(
      true,
    );
  });

  it("maps the same catalogue IDs and paths in the placeholder manifest", () => {
    const catalogue = getCatalogue();
    const manifest = readManifest();
    const catalogueIds = catalogue.map((product) => product.id).sort();
    const manifestIds = Object.keys(manifest).sort();

    expect(manifestIds).toHaveLength(30);
    expect(manifestIds).toEqual(catalogueIds);

    for (const product of catalogue) {
      expect(manifest[product.id]).toEqual({
        imagePath: product.imagePath,
        source: "generated-placeholder",
        license: "project-authored-placeholder",
        attribution: null,
      });
    }
  });

  it("does not contain SVG files outside the catalogue declaration", () => {
    const declaredSvgFiles = getCatalogue()
      .map((product) => path.basename(product.imagePath))
      .sort();
    const actualSvgFiles = readdirSync(productsRoot)
      .filter((fileName) => path.extname(fileName).toLowerCase() === ".svg")
      .sort();

    expect(actualSvgFiles).toHaveLength(30);
    expect(actualSvgFiles).toEqual(declaredSvgFiles);
  });

  it("keeps every SVG free of executable or remotely loaded content", () => {
    for (const product of getCatalogue()) {
      const svg = readFileSync(toPublicFile(product.imagePath), "utf8");

      expect(svg).not.toMatch(/<\s*script\b/i);
      expect(svg).not.toMatch(/\bon[a-z]+\s*=/i);
      expect(svg).not.toMatch(/\b(?:href|src)\s*=\s*["'](?:https?:)?\/\//i);
      expect(svg).not.toMatch(/url\(\s*["']?(?:https?:)?\/\//i);
      expect(svg).not.toMatch(/@import\b/i);
      expect(svg).not.toMatch(/data:[^;,\s]+[;,]/i);
    }
  });
});
