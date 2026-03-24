import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { POST as applyPricingRoute } from "../apply/route"
import { GET as variantsRoute } from "../variants/route"
import { GET as listTemplatesRoute, POST as createTemplateRoute } from "../templates/route"
import {
  DELETE as deleteTemplateRoute,
  GET as getTemplateRoute,
  POST as updateTemplateRoute,
} from "../templates/[id]/route"
import { PRICE_CONTROL_TEMPLATE_MODULE } from "../../../../modules/price-control-template"

type MockRes = {
  statusCode: number
  body: any
  status: (code: number) => MockRes
  json: (payload: any) => MockRes
}

const createMockRes = (): MockRes => {
  const res: MockRes = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: any) {
      this.body = payload
      return this
    },
  }

  return res
}

const createTemplateService = () => {
  let counter = 0
  const templates = new Map<string, any>()

  return {
    async listPriceControlTemplates() {
      return [...templates.values()]
    },

    async createPriceControlTemplates(input: any) {
      counter += 1
      const id = `pct_${counter}`
      const now = new Date().toISOString()
      const row = {
        id,
        name: input.name,
        tiers: input.tiers,
        default_tier1_by_currency: input.default_tier1_by_currency,
        created_by: input.created_by ?? null,
        updated_by: input.updated_by ?? null,
        created_at: now,
        updated_at: now,
      }
      templates.set(id, row)
      return row
    },

    async retrievePriceControlTemplate(id: string) {
      const row = templates.get(id)
      if (!row) {
        throw new Error("Template not found")
      }
      return row
    },

    async updatePriceControlTemplates(input: any) {
      const current = templates.get(input.id)
      if (!current) {
        throw new Error("Template not found")
      }

      const next = {
        ...current,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.tiers !== undefined ? { tiers: input.tiers } : {}),
        ...(input.default_tier1_by_currency !== undefined
          ? { default_tier1_by_currency: input.default_tier1_by_currency }
          : {}),
        ...(input.updated_by !== undefined ? { updated_by: input.updated_by } : {}),
        updated_at: new Date().toISOString(),
      }

      templates.set(input.id, next)
      return next
    },

    async deletePriceControlTemplates(id: string) {
      templates.delete(id)
    },
  }
}

describe("price-control routes", () => {
  it("supports template CRUD lifecycle", async () => {
    const templateService = createTemplateService()

    const createReq: any = {
      validatedBody: {
        name: "Notebook Template",
        tiers: [
          { min_quantity: 1, max_quantity: 10, multiplier: 1 },
          { min_quantity: 11, max_quantity: null, multiplier: 0.5 },
        ],
        default_tier1_by_currency: { usd: 1000, eur: 900 },
      },
      auth_context: {
        actor_id: "user_1",
      },
      scope: {
        resolve: (key: string) => {
          if (key === PRICE_CONTROL_TEMPLATE_MODULE) {
            return templateService
          }

          return null
        },
      },
    }
    const createRes = createMockRes()

    await createTemplateRoute(createReq, createRes as any)

    expect(createRes.statusCode).toBe(201)
    expect(createRes.body.template.name).toBe("Notebook Template")
    expect(createRes.body.template.tiers).toHaveLength(2)
    expect(createRes.body.template.tier_mode).toBe("multiplier")

    const createdId = createRes.body.template.id as string

    const listReq: any = {
      scope: createReq.scope,
    }
    const listRes = createMockRes()
    await listTemplatesRoute(listReq, listRes as any)
    expect(listRes.body.templates).toHaveLength(1)

    const updateReq: any = {
      params: { id: createdId },
      validatedBody: {
        name: "Notebook Template Updated",
        default_tier1_by_currency: { usd: 1100 },
      },
      auth_context: { actor_id: "user_2" },
      scope: createReq.scope,
    }
    const updateRes = createMockRes()
    await updateTemplateRoute(updateReq, updateRes as any)
    expect(updateRes.body.template.name).toBe("Notebook Template Updated")
    expect(updateRes.body.template.updated_by).toBe("user_2")

    const getReq: any = {
      params: { id: createdId },
      scope: createReq.scope,
    }
    const getRes = createMockRes()
    await getTemplateRoute(getReq, getRes as any)
    expect(getRes.body.template.id).toBe(createdId)

    const deleteReq: any = {
      params: { id: createdId },
      scope: createReq.scope,
    }
    const deleteRes = createMockRes()
    await deleteTemplateRoute(deleteReq, deleteRes as any)
    expect(deleteRes.body.deleted).toBe(true)

    const listResAfterDelete = createMockRes()
    await listTemplatesRoute(listReq, listResAfterDelete as any)
    expect(listResAfterDelete.body.templates).toHaveLength(0)
  })

  it("returns variants payload with tier1 and tier map hydration data", async () => {
    const query = {
      graph: async (input: any) => {
        if (input.entity === "product_variant") {
          return {
            data: [
              {
                id: "variant_1",
                title: "Blue Grid",
                sku: "NB-BLUE-GRID",
                product_id: "prod_1",
                product: {
                  id: "prod_1",
                  title: "Blue Notebook",
                  thumbnail: "https://example.com/blue-notebook.jpg",
                },
              },
            ],
          }
        }

        if (input.entity === "product_variant_price_set") {
          return {
            data: [{ variant_id: "variant_1", price_set_id: "ps_1" }],
          }
        }

        return { data: [] }
      },
    }

    const pricingModuleService = {
      async listPrices() {
        return [
          {
            id: "price_1",
            price_set_id: "ps_1",
            currency_code: "usd",
            amount: 1000,
            min_quantity: 1,
            max_quantity: 10,
            price_list_id: null,
          },
          {
            id: "price_2",
            price_set_id: "ps_1",
            currency_code: "usd",
            amount: 800,
            min_quantity: 11,
            max_quantity: null,
            price_list_id: null,
          },
          {
            id: "price_3",
            price_set_id: "ps_1",
            currency_code: "usd",
            amount: 500,
            min_quantity: 1,
            max_quantity: null,
            price_list_id: "plist_1",
          },
        ]
      },
    }

    const req: any = {
      validatedQuery: {
        q: "blue",
        limit: 25,
        offset: 0,
      },
      query: {},
      scope: {
        resolve: (key: string) => {
          if (key === ContainerRegistrationKeys.QUERY) {
            return query
          }
          if (key === Modules.PRICING) {
            return pricingModuleService
          }
          return null
        },
      },
    }

    const res = createMockRes()
    await variantsRoute(req, res as any)

    expect(res.body.count).toBe(1)
    expect(res.body.variants).toHaveLength(1)
    expect(res.body.variants[0]).toMatchObject({
      variant_id: "variant_1",
      product_id: "prod_1",
      product_thumbnail: "https://example.com/blue-notebook.jpg",
      tier1_by_currency: { usd: 1000 },
    })
    expect(res.body.variants[0].tiers_by_currency.usd).toHaveLength(2)
  })

  it("applies replace-all pricing and reports partial failures", async () => {
    const query = {
      graph: async () => ({
        data: [{ variant_id: "variant_1", price_set_id: "ps_1" }],
      }),
    }

    const removePrices = jest.fn(async () => undefined)
    const addPrices = jest.fn(async () => undefined)

    const pricingModuleService = {
      async listPrices() {
        return [
          {
            id: "price_old_1",
            currency_code: "usd",
            price_list_id: null,
          },
          {
            id: "price_old_2",
            currency_code: "usd",
            price_list_id: "plist_123",
          },
        ]
      },
      removePrices,
      addPrices,
    }

    const req: any = {
      validatedBody: {
        variants: [
          {
            variant_id: "variant_1",
            tier1_by_currency: { usd: 1000 },
          },
          {
            variant_id: "variant_missing",
            tier1_by_currency: { usd: 2000 },
          },
        ],
        tiers: [
          { min_quantity: 1, max_quantity: 10, multiplier: 1 },
          { min_quantity: 11, max_quantity: null, multiplier: 0.5 },
        ],
        mode: "replace_all_tiers",
      },
      scope: {
        resolve: (key: string) => {
          if (key === ContainerRegistrationKeys.QUERY) {
            return query
          }
          if (key === Modules.PRICING) {
            return pricingModuleService
          }
          return null
        },
      },
    }

    const res = createMockRes()
    await applyPricingRoute(req, res as any)

    expect(removePrices).toHaveBeenCalledWith(["price_old_1"])
    expect(addPrices).toHaveBeenCalledWith({
      priceSetId: "ps_1",
      prices: [
        {
          amount: 1000,
          currency_code: "usd",
          min_quantity: 1,
          max_quantity: 10,
        },
        {
          amount: 500,
          currency_code: "usd",
          min_quantity: 11,
          max_quantity: null,
        },
      ],
    })

    expect(res.body).toEqual({
      updated_count: 1,
      failed: [
        {
          variant_id: "variant_missing",
          reason: "No price set found for variant.",
        },
      ],
    })
  })

  it("applies absolute template pricing without tier1 payload", async () => {
    const query = {
      graph: async () => ({
        data: [{ variant_id: "variant_1", price_set_id: "ps_1" }],
      }),
    }

    const removePrices = jest.fn(async () => undefined)
    const addPrices = jest.fn(async () => undefined)

    const pricingModuleService = {
      async listPrices() {
        return [
          {
            id: "price_old_usd",
            currency_code: "usd",
            price_list_id: null,
          },
          {
            id: "price_old_hkd",
            currency_code: "hkd",
            price_list_id: null,
          },
        ]
      },
      removePrices,
      addPrices,
    }

    const req: any = {
      validatedBody: {
        variants: [
          {
            variant_id: "variant_1",
            tier1_by_currency: {},
          },
        ],
        tiers: [
          {
            min_quantity: 1,
            max_quantity: 10,
            amounts_by_currency: { usd: 1200, hkd: 9300 },
          },
          {
            min_quantity: 11,
            max_quantity: null,
            amounts_by_currency: { usd: 900, hkd: 7000 },
          },
        ],
        mode: "replace_all_tiers",
      },
      scope: {
        resolve: (key: string) => {
          if (key === ContainerRegistrationKeys.QUERY) {
            return query
          }
          if (key === Modules.PRICING) {
            return pricingModuleService
          }
          return null
        },
      },
    }

    const res = createMockRes()
    await applyPricingRoute(req, res as any)

    expect(removePrices).toHaveBeenCalledWith(["price_old_usd", "price_old_hkd"])
    expect(addPrices).toHaveBeenCalledWith({
      priceSetId: "ps_1",
      prices: [
        {
          amount: 1200,
          currency_code: "usd",
          min_quantity: 1,
          max_quantity: 10,
        },
        {
          amount: 9300,
          currency_code: "hkd",
          min_quantity: 1,
          max_quantity: 10,
        },
        {
          amount: 900,
          currency_code: "usd",
          min_quantity: 11,
          max_quantity: null,
        },
        {
          amount: 7000,
          currency_code: "hkd",
          min_quantity: 11,
          max_quantity: null,
        },
      ],
    })

    expect(res.body).toEqual({
      updated_count: 1,
      failed: [],
    })
  })
})
