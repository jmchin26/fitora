import catalogueData from "@/data/products.json";

import {
  CatalogueSchema,
  type Catalogue,
  type Product,
  type ProductCategory,
} from "@/lib/catalogue/schemas";

export function validateCatalogueData(data: unknown): Catalogue {
  return CatalogueSchema.parse(data);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }

    Object.freeze(value);
  }

  return value;
}

const catalogue = deepFreeze(validateCatalogueData(catalogueData));

export function getCatalogue(): readonly Product[] {
  return catalogue;
}

export function getProductById(id: string): Product | undefined {
  return catalogue.find((product) => product.id === id);
}

export function getProductsByCategory(category: ProductCategory): Product[] {
  return catalogue.filter((product) => product.category === category);
}
