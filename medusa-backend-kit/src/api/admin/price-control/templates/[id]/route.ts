import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  PRICE_CONTROL_TEMPLATE_MODULE,
} from "../../../../../modules/price-control-template"
import PriceControlTemplateModuleService from "../../../../../modules/price-control-template/service"
import {
  getTierMode,
  normalizeTierDefinitions,
  normalizeTier1ByCurrency,
  validateTierDefinitions,
} from "../../logic"

type UpdateTemplateBody = {
  name?: string
  tiers?: unknown
  default_tier1_by_currency?: Record<string, unknown>
}

const encodeTiers = (tiers: unknown) => ({ rows: normalizeTierDefinitions(tiers) })

const decodeTiers = (stored: unknown) => {
  const storedValue = stored as { rows?: unknown }
  return normalizeTierDefinitions(storedValue?.rows ?? stored)
}

const serializeTemplate = (template: any) => {
  const tiers = decodeTiers(template?.tiers)
  const tierMode = getTierMode(tiers)

  return {
    id: template.id,
    name: template.name,
    tiers,
    tier_mode: tierMode || "multiplier",
    default_tier1_by_currency: normalizeTier1ByCurrency(
      template?.default_tier1_by_currency
    ),
    created_by: template.created_by || null,
    updated_by: template.updated_by || null,
    created_at: template.created_at,
    updated_at: template.updated_at,
  }
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const templateService: PriceControlTemplateModuleService =
    req.scope.resolve(PRICE_CONTROL_TEMPLATE_MODULE)

  const template = await templateService.retrievePriceControlTemplate(req.params.id)

  res.json({ template: serializeTemplate(template) })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<UpdateTemplateBody>,
  res: MedusaResponse
) => {
  const templateService: PriceControlTemplateModuleService =
    req.scope.resolve(PRICE_CONTROL_TEMPLATE_MODULE)

  const existingTemplate = await templateService.retrievePriceControlTemplate(req.params.id)
  const body = req.validatedBody as UpdateTemplateBody

  const updateData: Record<string, unknown> = {
    id: req.params.id,
    updated_by: req.auth_context?.actor_id || null,
  }

  const existingTiers = decodeTiers(existingTemplate?.tiers)
  const normalizedExistingDefaults = normalizeTier1ByCurrency(
    existingTemplate?.default_tier1_by_currency
  )

  let nextTiers = existingTiers
  let nextTierMode = getTierMode(existingTiers)
  let nextDefaults = normalizedExistingDefaults

  if (body.name !== undefined) {
    updateData.name = body.name.trim()
  }

  if (body.tiers !== undefined) {
    const tiers = normalizeTierDefinitions(body.tiers)
    const tierErrors = validateTierDefinitions(tiers)

    if (tierErrors.length) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, tierErrors.join(" "))
    }

    nextTiers = tiers
    nextTierMode = getTierMode(tiers)
    updateData.tiers = encodeTiers(tiers)
  }

  if (body.default_tier1_by_currency !== undefined) {
    const defaultTier1ByCurrency = normalizeTier1ByCurrency(
      body.default_tier1_by_currency
    )
    nextDefaults = defaultTier1ByCurrency
    updateData.default_tier1_by_currency = defaultTier1ByCurrency
  }

  const effectiveTierMode = getTierMode(nextTiers) || nextTierMode
  if (effectiveTierMode === "multiplier" && !Object.keys(nextDefaults).length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "default_tier1_by_currency must include at least one positive amount."
    )
  }

  try {
    const template = await templateService.updatePriceControlTemplates(updateData)

    res.json({ template: serializeTemplate(template) })
  } catch (error: any) {
    const message = String(error?.message || "")

    if (message.toLowerCase().includes("unique")) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A template with this name already exists."
      )
    }

    throw error
  }
}

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const templateService: PriceControlTemplateModuleService =
    req.scope.resolve(PRICE_CONTROL_TEMPLATE_MODULE)

  await templateService.deletePriceControlTemplates(req.params.id)

  res.json({
    id: req.params.id,
    object: "price_control_template",
    deleted: true,
  })
}
