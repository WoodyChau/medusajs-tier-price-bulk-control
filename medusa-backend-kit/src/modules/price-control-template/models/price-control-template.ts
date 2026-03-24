import { model } from "@medusajs/framework/utils"

export const PriceControlTemplate = model.define("price_control_template", {
  id: model.id().primaryKey(),
  name: model.text(),
  tiers: model.json(),
  default_tier1_by_currency: model.json(),
  created_by: model.text().nullable(),
  updated_by: model.text().nullable(),
})

export default PriceControlTemplate
