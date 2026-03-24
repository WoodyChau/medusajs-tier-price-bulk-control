import { Module } from "@medusajs/framework/utils"
import PriceControlTemplateModuleService from "./service"

export const PRICE_CONTROL_TEMPLATE_MODULE = "price_control_template"

export default Module(PRICE_CONTROL_TEMPLATE_MODULE, {
  service: PriceControlTemplateModuleService,
})
