import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
  })

  const currencies = Array.from(
    new Set(
      (regions || [])
        .map((region: any) => String(region?.currency_code || "").toLowerCase())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b))

  res.json({ currencies })
}
