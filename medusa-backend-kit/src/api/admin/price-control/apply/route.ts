import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  buildAbsoluteTierPrices,
  buildComputedTierPrices,
  getTierMode,
  isAbsoluteTierDefinition,
  isMultiplierTierDefinition,
  listAbsoluteTierCurrencies,
  normalizeTierDefinitions,
  normalizeTier1ByCurrency,
  selectReplaceAllRemovablePriceIds,
  validateTierDefinitions,
} from "../logic"

type ApplyVariantInput = {
  variant_id: string
  tier1_by_currency: Record<string, unknown>
}

type ApplyRequestBody = {
  variants: ApplyVariantInput[]
  tiers: unknown
  template_id?: string
  mode: "replace_all_tiers"
}

const normalizeErrorMessage = (error: unknown): string => {
  if (!error) {
    return "Unknown error"
  }

  if (error instanceof Error) {
    return error.message || "Unknown error"
  }

  return String(error)
}

export const POST = async (
  req: AuthenticatedMedusaRequest<ApplyRequestBody>,
  res: MedusaResponse
) => {
  const body = req.validatedBody as ApplyRequestBody

  if (body.mode !== "replace_all_tiers") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Only mode=replace_all_tiers is supported."
    )
  }

  const tiers = normalizeTierDefinitions(body.tiers)
  const tierErrors = validateTierDefinitions(tiers)
  if (tierErrors.length) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, tierErrors.join(" "))
  }

  const tierMode = getTierMode(tiers)
  if (!tierMode) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "All tiers must use a single mode: multiplier or absolute."
    )
  }

  const absoluteTiers = tiers.filter(isAbsoluteTierDefinition)
  const absoluteCurrencies =
    tierMode === "absolute" ? listAbsoluteTierCurrencies(absoluteTiers) : []

  const variantInputs = Array.from(
    body.variants.reduce<Map<string, ApplyVariantInput>>((acc, item) => {
      const variantId = String(item?.variant_id || "").trim()
      if (!variantId) {
        return acc
      }

      acc.set(variantId, {
        variant_id: variantId,
        tier1_by_currency: normalizeTier1ByCurrency(item?.tier1_by_currency),
      })
      return acc
    }, new Map()).values()
  )

  if (!variantInputs.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "At least one variant is required."
    )
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const pricingModuleService = req.scope.resolve(Modules.PRICING) as any

  const variantIds = variantInputs.map((variant) => variant.variant_id)

  const { data: links } = await query.graph({
    entity: "product_variant_price_set",
    fields: ["variant_id", "price_set_id"],
    filters: { variant_id: variantIds },
  })

  const priceSetByVariantId = new Map<string, string>()
  for (const link of links as any[]) {
    if (!link?.variant_id || !link?.price_set_id) {
      continue
    }

    priceSetByVariantId.set(link.variant_id, link.price_set_id)
  }

  const failed: Array<{ variant_id: string; reason: string }> = []
  let updatedCount = 0

  for (const variantInput of variantInputs) {
    const variantId = variantInput.variant_id
    const priceSetId = priceSetByVariantId.get(variantId)

    if (!priceSetId) {
      failed.push({
        variant_id: variantId,
        reason: "No price set found for variant.",
      })
      continue
    }

    let currencies: string[] = []
    let pricesToCreate: any[] = []

    if (tierMode === "multiplier") {
      const multiplierTiers = tiers.filter(isMultiplierTierDefinition)
      const tier1ByCurrency = normalizeTier1ByCurrency(
        variantInput.tier1_by_currency
      )
      currencies = Object.keys(tier1ByCurrency)

      if (!currencies.length) {
        failed.push({
          variant_id: variantId,
          reason: "tier1_by_currency must include at least one positive amount.",
        })
        continue
      }

      pricesToCreate = currencies.flatMap((currency) =>
        buildComputedTierPrices({
          tier1Amount: tier1ByCurrency[currency],
          tiers: multiplierTiers,
          currencyCode: currency,
        })
      )
    } else {
      currencies = absoluteCurrencies

      if (!currencies.length) {
        failed.push({
          variant_id: variantId,
          reason: "Absolute tiers must include at least one currency.",
        })
        continue
      }

      pricesToCreate = buildAbsoluteTierPrices({
        tiers: absoluteTiers,
      })
    }

    try {
      const existingPrices = await pricingModuleService.listPrices(
        {
          price_set_id: [priceSetId],
          currency_code: currencies,
        },
        {
          select: ["id", "currency_code", "price_list_id"],
          take: 2000,
        }
      )

      const removablePriceIds = selectReplaceAllRemovablePriceIds(
        existingPrices as any[],
        currencies
      )

      if (removablePriceIds.length) {
        await pricingModuleService.removePrices(removablePriceIds)
      }

      await pricingModuleService.addPrices({
        priceSetId,
        prices: pricesToCreate,
      })

      updatedCount += 1
    } catch (error) {
      failed.push({
        variant_id: variantId,
        reason: normalizeErrorMessage(error),
      })
    }
  }

  res.json({
    updated_count: updatedCount,
    failed,
  })
}
