import { describe, expect, it } from "vitest"
import type { PriceControlVariant, TierDefinition } from "@/lib/types"
import {
  applyTemplateDefaultsToTier1Inputs,
  buildApplyPayload,
  resolveAuthRedirect,
  toggleSelection,
  toggleSelectionForMany,
} from "@/lib/price-control-utils"

describe("resolveAuthRedirect", () => {
  it("returns null while auth state is loading", () => {
    expect(
      resolveAuthRedirect({
        isLoading: true,
        isAuthenticated: false,
      })
    ).toBeNull()
  })

  it("routes authenticated users to price-control", () => {
    expect(
      resolveAuthRedirect({
        isLoading: false,
        isAuthenticated: true,
      })
    ).toBe("/price-control")
  })

  it("routes unauthenticated users to login", () => {
    expect(
      resolveAuthRedirect({
        isLoading: false,
        isAuthenticated: false,
      })
    ).toBe("/login")
  })
})

describe("selection helpers", () => {
  it("tracks row/product/select-all selection with accurate selected count", () => {
    let selected = new Set<string>()

    selected = toggleSelection(selected, "v1", true)
    expect(selected.size).toBe(1)

    selected = toggleSelectionForMany(selected, ["v2", "v3"], true)
    expect(selected.size).toBe(3)

    selected = toggleSelectionForMany(selected, ["v1", "v2", "v3"], false)
    expect(selected.size).toBe(0)
  })
})

describe("template + apply payload", () => {
  const tiers: TierDefinition[] = [
    { min_quantity: 1, max_quantity: 10, multiplier: 1 },
    { min_quantity: 11, max_quantity: null, multiplier: 0.5 },
  ]

  const variants: PriceControlVariant[] = [
    {
      variant_id: "variant_1",
      variant_title: "Blue",
      sku: "BLUE",
      product_id: "prod_1",
      product_title: "Notebook",
      product_thumbnail: null,
      tier1_by_currency: {},
      tiers_by_currency: {},
    },
    {
      variant_id: "variant_2",
      variant_title: "Green",
      sku: "GREEN",
      product_id: "prod_1",
      product_title: "Notebook",
      product_thumbnail: null,
      tier1_by_currency: {},
      tiers_by_currency: {},
    },
  ]

  it("applies template defaults and keeps per-variant overrides in payload", () => {
    const selectedVariantIds = new Set<string>(["variant_1", "variant_2"])

    const withTemplateDefaults = applyTemplateDefaultsToTier1Inputs({
      currentInputs: {
        variant_1: { usd: "1000" },
        variant_2: { usd: "900" },
      },
      selectedVariantIds,
      defaults: { usd: "1200", eur: "1100" },
    })

    const withOverride = {
      ...withTemplateDefaults,
      variant_2: {
        ...withTemplateDefaults.variant_2,
        usd: "1500",
      },
    }

    const payload = buildApplyPayload({
      selectedVariants: variants,
      tier1Inputs: withOverride,
      tiers,
      templateId: "pct_1",
    })

    expect(payload.template_id).toBe("pct_1")
    expect(payload.mode).toBe("replace_all_tiers")
    expect(payload.variants).toEqual([
      {
        variant_id: "variant_1",
        tier1_by_currency: { usd: 1200, eur: 1100 },
      },
      {
        variant_id: "variant_2",
        tier1_by_currency: { usd: 1500, eur: 1100 },
      },
    ])
  })
})
