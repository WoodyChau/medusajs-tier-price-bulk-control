import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { deriveTier1ByCurrency } from "../logic"

type TierAmountView = {
  price_id: string
  amount: number
  currency_code: string
  min_quantity: number
  max_quantity: number | null
}

const toInteger = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null
  }

  if (typeof value === "object") {
    const objectValue = value as { value?: unknown; numeric?: unknown }
    if (objectValue.value !== undefined) {
      return toInteger(objectValue.value)
    }
    if (objectValue.numeric !== undefined) {
      return toInteger(objectValue.numeric)
    }
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return null
  }

  return Math.trunc(numeric)
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null
  }

  if (typeof value === "object") {
    const objectValue = value as { value?: unknown; numeric?: unknown }
    if (objectValue.value !== undefined) {
      return toNumber(objectValue.value)
    }
    if (objectValue.numeric !== undefined) {
      return toNumber(objectValue.numeric)
    }
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return null
  }

  return numeric
}

const sortTierRows = (a: TierAmountView, b: TierAmountView) => {
  if (a.min_quantity !== b.min_quantity) {
    return a.min_quantity - b.min_quantity
  }

  if (a.max_quantity === null && b.max_quantity === null) {
    return 0
  }

  if (a.max_quantity === null) {
    return 1
  }

  if (b.max_quantity === null) {
    return -1
  }

  return a.max_quantity - b.max_quantity
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const pricingModuleService = req.scope.resolve(Modules.PRICING) as any

  const validatedQuery = (req.validatedQuery || req.query || {}) as {
    q?: string
    product_id?: string
    limit?: number
    offset?: number
  }

  const q = (validatedQuery.q || "").trim().toLowerCase()
  const productId = (validatedQuery.product_id || "").trim()
  const limit = Math.min(Math.max(Number(validatedQuery.limit) || 25, 1), 200)
  const offset = Math.max(Number(validatedQuery.offset) || 0, 0)

  const filters: Record<string, unknown> = {}
  if (productId) {
    filters.product_id = productId
  }

  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "title",
      "sku",
      "product_id",
      "product.id",
      "product.title",
      "product.thumbnail",
      "product.images.url",
    ],
    filters,
  })

  const filteredVariants = (variants || []).filter((variant: any) => {
    if (!q) {
      return true
    }

    const variantTitle = String(variant?.title || "").toLowerCase()
    const sku = String(variant?.sku || "").toLowerCase()
    const productTitle = String(variant?.product?.title || "").toLowerCase()

    return variantTitle.includes(q) || sku.includes(q) || productTitle.includes(q)
  })

  const count = filteredVariants.length
  const pagedVariants = filteredVariants.slice(offset, offset + limit)

  const variantIds = pagedVariants
    .map((variant: any) => variant?.id)
    .filter((id: unknown): id is string => Boolean(id))

  const tiersByVariantId = new Map<string, Record<string, TierAmountView[]>>()

  if (variantIds.length) {
    const { data: links } = await query.graph({
      entity: "product_variant_price_set",
      fields: ["variant_id", "price_set_id"],
      filters: { variant_id: variantIds },
    })

    const priceSetByVariantId = new Map<string, string>()
    const priceSetIds = new Set<string>()

    for (const link of links as any[]) {
      if (!link?.variant_id || !link?.price_set_id) {
        continue
      }

      priceSetByVariantId.set(link.variant_id, link.price_set_id)
      priceSetIds.add(link.price_set_id)
    }

    const priceRows = priceSetIds.size
      ? await pricingModuleService.listPrices(
          { price_set_id: [...priceSetIds] },
          {
            select: [
              "id",
              "price_set_id",
              "currency_code",
              "amount",
              "min_quantity",
              "max_quantity",
              "price_list_id",
            ],
            take: 5000,
          }
        )
      : []

    const rowsByPriceSetId = new Map<string, any[]>()

    for (const row of priceRows as any[]) {
      if (!row?.price_set_id) {
        continue
      }

      if (row.price_list_id) {
        continue
      }

      if (!rowsByPriceSetId.has(row.price_set_id)) {
        rowsByPriceSetId.set(row.price_set_id, [])
      }

      rowsByPriceSetId.get(row.price_set_id)?.push(row)
    }

    for (const variantId of variantIds) {
      const priceSetId = priceSetByVariantId.get(variantId)
      if (!priceSetId) {
        tiersByVariantId.set(variantId, {})
        continue
      }

      const rows = rowsByPriceSetId.get(priceSetId) || []
      const tiersByCurrency: Record<string, TierAmountView[]> = {}

      for (const row of rows) {
        const currencyCode = String(row.currency_code || "").toLowerCase()
        const amount = toNumber(row.amount)
        const minQuantity = toInteger(row.min_quantity)
        const maxQuantityRaw = row.max_quantity
        const maxQuantity = maxQuantityRaw === null || maxQuantityRaw === undefined
          ? null
          : toInteger(maxQuantityRaw)

        if (!currencyCode || amount === null || minQuantity === null) {
          continue
        }

        if (!tiersByCurrency[currencyCode]) {
          tiersByCurrency[currencyCode] = []
        }

        tiersByCurrency[currencyCode].push({
          price_id: String(row.id || ""),
          amount,
          currency_code: currencyCode,
          min_quantity: minQuantity,
          max_quantity: maxQuantity,
        })
      }

      for (const currencyCode of Object.keys(tiersByCurrency)) {
        tiersByCurrency[currencyCode].sort(sortTierRows)
      }

      tiersByVariantId.set(variantId, tiersByCurrency)
    }
  }

  const items = pagedVariants.map((variant: any) => {
    const variantId = String(variant.id)
    const tiersByCurrency = tiersByVariantId.get(variantId) || {}
    const productThumbnail = typeof variant?.product?.thumbnail === "string"
      && variant.product.thumbnail.trim()
      ? variant.product.thumbnail
      : (
        Array.isArray(variant?.product?.images)
          ? String(variant.product.images.find((image: any) => image?.url)?.url || "")
          : ""
      )

    return {
      variant_id: variantId,
      variant_title: variant.title || null,
      sku: variant.sku || null,
      product_id: variant.product_id || variant.product?.id || null,
      product_title: variant.product?.title || null,
      product_thumbnail: productThumbnail || null,
      tier1_by_currency: deriveTier1ByCurrency(tiersByCurrency),
      tiers_by_currency: tiersByCurrency,
    }
  })

  res.json({
    variants: items,
    count,
    limit,
    offset,
  })
}
