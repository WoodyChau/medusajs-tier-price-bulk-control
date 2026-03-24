import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  PRICE_CONTROL_TEMPLATE_MODULE,
} from "../../../../modules/price-control-template"
import PriceControlTemplateModuleService from "../../../../modules/price-control-template/service"
import {
  getTierMode,
  normalizeTierDefinitions,
  normalizeTier1ByCurrency,
  validateTierDefinitions,
} from "../logic"

type TemplateBody = {
  name: string
  tiers: unknown
  default_tier1_by_currency: Record<string, unknown>
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

  const templates = await templateService.listPriceControlTemplates()

  const sortedTemplates = [...templates].sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime()
    const bTime = new Date(b.created_at || 0).getTime()
    return bTime - aTime
  })

  res.json({ templates: sortedTemplates.map(serializeTemplate) })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<TemplateBody>,
  res: MedusaResponse
) => {
  const templateService: PriceControlTemplateModuleService =
    req.scope.resolve(PRICE_CONTROL_TEMPLATE_MODULE)

  const body = req.validatedBody as TemplateBody

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

  const defaultTier1ByCurrency = normalizeTier1ByCurrency(
    body.default_tier1_by_currency
  )

  if (tierMode === "multiplier" && !Object.keys(defaultTier1ByCurrency).length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "default_tier1_by_currency must include at least one positive amount."
    )
  }

  try {
    const template = await templateService.createPriceControlTemplates({
      name: body.name.trim(),
      tiers: encodeTiers(tiers),
      default_tier1_by_currency: defaultTier1ByCurrency,
      created_by: req.auth_context?.actor_id || null,
      updated_by: req.auth_context?.actor_id || null,
    })

    res.status(201).json({ template: serializeTemplate(template) })
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
