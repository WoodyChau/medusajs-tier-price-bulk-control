import { sdk } from "@/lib/sdk"
import type {
  ApplyPricingPayload,
  ApplyPricingResponse,
  PriceControlTemplate,
  PriceControlTemplatesResponse,
  PriceControlVariantsResponse,
  TemplateTierDefinition,
} from "@/lib/types"

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE"
  query?: Record<string, string | number | boolean | undefined>
  body?: Record<string, unknown>
}

const adminRequest = async <T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> => {
  return sdk.client.fetch<T>(`/admin/price-control${path}`, {
    method: options.method || "GET",
    ...(options.query ? { query: options.query } : {}),
    ...(options.body ? { body: options.body } : {}),
  })
}

export const getCurrencies = async (): Promise<string[]> => {
  const response = await adminRequest<{ currencies: string[] }>("/currencies")
  return response.currencies || []
}

export const getVariants = async (params: {
  q?: string
  product_id?: string
  limit?: number
  offset?: number
}): Promise<PriceControlVariantsResponse> => {
  return adminRequest<PriceControlVariantsResponse>("/variants", {
    query: {
      q: params.q,
      product_id: params.product_id,
      limit: params.limit,
      offset: params.offset,
    },
  })
}

export const listTemplates = async (): Promise<PriceControlTemplate[]> => {
  const response = await adminRequest<PriceControlTemplatesResponse>("/templates")
  return response.templates || []
}

export const createTemplate = async (input: {
  name: string
  tiers: TemplateTierDefinition[]
  default_tier1_by_currency: Record<string, number>
}): Promise<PriceControlTemplate> => {
  const response = await adminRequest<{ template: PriceControlTemplate }>("/templates", {
    method: "POST",
    body: input,
  })

  return response.template
}

export const updateTemplate = async (
  id: string,
  input: {
    name?: string
    tiers?: TemplateTierDefinition[]
    default_tier1_by_currency?: Record<string, number>
  }
): Promise<PriceControlTemplate> => {
  const response = await adminRequest<{ template: PriceControlTemplate }>(`/templates/${id}`, {
    method: "POST",
    body: input,
  })

  return response.template
}

export const deleteTemplate = async (id: string): Promise<void> => {
  await adminRequest(`/templates/${id}`, {
    method: "DELETE",
  })
}

export const applyPricing = async (
  payload: ApplyPricingPayload
): Promise<ApplyPricingResponse> => {
  return adminRequest<ApplyPricingResponse>("/apply", {
    method: "POST",
    body: payload,
  })
}
