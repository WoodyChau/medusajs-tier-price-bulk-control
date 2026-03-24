export type MultiplierTierDefinition = {
  min_quantity: number
  max_quantity: number | null
  multiplier: number
}

export type AbsoluteTierDefinition = {
  min_quantity: number
  max_quantity: number | null
  amounts_by_currency: Record<string, number>
}

export type TierDefinition = MultiplierTierDefinition | AbsoluteTierDefinition
export type TierMode = "multiplier" | "absolute"

export type TierAmount = {
  currency_code: string
  amount: number
  min_quantity: number
  max_quantity: number | null
}

export type ExistingPriceRow = {
  id?: string | null
  price_list_id?: string | null
  currency_code?: string | null
}

const hasOwn = (obj: object, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key)

const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null
  }

  if (typeof value === "object") {
    const objectValue = value as { value?: unknown; numeric?: unknown }
    if (objectValue.value !== undefined) {
      return toFiniteNumber(objectValue.value)
    }

    if (objectValue.numeric !== undefined) {
      return toFiniteNumber(objectValue.numeric)
    }
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return null
  }

  return numeric
}

export const normalizeTierDefinitions = (tiers: unknown): TierDefinition[] => {
  if (!Array.isArray(tiers)) {
    return []
  }

  return tiers
    .map((tier) => {
      const tierObj = (tier ?? {}) as Record<string, unknown>

      const min = toFiniteNumber(tierObj.min_quantity)
      const maxRaw = tierObj.max_quantity
      const max = maxRaw === null || maxRaw === undefined || maxRaw === ""
        ? null
        : toFiniteNumber(maxRaw)
      const multiplier = toFiniteNumber(tierObj.multiplier)
      const amountsByCurrency = normalizeTier1ByCurrency(
        (tierObj.amounts_by_currency || {}) as Record<string, unknown>
      )

      const normalizedMin = min === null ? NaN : Math.trunc(min)
      const normalizedMax = max === null ? null : Math.trunc(max)

      if (multiplier !== null && Number.isFinite(multiplier) && multiplier > 0) {
        return {
          min_quantity: normalizedMin,
          max_quantity: normalizedMax,
          multiplier,
        } satisfies MultiplierTierDefinition
      }

      if (Object.keys(amountsByCurrency).length) {
        return {
          min_quantity: normalizedMin,
          max_quantity: normalizedMax,
          amounts_by_currency: amountsByCurrency,
        } satisfies AbsoluteTierDefinition
      }

      return null
    })
    .filter((tier): tier is TierDefinition => {
      if (!tier) {
        return false
      }

      return Number.isFinite(tier.min_quantity)
    })
}

export const isMultiplierTierDefinition = (
  tier: TierDefinition
): tier is MultiplierTierDefinition => hasOwn(tier, "multiplier")

export const isAbsoluteTierDefinition = (
  tier: TierDefinition
): tier is AbsoluteTierDefinition => hasOwn(tier, "amounts_by_currency")

export const getTierMode = (tiers: TierDefinition[]): TierMode | null => {
  if (!tiers.length) {
    return null
  }

  const allMultiplier = tiers.every(isMultiplierTierDefinition)
  const allAbsolute = tiers.every(isAbsoluteTierDefinition)

  if (allMultiplier) {
    return "multiplier"
  }

  if (allAbsolute) {
    return "absolute"
  }

  return null
}

export const validateTierDefinitions = (tiers: TierDefinition[]): string[] => {
  const errors: string[] = []

  if (!tiers.length) {
    errors.push("At least one tier is required.")
    return errors
  }

  const mode = getTierMode(tiers)
  if (!mode) {
    errors.push("All tiers must use a single mode: multiplier or absolute.")
    return errors
  }

  tiers.forEach((tier, index) => {
    if (!Number.isInteger(tier.min_quantity) || tier.min_quantity < 1) {
      errors.push(`Tier ${index + 1}: min_quantity must be an integer >= 1.`)
    }

    if (tier.max_quantity !== null) {
      if (!Number.isInteger(tier.max_quantity) || tier.max_quantity < tier.min_quantity) {
        errors.push(`Tier ${index + 1}: max_quantity must be null or an integer >= min_quantity.`)
      }
    }

    if (mode === "multiplier") {
      if (!isMultiplierTierDefinition(tier)) {
        errors.push(`Tier ${index + 1}: multiplier tier is invalid.`)
      } else if (!Number.isFinite(tier.multiplier) || tier.multiplier <= 0) {
        errors.push(`Tier ${index + 1}: multiplier must be a positive number.`)
      }
    }

    if (mode === "absolute") {
      if (!isAbsoluteTierDefinition(tier)) {
        errors.push(`Tier ${index + 1}: absolute tier is invalid.`)
      } else if (!Object.keys(tier.amounts_by_currency || {}).length) {
        errors.push(`Tier ${index + 1}: amounts_by_currency must include at least one currency.`)
      }
    }

    if (tier.max_quantity === null && index !== tiers.length - 1) {
      errors.push(`Tier ${index + 1}: only the last tier can have max_quantity = null.`)
    }

    if (index > 0) {
      const prev = tiers[index - 1]

      if (prev.max_quantity === null) {
        errors.push(`Tier ${index}: previous tier is open-ended, so no additional tiers are allowed.`)
      } else if (tier.min_quantity <= prev.max_quantity) {
        errors.push(`Tier ${index + 1}: min_quantity must be greater than previous tier max_quantity.`)
      }
    }
  })

  if (mode === "absolute") {
    const absoluteTiers = tiers.filter(isAbsoluteTierDefinition)
    const firstCurrencies = Object.keys(absoluteTiers[0]?.amounts_by_currency || {}).sort()

    absoluteTiers.forEach((tier, index) => {
      const currentCurrencies = Object.keys(tier.amounts_by_currency || {}).sort()
      if (currentCurrencies.join(",") !== firstCurrencies.join(",")) {
        errors.push(
          `Tier ${index + 1}: all absolute tiers must define the same currency set.`
        )
      }
    })
  }

  return errors
}

export const normalizeTier1ByCurrency = (
  input: Record<string, unknown> | undefined | null
): Record<string, number> => {
  if (!input || typeof input !== "object") {
    return {}
  }

  return Object.entries(input).reduce<Record<string, number>>((acc, [currency, value]) => {
    const normalizedCurrency = currency.trim().toLowerCase()
    const amount = toFiniteNumber(value)

    if (!normalizedCurrency || amount === null || amount <= 0) {
      return acc
    }

    acc[normalizedCurrency] = amount
    return acc
  }, {})
}

export const deriveTier1ByCurrency = (
  tiersByCurrency: Record<string, { amount: number; min_quantity: number }[]>
): Record<string, number> => {
  const result: Record<string, number> = {}

  for (const [currency, tiers] of Object.entries(tiersByCurrency)) {
    if (!tiers.length) {
      continue
    }

    const sorted = [...tiers].sort((a, b) => a.min_quantity - b.min_quantity)
    const tier1 = sorted[0]

    if (Number.isFinite(tier1.amount) && tier1.amount > 0) {
      result[currency.toLowerCase()] = tier1.amount
    }
  }

  return result
}

export const buildComputedTierPrices = ({
  tier1Amount,
  tiers,
  currencyCode,
}: {
  tier1Amount: number
  tiers: MultiplierTierDefinition[]
  currencyCode: string
}): TierAmount[] => {
  const normalizedCurrency = currencyCode.toLowerCase()

  return tiers.map((tier) => ({
    currency_code: normalizedCurrency,
    amount: tier1Amount * tier.multiplier,
    min_quantity: tier.min_quantity,
    max_quantity: tier.max_quantity,
  }))
}

export const listAbsoluteTierCurrencies = (
  tiers: AbsoluteTierDefinition[]
): string[] => {
  return Array.from(
    new Set(
      tiers.flatMap((tier) =>
        Object.keys(tier.amounts_by_currency || {}).map((currency) =>
          currency.toLowerCase()
        )
      )
    )
  ).sort((a, b) => a.localeCompare(b))
}

export const buildAbsoluteTierPrices = ({
  tiers,
}: {
  tiers: AbsoluteTierDefinition[]
}): TierAmount[] => {
  return tiers.flatMap((tier) =>
    Object.entries(tier.amounts_by_currency || {}).map(([currency, amount]) => ({
      currency_code: currency.toLowerCase(),
      amount,
      min_quantity: tier.min_quantity,
      max_quantity: tier.max_quantity,
    }))
  )
}

export const selectReplaceAllRemovablePriceIds = (
  rows: ExistingPriceRow[],
  currencies: string[]
): string[] => {
  const currencySet = new Set(currencies.map((currency) => currency.toLowerCase()))

  return rows
    .filter((row) => {
      if (!row?.id || row.price_list_id) {
        return false
      }

      const currencyCode = String(row.currency_code || "").toLowerCase()
      if (!currencyCode) {
        return false
      }

      return currencySet.has(currencyCode)
    })
    .map((row) => String(row.id))
}
