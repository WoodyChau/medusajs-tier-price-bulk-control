import { MedusaService } from "@medusajs/framework/utils"
import { PriceControlTemplate } from "./models/price-control-template"

class PriceControlTemplateModuleService extends MedusaService({
  PriceControlTemplate,
}) {}

export default PriceControlTemplateModuleService
