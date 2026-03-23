import type {
  AbsoluteTierDefinition,
  ApplyPricingPayload,
  MultiplierTierDefinition,
  PriceControlVariant,
  TemplateTierDefinition,
  TemplateTierMode,
  TierDefinition,
} from "@/lib/types"

export type Tier1InputMap = Record<string, Record<string, string>>

export const parsePositiveNumberMap = (input: Record<string, string>) => {
  return Object.entries(input).reduce<Record<string, number>>((acc, [currency, value]) => {
    const amount = Number(value)
    if (Number.isFinite(amount) && amount > 0) {
      acc[currency.toLowerCase()] = amount
    }
    return acc
  }, {})
}

export const validateTiers = (tiers: TierDefinition[]): string[] => {
  const errors: string[] = []

  if (!tiers.length) {
    return ["At least one tier is required."]
  }

  tiers.forEach((tier, index) => {
    if (!Number.isInteger(tier.min_quantity) || tier.min_quantity < 1) {
      errors.push(`Tier ${index + 1}: min_quantity must be an integer >= 1.`)
    }

    if (tier.max_quantity !== null) {
      if (!Number.isInteger(tier.max_quantity) || tier.max_quantity < tier.min_quantity) {
        errors.push(`Tier ${index + 1}: max_quantity must be null or >= min_quantity.`)
      }
    }

    if (!Number.isFinite(tier.multiplier) || tier.multiplier <= 0) {
      errors.push(`Tier ${index + 1}: multiplier must be positive.`)
    }

    if (tier.max_quantity === null && index !== tiers.length - 1) {
      errors.push(`Tier ${index + 1}: only last tier can be open-ended.`)
    }

    if (index > 0) {
      const prev = tiers[index - 1]
      if (prev.max_quantity !== null && tier.min_quantity <= prev.max_quantity) {
        errors.push(`Tier ${index + 1}: min_quantity overlaps previous tier.`)
      }
    }
  })

  return errors
}

export const isMultiplierTemplateTier = (
  tier: TemplateTierDefinition
): tier is MultiplierTierDefinition => "multiplier" in tier

export const isAbsoluteTemplateTier = (
  tier: TemplateTierDefinition
): tier is AbsoluteTierDefinition => "amounts_by_currency" in tier

export const detectTemplateTierMode = (
  tiers: TemplateTierDefinition[]
): TemplateTierMode | null => {
  if (!tiers.length) {
    return null
  }

  const allMultiplier = tiers.every(isMultiplierTemplateTier)
  if (allMultiplier) {
    return "multiplier"
  }

  return "absolute"
}

const haveSameCurrencySet = (tiers: TemplateTierDefinition[]) => {
  const absoluteTiers = tiers.filter(isAbsoluteTemplateTier)
  if (!absoluteTiers.length) {
    return true
  }

  const first = Object.keys(absoluteTiers[0].amounts_by_currency || {}).sort().join(",")
  return absoluteTiers.every(
    (tier) => Object.keys(tier.amounts_by_currency || {}).sort().join(",") === first
  )
}

export const validateTemplateTiers = (tiers: TemplateTierDefinition[]): string[] => {
  const errors: string[] = []

  if (!tiers.length) {
    return ["At least one tier is required."]
  }

  const mode = detectTemplateTierMode(tiers)
  if (!mode) {
    return ["Tier mode is invalid."]
  }

  tiers.forEach((tier, index) => {
    if (!Number.isInteger(tier.min_quantity) || tier.min_quantity < 1) {
      errors.push(`Tier ${index + 1}: min_quantity must be an integer >= 1.`)
    }

    if (tier.max_quantity !== null) {
      if (!Number.isInteger(tier.max_quantity) || tier.max_quantity < tier.min_quantity) {
        errors.push(`Tier ${index + 1}: max_quantity must be null or >= min_quantity.`)
      }
    }

    if (mode === "multiplier") {
      if (!isMultiplierTemplateTier(tier)) {
        errors.push(`Tier ${index + 1}: mixed tier modes are not allowed.`)
      } else if (!Number.isFinite(tier.multiplier) || tier.multiplier <= 0) {
        errors.push(`Tier ${index + 1}: multiplier must be positive.`)
      }
    } else {
      if (isMultiplierTemplateTier(tier)) {
        errors.push(`Tier ${index + 1}: mixed tier modes are not allowed.`)
      } else {
        const amounts = Object.values(tier.amounts_by_currency || {})
        if (!amounts.length || amounts.some((amount) => !Number.isFinite(amount) || amount <= 0)) {
          errors.push(`Tier ${index + 1}: all currency amounts must be positive.`)
        }
      }
    }

    if (tier.max_quantity === null && index !== tiers.length - 1) {
      errors.push(`Tier ${index + 1}: only last tier can be open-ended.`)
    }

    if (index > 0) {
      const prev = tiers[index - 1]
      if (prev.max_quantity !== null && tier.min_quantity <= prev.max_quantity) {
        errors.push(`Tier ${index + 1}: min_quantity overlaps previous tier.`)
      }
    }
  })

  if (mode === "absolute" && !haveSameCurrencySet(tiers)) {
    errors.push("All absolute tiers must define the same currency set.")
  }

  return errors
}

export const buildPreview = ({
  base,
  tiers,
  currency,
}: {
  base: number
  tiers: TierDefinition[]
  currency: string
}) => {
  return tiers.map((tier) => ({
    currency,
    amount: Math.max(1, Math.round(base * tier.multiplier)),
    min_quantity: tier.min_quantity,
    max_quantity: tier.max_quantity,
  }))
}

export const toggleSelection = (current: Set<string>, id: string, checked: boolean) => {
  const next = new Set(current)
  if (checked) {
    next.add(id)
  } else {
    next.delete(id)
  }
  return next
}

export const toggleSelectionForMany = (
  current: Set<string>,
  ids: string[],
  checked: boolean
) => {
  const next = new Set(current)
  for (const id of ids) {
    if (checked) {
      next.add(id)
    } else {
      next.delete(id)
    }
  }
  return next
}

export const applyTemplateDefaultsToTier1Inputs = ({
  currentInputs,
  selectedVariantIds,
  defaults,
}: {
  currentInputs: Tier1InputMap
  selectedVariantIds: Set<string>
  defaults: Record<string, string>
}) => {
  const next = { ...currentInputs }

  for (const variantId of selectedVariantIds) {
    next[variantId] = {
      ...(next[variantId] || {}),
      ...defaults,
    }
  }

  return next
}

export const buildApplyPayload = ({
  selectedVariants,
  tier1Inputs,
  tiers,
  templateId,
}: {
  selectedVariants: PriceControlVariant[]
  tier1Inputs: Tier1InputMap
  tiers: TemplateTierDefinition[]
  templateId?: string
}): ApplyPricingPayload => {
  const variants = selectedVariants
    .map((variant) => ({
      variant_id: variant.variant_id,
      tier1_by_currency: parsePositiveNumberMap(tier1Inputs[variant.variant_id] || {}),
    }))
    .filter((variant) => Object.keys(variant.tier1_by_currency).length > 0)

  return {
    variants,
    tiers,
    template_id: templateId || undefined,
    mode: "replace_all_tiers",
  }
}

export const resolveAuthRedirect = ({
  isLoading,
  isAuthenticated,
}: {
  isLoading: boolean
  isAuthenticated: boolean
}) => {
  if (isLoading) {
    return null
  }

  return isAuthenticated ? "/price-control" : "/login"
}
