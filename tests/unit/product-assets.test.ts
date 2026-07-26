import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { getCatalogue } from "@/lib/catalogue/repository";

type AssetManifestEntry = {
  imagePath: string;
  fallbackPath: string;
  kind: "placeholder";
  format: "svg";
  width: number;
  height: number;
  source: "project-authored";
  license: "project-owned";
  attribution: null;
  brandNeutral: true;
};

const ENTRY_KEYS = [
  "attribution",
  "brandNeutral",
  "fallbackPath",
  "format",
  "height",
  "imagePath",
  "kind",
  "license",
  "source",
  "width",
] as const;
const LOCAL_PRODUCT_PATH = /^\/products\/(top|bottom|shoes)-\d{2}\.svg$/;
const publicRoot = path.join(process.cwd(), "public");
const productsRoot = path.join(publicRoot, "products");
const manifestPath = path.join(productsRoot, "manifest.json");

function toPublicFile(imagePath: string): string {
  expect(imagePath).toMatch(LOCAL_PRODUCT_PATH);

  const resolvedPath = path.resolve(
    publicRoot,
    imagePath.replace(/^\/+/, ""),
  );

  expect(path.relative(productsRoot, resolvedPath)).not.toMatch(/^\.\.(?:[\\/]|$)/);

  return resolvedPath;
}

function readManifest(): Record<string, AssetManifestEntry> {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    AssetManifestEntry
  >;
}

function normalizeVisibleText(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function getVisibleSvgText(svg: string): string[] {
  return [...svg.matchAll(/<text\b[^>]*>(.*?)<\/text>/gis)].map((match) =>
    normalizeVisibleText(match[1]),
  );
}

describe("product asset integrity", () => {
  it("maps exactly the 30 catalogue IDs to strict, truthful asset records", () => {
    const catalogue = getCatalogue();
    const manifest = readManifest();
    const catalogueIds = catalogue.map((product) => product.id).sort();
    const manifestIds = Object.keys(manifest).sort();

    expect(manifestIds).toHaveLength(30);
    expect(manifestIds).toEqual(catalogueIds);

    for (const product of catalogue) {
      const entry = manifest[product.id];

      expect(Object.keys(entry).sort()).toEqual([...ENTRY_KEYS].sort());
      expect(entry).toEqual({
        imagePath: product.imagePath,
        fallbackPath: product.imagePath,
        kind: "placeholder",
        format: "svg",
        width: 640,
        height: 800,
        source: "project-authored",
        license: "project-owned",
        attribution: null,
        brandNeutral: true,
      });
    }
  });

  it("resolves every primary and fallback path to an existing local file", () => {
    const entries = Object.values(readManifest());
    const imagePaths = entries.map((entry) => entry.imagePath);

    expect(new Set(imagePaths).size).toBe(30);

    for (const entry of entries) {
      for (const assetPath of [entry.imagePath, entry.fallbackPath]) {
        const filePath = toPublicFile(assetPath);

        expect(existsSync(filePath)).toBe(true);
        expect(statSync(filePath).isFile()).toBe(true);
        expect(statSync(filePath).size).toBeGreaterThan(0);
        expect(statSync(filePath).size).toBeLessThan(32 * 1024);
      }
    }
  });

  it("contains no undeclared product image files", () => {
    const declaredFiles = new Set(
      Object.values(readManifest()).flatMap((entry) => [
        path.basename(entry.imagePath),
        path.basename(entry.fallbackPath),
      ]),
    );
    const actualAssetFiles = readdirSync(productsRoot)
      .filter((fileName) => fileName !== "manifest.json")
      .sort();

    expect(actualAssetFiles).toHaveLength(30);
    expect(actualAssetFiles).toEqual([...declaredFiles].sort());
  });

  it("keeps every placeholder at its declared 4:5 canvas", () => {
    for (const entry of Object.values(readManifest())) {
      const svg = readFileSync(toPublicFile(entry.imagePath), "utf8");
      const viewBox = svg.match(
        /<svg\b[^>]*\bviewBox=["']0 0 (\d+) (\d+)["'][^>]*>/i,
      );

      expect(viewBox).not.toBeNull();
      expect(Number(viewBox?.[1])).toBe(entry.width);
      expect(Number(viewBox?.[2])).toBe(entry.height);
      expect(entry.width / entry.height).toBe(4 / 5);
      expect(svg).toMatch(
        /^<svg\b[^>]*\bxmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/i,
      );
    }
  });

  it("keeps every SVG free of executable, embedded, or remotely loaded content", () => {
    for (const entry of Object.values(readManifest())) {
      const svg = readFileSync(toPublicFile(entry.imagePath), "utf8");

      expect(svg).not.toMatch(/<\s*(?:script|foreignObject|iframe|object|embed|image)\b/i);
      expect(svg).not.toMatch(/<!\s*(?:DOCTYPE|ENTITY)\b/i);
      expect(svg).not.toMatch(/\bon[a-z]+\s*=/i);
      expect(svg).not.toMatch(/\b(?:href|src)\s*=/i);
      expect(svg).not.toMatch(/url\(\s*["']?(?:https?:|data:|\/\/)/i);
      expect(svg).not.toMatch(/@import\b/i);
      expect(svg).not.toMatch(/data:[^;,\s]+[;,]/i);
    }
  });

  it("limits visible copy to catalogue facts and the fictional Fitora label", () => {
    for (const product of getCatalogue()) {
      const svg = readFileSync(toPublicFile(product.imagePath), "utf8");
      const number = product.id.split("-")[1];
      const colorLabel = [
        product.colors[0],
        product.colors[1] ?? product.colors[0],
      ]
        .join(" / ")
        .toUpperCase();

      expect(getVisibleSvgText(svg)).toEqual([
        `${product.category.toUpperCase()} · ${number}`,
        "FITORA EDIT",
        product.name,
        colorLabel,
      ]);
    }
  });
});
