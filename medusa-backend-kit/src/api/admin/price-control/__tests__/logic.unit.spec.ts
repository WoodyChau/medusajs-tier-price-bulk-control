import {
  buildAbsoluteTierPrices,
  buildComputedTierPrices,
  getTierMode,
  normalizeTier1ByCurrency,
  selectReplaceAllRemovablePriceIds,
  validateTierDefinitions,
  type TierDefinition,
} from "../logic"

describe("price-control logic", () => {
  it("validates an ordered tier list", () => {
    const tiers: TierDefinition[] = [
      { min_quantity: 1, max_quantity: 10, multiplier: 1 },
      { min_quantity: 11, max_quantity: 100, multiplier: 0.8 },
      { min_quantity: 101, max_quantity: null, multiplier: 0.5 },
    ]

    expect(validateTierDefinitions(tiers)).toEqual([])
  })

  it("rejects overlapping and invalid open-ended tiers", () => {
    const tiers: TierDefinition[] = [
      { min_quantity: 1, max_quantity: null, multiplier: 1 },
      { min_quantity: 2, max_quantity: 10, multiplier: 0.9 },
    ]

    const errors = validateTierDefinitions(tiers)

    expect(errors.join(" ")).toContain("only the last tier")
  })

  it("calculates amounts from tier1 and multipliers", () => {
    const tiers: TierDefinition[] = [
      { min_quantity: 1, max_quantity: 10, multiplier: 1 },
      { min_quantity: 11, max_quantity: null, multiplier: 0.5 },
    ]

    const prices = buildComputedTierPrices({
      tier1Amount: 123,
      tiers,
      currencyCode: "USD",
    })

    expect(prices).toEqual([
      {
        currency_code: "usd",
        amount: 123,
        min_quantity: 1,
        max_quantity: 10,
      },
      {
        currency_code: "usd",
        amount: 61.5,
        min_quantity: 11,
        max_quantity: null,
      },
    ])
  })

  it("normalizes tier1 amounts by currency", () => {
    const map = normalizeTier1ByCurrency({
      USD: 10,
      eur: "20",
      bad: -1,
      empty: "",
    })

    expect(map).toEqual({
      usd: 10,
      eur: 20,
    })
  })

  it("validates absolute tiers and detects absolute mode", () => {
    const tiers: TierDefinition[] = [
      {
        min_quantity: 1,
        max_quantity: 10,
        amounts_by_currency: {
          usd: 1000,
          hkd: 7800,
        },
      },
      {
        min_quantity: 11,
        max_quantity: null,
        amounts_by_currency: {
          usd: 900,
          hkd: 7000,
        },
      },
    ]

    expect(getTierMode(tiers)).toBe("absolute")
    expect(validateTierDefinitions(tiers)).toEqual([])
  })

  it("builds absolute prices from template tiers", () => {
    const prices = buildAbsoluteTierPrices({
      tiers: [
        {
          min_quantity: 1,
          max_quantity: 10,
          amounts_by_currency: {
            usd: 999.6,
            hkd: 7777,
          },
        },
        {
          min_quantity: 11,
          max_quantity: null,
          amounts_by_currency: {
            usd: 555,
            hkd: 3333,
          },
        },
      ],
    })

    expect(prices).toEqual([
      {
        currency_code: "usd",
        amount: 999.6,
        min_quantity: 1,
        max_quantity: 10,
      },
      {
        currency_code: "hkd",
        amount: 7777,
        min_quantity: 1,
        max_quantity: 10,
      },
      {
        currency_code: "usd",
        amount: 555,
        min_quantity: 11,
        max_quantity: null,
      },
      {
        currency_code: "hkd",
        amount: 3333,
        min_quantity: 11,
        max_quantity: null,
      },
    ])
  })

  it("selects non-price-list rows for replace-all within target currencies", () => {
    const removable = selectReplaceAllRemovablePriceIds(
      [
        {
          id: "price_1",
          currency_code: "usd",
          price_list_id: null,
        },
        {
          id: "price_2",
          currency_code: "eur",
          price_list_id: null,
        },
        {
          id: "price_3",
          currency_code: "usd",
          price_list_id: "plist_123",
        },
        {
          id: "price_4",
          currency_code: "hkd",
          price_list_id: null,
        },
      ],
      ["usd", "eur"]
    )

    expect(removable).toEqual(["price_1", "price_2"])
  })
})
