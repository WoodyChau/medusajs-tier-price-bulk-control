import {
  MiddlewareRoute,
  authenticate,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { z } from "zod"

const MultiplierTierDefinitionSchema = z.object({
  min_quantity: z.coerce.number().int().min(1),
  max_quantity: z.union([z.coerce.number().int().min(1), z.null()]),
  multiplier: z.coerce.number().positive(),
})

const AbsoluteTierDefinitionSchema = z.object({
  min_quantity: z.coerce.number().int().min(1),
  max_quantity: z.union([z.coerce.number().int().min(1), z.null()]),
  amounts_by_currency: z.record(z.coerce.number().positive()),
})

const TierDefinitionSchema = z.union([
  MultiplierTierDefinitionSchema,
  AbsoluteTierDefinitionSchema,
])

const Tier1ByCurrencySchema = z.record(z.coerce.number().positive())

const GetVariantsQuerySchema = z.object({
  q: z.string().trim().optional(),
  product_id: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})

const CreateTemplateSchema = z.object({
  name: z.string().trim().min(1),
  tiers: z.array(TierDefinitionSchema).min(1),
  default_tier1_by_currency: Tier1ByCurrencySchema,
})

const UpdateTemplateSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    tiers: z.array(TierDefinitionSchema).min(1).optional(),
    default_tier1_by_currency: Tier1ByCurrencySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  })

const ApplyPricingSchema = z.object({
  variants: z.array(
    z.object({
      variant_id: z.string().trim().min(1),
      tier1_by_currency: Tier1ByCurrencySchema.optional().default({}),
    })
  ).min(1),
  tiers: z.array(TierDefinitionSchema).min(1),
  template_id: z.string().trim().optional(),
  mode: z.literal("replace_all_tiers"),
})

export const adminPriceControlMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/price-control/currencies",
    methods: ["GET"],
    middlewares: [authenticate("user", ["bearer", "session"])],
  },
  {
    matcher: "/admin/price-control/variants",
    methods: ["GET"],
    middlewares: [
      authenticate("user", ["bearer", "session"]),
      validateAndTransformQuery(GetVariantsQuerySchema, {
        defaults: [],
        isList: true,
      }),
    ],
  },
  {
    matcher: "/admin/price-control/templates",
    methods: ["GET"],
    middlewares: [authenticate("user", ["bearer", "session"])],
  },
  {
    matcher: "/admin/price-control/templates",
    methods: ["POST"],
    middlewares: [
      authenticate("user", ["bearer", "session"]),
      validateAndTransformBody(CreateTemplateSchema),
    ],
  },
  {
    matcher: "/admin/price-control/templates/:id",
    methods: ["GET"],
    middlewares: [authenticate("user", ["bearer", "session"])],
  },
  {
    matcher: "/admin/price-control/templates/:id",
    methods: ["POST"],
    middlewares: [
      authenticate("user", ["bearer", "session"]),
      validateAndTransformBody(UpdateTemplateSchema),
    ],
  },
  {
    matcher: "/admin/price-control/templates/:id",
    methods: ["DELETE"],
    middlewares: [authenticate("user", ["bearer", "session"])],
  },
  {
    matcher: "/admin/price-control/apply",
    methods: ["POST"],
    middlewares: [
      authenticate("user", ["bearer", "session"]),
      validateAndTransformBody(ApplyPricingSchema),
    ],
  },
]
