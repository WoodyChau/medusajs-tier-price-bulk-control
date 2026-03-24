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

export type TemplateTierDefinition = MultiplierTierDefinition | AbsoluteTierDefinition
export type TemplateTierMode = "multiplier" | "absolute"

export type TierDefinition = MultiplierTierDefinition

export type TierPrice = {
  price_id: string
  amount: number
  currency_code: string
  min_quantity: number
  max_quantity: number | null
}

export type PriceControlVariant = {
  variant_id: string
  variant_title: string | null
  sku: string | null
  product_id: string | null
  product_title: string | null
  product_thumbnail: string | null
  tier1_by_currency: Record<string, number>
  tiers_by_currency: Record<string, TierPrice[]>
}

export type PriceControlVariantsResponse = {
  variants: PriceControlVariant[]
  count: number
  limit: number
  offset: number
}

export type PriceControlTemplate = {
  id: string
  name: string
  tiers: TemplateTierDefinition[]
  tier_mode: TemplateTierMode
  default_tier1_by_currency: Record<string, number>
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type PriceControlTemplatesResponse = {
  templates: PriceControlTemplate[]
}

export type ApplyPricingPayload = {
  variants: Array<{
    variant_id: string
    tier1_by_currency: Record<string, number>
  }>
  tiers: TemplateTierDefinition[]
  template_id?: string
  mode: "replace_all_tiers"
}

export type ApplyPricingResponse = {
  updated_count: number
  failed: Array<{
    variant_id: string
    reason: string
  }>
}
