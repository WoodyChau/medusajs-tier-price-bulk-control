import { Fragment, type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react"
import { applyPricing, createTemplate, deleteTemplate, getCurrencies, getVariants, listTemplates, updateTemplate } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import {
  applyTemplateDefaultsToTier1Inputs,
  buildApplyPayload,
  detectTemplateTierMode,
  isMultiplierTemplateTier,
  parsePositiveNumberMap,
  toggleSelection,
  toggleSelectionForMany,
  validateTiers,
  validateTemplateTiers,
  type Tier1InputMap,
} from "@/lib/price-control-utils"
import { toast } from "@/components/ui/toast"
import type {
  AbsoluteTierDefinition,
  MultiplierTierDefinition,
  PriceControlTemplate,
  PriceControlVariant,
  TemplateTierDefinition,
  TemplateTierMode,
  TierDefinition,
} from "@/lib/types"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const DEFAULT_TIERS: TierDefinition[] = [
  { min_quantity: 1, max_quantity: 50, multiplier: 1 },
  { min_quantity: 51, max_quantity: 100, multiplier: 0.5 },
  { min_quantity: 101, max_quantity: 250, multiplier: 0.45 },
  { min_quantity: 251, max_quantity: 500, multiplier: 0.4 },
  { min_quantity: 501, max_quantity: 1000, multiplier: 0.37 },
  { min_quantity: 1001, max_quantity: 3000, multiplier: 0.33 },
  { min_quantity: 3001, max_quantity: null, multiplier: 0.3 },
]

const DEFAULT_PAGE_LIMIT = 100

type VariantCatalog = Record<string, PriceControlVariant>
type DetailTierRowInput = {
  min_quantity: string
  max_quantity: string
  amounts_by_currency: Record<string, string>
}

type DetailMultiplierRowInput = {
  min_quantity: string
  max_quantity: string
  multiplier: string
}

const resolveCurrencyAmount = (map: Record<string, number>, currency: string) => {
  const value = map[currency]
    ?? map[currency.toLowerCase()]
    ?? map[currency.toUpperCase()]
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0
}

export function PriceControlPage() {
  const { logout } = useAuth()

  const [tab, setTab] = useState("bulk")
  const [currencies, setCurrencies] = useState<string[]>([])

  const [variants, setVariants] = useState<PriceControlVariant[]>([])
  const [count, setCount] = useState(0)
  const [offset, setOffset] = useState(0)
  const [pageLimit, setPageLimit] = useState(DEFAULT_PAGE_LIMIT)
  const [search, setSearch] = useState("")
  const [isVariantsLoading, setIsVariantsLoading] = useState(false)

  const [templates, setTemplates] = useState<PriceControlTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [templateName, setTemplateName] = useState("")
  const [templateDefaults, setTemplateDefaults] = useState<Record<string, string>>({})
  const [templateTierMode, setTemplateTierMode] = useState<TemplateTierMode>("multiplier")
  const [templateTiers, setTemplateTiers] = useState<TemplateTierDefinition[]>(DEFAULT_TIERS)

  const [tiers, setTiers] = useState<TierDefinition[]>(DEFAULT_TIERS)
  const [variantCatalog, setVariantCatalog] = useState<VariantCatalog>({})
  const [detachedTemplateVariantIds, setDetachedTemplateVariantIds] = useState<Set<string>>(new Set())
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set())
  const [tier1Inputs, setTier1Inputs] = useState<Tier1InputMap>({})

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [createTemplateName, setCreateTemplateName] = useState("")
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [detailVariantId, setDetailVariantId] = useState<string | null>(null)
  const [detailEditMode, setDetailEditMode] = useState<TemplateTierMode>("absolute")
  const [detailEditRows, setDetailEditRows] = useState<DetailTierRowInput[]>([])
  const [detailMultiplierRows, setDetailMultiplierRows] = useState<DetailMultiplierRowInput[]>([])
  const [detailTier1Inputs, setDetailTier1Inputs] = useState<Record<string, string>>({})
  const [isDetailSubmitting, setIsDetailSubmitting] = useState(false)

  const loadCurrencies = async () => {
    try {
      const values = await getCurrencies()
      setCurrencies(values)
    } catch (error: any) {
      toast.error(error?.message || "Failed to load currencies")
    }
  }

  const loadTemplates = async () => {
    try {
      const items = await listTemplates()
      setTemplates(items)
    } catch (error: any) {
      toast.error(error?.message || "Failed to load price templates")
    }
  }

  const loadVariants = async () => {
    setIsVariantsLoading(true)

    try {
      const response = await getVariants({
        q: search || undefined,
        limit: pageLimit,
        offset,
      })

      setVariants(response.variants)
      setCount(response.count)

      setVariantCatalog((prev) => {
        const next = { ...prev }
        for (const variant of response.variants) {
          next[variant.variant_id] = variant
        }
        return next
      })
    } catch (error: any) {
      toast.error(error?.message || "Failed to load variants")
    } finally {
      setIsVariantsLoading(false)
    }
  }

  useEffect(() => {
    loadCurrencies()
    loadTemplates()
  }, [])

  useEffect(() => {
    loadVariants()
  }, [search, offset, pageLimit])

  useEffect(() => {
    if (!currencies.length || !variants.length) {
      return
    }

    setTier1Inputs((prev) => {
      const next = { ...prev }

      for (const variant of variants) {
        if (!next[variant.variant_id]) {
          next[variant.variant_id] = {}
        }

        for (const currency of currencies) {
          if (next[variant.variant_id][currency] !== undefined) {
            continue
          }

          const value = variant.tier1_by_currency[currency]
          next[variant.variant_id][currency] = value ? String(value) : ""
        }
      }

      return next
    })

    setTemplateDefaults((prev) => {
      const next = { ...prev }
      for (const currency of currencies) {
        if (next[currency] === undefined) {
          next[currency] = ""
        }
      }
      return next
    })
  }, [currencies, variants])

  const templateById = useMemo(() => {
    return templates.reduce<Record<string, PriceControlTemplate>>((acc, template) => {
      acc[template.id] = template
      return acc
    }, {})
  }, [templates])

  const templateInUseByVariantId = useMemo(() => {
    const compareAmount = (a: number, b: number) => Math.abs(a - b) <= 0.0001
    const getCurrencyValue = (map: Record<string, number>, currency: string) => {
      const value = map[currency]
        ?? map[currency.toLowerCase()]
        ?? map[currency.toUpperCase()]
      const numeric = Number(value)
      return Number.isFinite(numeric) ? numeric : 0
    }

    const normalizeRows = (variant: PriceControlVariant, currencyCode: string) => {
      const prices = variant.tiers_by_currency[currencyCode.toLowerCase()] || []
      return [...prices].sort((a, b) => {
        if (a.min_quantity !== b.min_quantity) {
          return a.min_quantity - b.min_quantity
        }
        const maxA = a.max_quantity ?? Number.MAX_SAFE_INTEGER
        const maxB = b.max_quantity ?? Number.MAX_SAFE_INTEGER
        return maxA - maxB
      })
    }

    const getQuantityKey = (minQuantity: number, maxQuantity: number | null) =>
      `${minQuantity}-${maxQuantity ?? "open"}`

    type TemplateMatch = {
      score: number
      distance: number
    }

    const scoreAbsoluteTemplate = (
      variant: PriceControlVariant,
      template: PriceControlTemplate
    ): TemplateMatch => {
      if (template.tiers.some(isMultiplierTemplateTier)) {
        return { score: 0, distance: Number.POSITIVE_INFINITY }
      }

      let score = 0

      for (const templateTier of template.tiers) {
        if (isMultiplierTemplateTier(templateTier)) {
          return { score: 0, distance: Number.POSITIVE_INFINITY }
        }

        for (const [currencyRaw, amountRaw] of Object.entries(templateTier.amounts_by_currency || {})) {
          const currency = currencyRaw.toLowerCase()
          const expected = Number(amountRaw)
          const quantityKey = getQuantityKey(templateTier.min_quantity, templateTier.max_quantity)
          const rowByQuantity = new Map(
            normalizeRows(variant, currency).map((row) => [getQuantityKey(row.min_quantity, row.max_quantity), row])
          )
          const variantRow = rowByQuantity.get(quantityKey)

          if (!Number.isFinite(expected) || expected <= 0) {
            continue
          }

          if (!variantRow) {
            continue
          }

          if (!compareAmount(variantRow.amount, expected)) {
            return { score: 0, distance: Number.POSITIVE_INFINITY }
          }

          score += 1
        }
      }

      return {
        score,
        distance: score > 0 ? 0 : Number.POSITIVE_INFINITY,
      }
    }

    const scoreMultiplierTemplate = (
      variant: PriceControlVariant,
      template: PriceControlTemplate
    ): TemplateMatch => {
      if (template.tiers.some((tier) => !isMultiplierTemplateTier(tier))) {
        return { score: 0, distance: Number.POSITIVE_INFINITY }
      }

      const multiplierTiers = [...template.tiers.filter(isMultiplierTemplateTier)].sort((a, b) => {
        if (a.min_quantity !== b.min_quantity) {
          return a.min_quantity - b.min_quantity
        }
        const maxA = a.max_quantity ?? Number.MAX_SAFE_INTEGER
        const maxB = b.max_quantity ?? Number.MAX_SAFE_INTEGER
        return maxA - maxB
      })
      const templateDefaultCurrencies = Object.entries(template.default_tier1_by_currency || {})
        .map(([currency, value]) => [currency.toLowerCase(), Number(value)] as const)
        .filter(([, value]) => Number.isFinite(value) && value > 0)
      const currenciesWithPrices = Object.keys(variant.tiers_by_currency || {}).map((currency) => currency.toLowerCase())
      const currenciesToCheck = templateDefaultCurrencies.length
        ? templateDefaultCurrencies.map(([currency]) => currency)
        : currenciesWithPrices

      if (!currenciesToCheck.length) {
        return { score: 0, distance: Number.POSITIVE_INFINITY }
      }

      let score = 0
      let tier1DistanceTotal = 0
      let tier1DistanceCount = 0

      for (const currency of currenciesToCheck) {
        const rows = normalizeRows(variant, currency)
        if (!rows.length) {
          return { score: 0, distance: Number.POSITIVE_INFINITY }
        }

        const rowByQuantity = new Map(
          rows.map((row) => [getQuantityKey(row.min_quantity, row.max_quantity), row])
        )

        const firstTier = multiplierTiers[0]
        const firstTierKey = firstTier
          ? getQuantityKey(firstTier.min_quantity, firstTier.max_quantity)
          : ""

        const baseFromTier1 = getCurrencyValue(variant.tier1_by_currency, currency)
        const fallbackBase = firstTierKey
          ? Number(rowByQuantity.get(firstTierKey)?.amount || 0)
          : 0
        const base = baseFromTier1 > 0 ? baseFromTier1 : fallbackBase
        if (!base) {
          return { score: 0, distance: Number.POSITIVE_INFINITY }
        }

        const templateTier1 = getCurrencyValue(template.default_tier1_by_currency, currency)
        if (templateTier1 > 0 && !compareAmount(base, templateTier1)) {
          return { score: 0, distance: Number.POSITIVE_INFINITY }
        }

        let matchedAllRows = true

        for (const templateTier of multiplierTiers) {
          const row = rowByQuantity.get(
            getQuantityKey(templateTier.min_quantity, templateTier.max_quantity)
          )
          const expected = base * templateTier.multiplier

          if (
            !row
            || !compareAmount(row.amount, expected)
          ) {
            matchedAllRows = false
            break
          }
        }

        if (!matchedAllRows) {
          return { score: 0, distance: Number.POSITIVE_INFINITY }
        }

        score += multiplierTiers.length

        if (templateTier1 > 0) {
          tier1DistanceTotal += Math.abs(base - templateTier1)
          tier1DistanceCount += 1
        }
      }

      return {
        score,
        distance: score > 0
          ? (tier1DistanceCount > 0 ? tier1DistanceTotal / tier1DistanceCount : Number.POSITIVE_INFINITY)
          : Number.POSITIVE_INFINITY,
      }
    }

    return variants.reduce<Record<string, string>>((acc, variant) => {
      let bestTemplateName = ""
      let bestScore = 0
      let bestDistance = Number.POSITIVE_INFINITY

      for (const template of templates) {
        const mode = template.tier_mode || detectTemplateTierMode(template.tiers) || "multiplier"
        const match = mode === "absolute"
          ? scoreAbsoluteTemplate(variant, template)
          : scoreMultiplierTemplate(variant, template)

        if (
          match.score > bestScore
          || (
            match.score === bestScore
            && match.score > 0
            && match.distance < bestDistance - 0.0001
          )
        ) {
          bestScore = match.score
          bestDistance = match.distance
          bestTemplateName = template.name
        }
      }

      acc[variant.variant_id] = bestTemplateName
      return acc
    }, {})
  }, [templates, variants])

  const groupedVariants = useMemo(() => {
    const grouped = new Map<string, { productId: string; productTitle: string; variants: PriceControlVariant[] }>()

    for (const variant of variants) {
      const productId = variant.product_id || "unknown"
      const productTitle = variant.product_title || "Unassigned Product"

      if (!grouped.has(productId)) {
        grouped.set(productId, {
          productId,
          productTitle,
          variants: [],
        })
      }

      grouped.get(productId)?.variants.push(variant)
    }

    return Array.from(grouped.values()).map((group) => (
      [group.productId, { productTitle: group.productTitle, variants: group.variants }] as const
    ))
  }, [variants])

  const selectedVariants = useMemo(() => {
    return [...selectedVariantIds]
      .map((id) => variantCatalog[id])
      .filter((variant): variant is PriceControlVariant => Boolean(variant))
  }, [selectedVariantIds, variantCatalog])

  const allCurrentPageSelected = useMemo(() => {
    if (!variants.length) {
      return false
    }

    return variants.every((variant) => selectedVariantIds.has(variant.variant_id))
  }, [selectedVariantIds, variants])

  const canGoPrev = offset > 0
  const canGoNext = offset + pageLimit < count

  const detailVariant = detailVariantId ? variantCatalog[detailVariantId] : null

  const detailRows = useMemo(() => {
    if (!detailVariant) {
      return [] as Array<{
        min_quantity: number
        max_quantity: number | null
        amounts_by_currency: Record<string, number>
      }>
    }

    const rowByKey = new Map<string, {
      min_quantity: number
      max_quantity: number | null
      amounts_by_currency: Record<string, number>
    }>()

    for (const [currencyRaw, prices] of Object.entries(detailVariant.tiers_by_currency || {})) {
      const currency = currencyRaw.toLowerCase()
      for (const price of prices || []) {
        const key = `${price.min_quantity}-${price.max_quantity ?? "open"}`
        if (!rowByKey.has(key)) {
          rowByKey.set(key, {
            min_quantity: price.min_quantity,
            max_quantity: price.max_quantity,
            amounts_by_currency: {},
          })
        }
        rowByKey.get(key)?.amounts_by_currency && (rowByKey.get(key)!.amounts_by_currency[currency] = price.amount)
      }
    }

    return Array.from(rowByKey.values()).sort((a, b) => {
      if (a.min_quantity !== b.min_quantity) {
        return a.min_quantity - b.min_quantity
      }

      const maxA = a.max_quantity ?? Number.MAX_SAFE_INTEGER
      const maxB = b.max_quantity ?? Number.MAX_SAFE_INTEGER
      return maxA - maxB
    })
  }, [detailVariant])

  const detailCurrencies = useMemo(() => {
    if (!detailVariant) {
      return currencies
    }

    return Array.from(new Set([
      ...currencies.map((currency) => currency.toLowerCase()),
      ...Object.keys(detailVariant.tiers_by_currency || {}).map((currency) => currency.toLowerCase()),
    ]))
  }, [currencies, detailVariant])

  const buildInitialDetailTier1Inputs = () => {
    return Object.fromEntries(
      detailCurrencies.map((currency) => {
        const tier1Amount = detailVariant
          ? resolveCurrencyAmount(detailVariant.tier1_by_currency, currency)
          : 0
        return [currency, tier1Amount > 0 ? String(tier1Amount) : ""]
      })
    )
  }

  const buildDefaultDetailAbsoluteRows = (
    tier1ByCurrency: Record<string, string>
  ): DetailTierRowInput[] => {
    return [
      {
        min_quantity: "1",
        max_quantity: "",
        amounts_by_currency: Object.fromEntries(
          detailCurrencies.map((currency) => [currency, tier1ByCurrency[currency] || ""])
        ),
      },
    ]
  }

  const toDetailMultiplierRowsFromAbsoluteRows = (
    rows: DetailTierRowInput[],
    tier1ByCurrency: Record<string, string>
  ): DetailMultiplierRowInput[] => {
    if (!rows.length) {
      return DEFAULT_TIERS.map((tier) => ({
        min_quantity: String(tier.min_quantity),
        max_quantity: tier.max_quantity === null ? "" : String(tier.max_quantity),
        multiplier: String(tier.multiplier),
      }))
    }

    const candidateCurrencies = Array.from(
      new Set([
        ...detailCurrencies,
        ...rows.flatMap((row) => Object.keys(row.amounts_by_currency || {})),
      ])
    )

    const fallbackCurrency = candidateCurrencies.find((currency) => {
      const base = Number(tier1ByCurrency[currency] || 0)
      return (
        Number.isFinite(base)
        && base > 0
        && rows.some((row) => Number(row.amounts_by_currency[currency]) > 0)
      )
    }) || candidateCurrencies[0] || ""

    return rows.map((row) => {
      const base = Number(tier1ByCurrency[fallbackCurrency] || 0)
      const amount = Number(row.amounts_by_currency[fallbackCurrency] || 0)
      const multiplier = base > 0 && amount > 0 ? (amount / base) : 1

      return {
        min_quantity: row.min_quantity || "1",
        max_quantity: row.max_quantity,
        multiplier: String(multiplier),
      }
    })
  }

  const toDetailAbsoluteRowsFromMultiplierRows = (
    rows: DetailMultiplierRowInput[],
    tier1ByCurrency: Record<string, string>
  ): DetailTierRowInput[] => {
    if (!rows.length) {
      return buildDefaultDetailAbsoluteRows(tier1ByCurrency)
    }

    return rows.map((row) => ({
      min_quantity: row.min_quantity || "1",
      max_quantity: row.max_quantity,
      amounts_by_currency: Object.fromEntries(
        detailCurrencies.map((currency) => {
          const tier1Amount = Number(tier1ByCurrency[currency] || 0)
          const multiplier = Number(row.multiplier)
          if (
            Number.isFinite(tier1Amount)
            && tier1Amount > 0
            && Number.isFinite(multiplier)
            && multiplier > 0
          ) {
            return [currency, String(tier1Amount * multiplier)]
          }

          return [currency, ""]
        })
      ),
    }))
  }

  useEffect(() => {
    if (!detailVariant) {
      setDetailEditRows([])
      setDetailMultiplierRows([])
      setDetailTier1Inputs({})
      return
    }

    const nextTier1Inputs = buildInitialDetailTier1Inputs()
    const nextAbsoluteRows = detailRows.length
      ? detailRows.map((row) => ({
        min_quantity: String(row.min_quantity),
        max_quantity: row.max_quantity === null ? "" : String(row.max_quantity),
        amounts_by_currency: Object.fromEntries(
          detailCurrencies.map((currency) => [
            currency,
            row.amounts_by_currency[currency] !== undefined
              ? String(row.amounts_by_currency[currency])
              : "",
          ])
        ),
      }))
      : buildDefaultDetailAbsoluteRows(nextTier1Inputs)

    setDetailEditMode("absolute")
    setDetailTier1Inputs(nextTier1Inputs)
    setDetailEditRows(nextAbsoluteRows)
    setDetailMultiplierRows(
      toDetailMultiplierRowsFromAbsoluteRows(nextAbsoluteRows, nextTier1Inputs)
    )
  }, [detailVariant, detailRows, detailCurrencies])

  const switchDetailEditMode = (nextMode: TemplateTierMode) => {
    if (nextMode === detailEditMode) {
      return
    }

    if (nextMode === "multiplier") {
      setDetailMultiplierRows(
        toDetailMultiplierRowsFromAbsoluteRows(detailEditRows, detailTier1Inputs)
      )
    } else {
      setDetailEditRows(
        toDetailAbsoluteRowsFromMultiplierRows(detailMultiplierRows, detailTier1Inputs)
      )
    }

    setDetailEditMode(nextMode)
  }

  const setDetailTierBaseField = (
    index: number,
    key: "min_quantity" | "max_quantity",
    value: string
  ) => {
    setDetailEditRows((prev) => {
      const next = [...prev]
      const row = next[index]
      if (!row) {
        return prev
      }

      next[index] = {
        ...row,
        [key]: value,
      }

      return next
    })
  }

  const setDetailTierAmount = (index: number, currency: string, value: string) => {
    setDetailEditRows((prev) => {
      const next = [...prev]
      const row = next[index]
      if (!row) {
        return prev
      }

      next[index] = {
        ...row,
        amounts_by_currency: {
          ...row.amounts_by_currency,
          [currency]: value,
        },
      }

      return next
    })
  }

  const setDetailTier1Input = (currency: string, value: string) => {
    setDetailTier1Inputs((prev) => ({
      ...prev,
      [currency]: value,
    }))
  }

  const setDetailMultiplierTierBaseField = (
    index: number,
    key: "min_quantity" | "max_quantity",
    value: string
  ) => {
    setDetailMultiplierRows((prev) => {
      const next = [...prev]
      const row = next[index]
      if (!row) {
        return prev
      }

      next[index] = {
        ...row,
        [key]: value,
      }

      return next
    })
  }

  const setDetailMultiplierTierValue = (index: number, value: string) => {
    setDetailMultiplierRows((prev) => {
      const next = [...prev]
      const row = next[index]
      if (!row) {
        return prev
      }

      next[index] = {
        ...row,
        multiplier: value,
      }

      return next
    })
  }

  const addDetailAbsoluteTierRow = () => {
    setDetailEditRows((prev) => {
      if (!prev.length) {
        return buildDefaultDetailAbsoluteRows(detailTier1Inputs)
      }

      const last = prev[prev.length - 1]
      const lastMin = Number(last.min_quantity)
      const parsedLastMin = Number.isFinite(lastMin) && lastMin > 0 ? Math.floor(lastMin) : 1
      const parsedLastMax = last.max_quantity === "" ? null : Number(last.max_quantity)
      const safeLastMax =
        parsedLastMax !== null && Number.isFinite(parsedLastMax)
          ? Math.floor(parsedLastMax)
          : null

      const normalizedPrev = prev.map((row, index) =>
        index === prev.length - 1 && row.max_quantity === ""
          ? { ...row, max_quantity: String(parsedLastMin + 100) }
          : row
      )

      const nextMin = safeLastMax === null ? parsedLastMin + 1 : safeLastMax + 1
      const previousAmounts = normalizedPrev[normalizedPrev.length - 1]?.amounts_by_currency || {}

      return [
        ...normalizedPrev,
        {
          min_quantity: String(Math.max(1, nextMin)),
          max_quantity: "",
          amounts_by_currency: Object.fromEntries(
            detailCurrencies.map((currency) => [
              currency,
              previousAmounts[currency] ?? "",
            ])
          ),
        },
      ]
    })
  }

  const addDetailMultiplierTierRow = () => {
    setDetailMultiplierRows((prev) => {
      if (!prev.length) {
        return [
          {
            min_quantity: "1",
            max_quantity: "",
            multiplier: "1",
          },
        ]
      }

      const last = prev[prev.length - 1]
      const lastMin = Number(last.min_quantity)
      const parsedLastMin = Number.isFinite(lastMin) && lastMin > 0 ? Math.floor(lastMin) : 1
      const parsedLastMax = last.max_quantity === "" ? null : Number(last.max_quantity)
      const safeLastMax =
        parsedLastMax !== null && Number.isFinite(parsedLastMax)
          ? Math.floor(parsedLastMax)
          : null

      const normalizedPrev = prev.map((row, index) =>
        index === prev.length - 1 && row.max_quantity === ""
          ? { ...row, max_quantity: String(parsedLastMin + 100) }
          : row
      )

      const nextMin = safeLastMax === null ? parsedLastMin + 1 : safeLastMax + 1
      const previousMultiplier = normalizedPrev[normalizedPrev.length - 1]?.multiplier || "1"

      return [
        ...normalizedPrev,
        {
          min_quantity: String(Math.max(1, nextMin)),
          max_quantity: "",
          multiplier: previousMultiplier,
        },
      ]
    })
  }

  const addDetailTierRow = () => {
    if (detailEditMode === "multiplier") {
      addDetailMultiplierTierRow()
      return
    }

    addDetailAbsoluteTierRow()
  }

  const removeDetailTierRow = (index: number) => {
    if (detailEditMode === "multiplier") {
      setDetailMultiplierRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))
      return
    }

    setDetailEditRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))
  }

  const onUpdateDetailVariantPricing = async () => {
    if (!detailVariant) {
      return
    }

    const payload = detailEditMode === "multiplier"
      ? (() => {
        const multiplierTiers: MultiplierTierDefinition[] = detailMultiplierRows.map((row) => ({
          min_quantity: Number(row.min_quantity),
          max_quantity: row.max_quantity === "" ? null : Number(row.max_quantity),
          multiplier: Number(row.multiplier),
        }))
        const errors = validateTemplateTiers(multiplierTiers)
        if (errors.length) {
          return { errors, payload: null }
        }

        const tier1ByCurrency = parsePositiveNumberMap(detailTier1Inputs)
        if (!Object.keys(tier1ByCurrency).length) {
          return {
            errors: ["At least one currency base amount is required for multiplier mode."],
            payload: null,
          }
        }

        return {
          errors: [] as string[],
          payload: {
            variants: [
              {
                variant_id: detailVariant.variant_id,
                tier1_by_currency: tier1ByCurrency,
              },
            ],
            tiers: multiplierTiers,
            mode: "replace_all_tiers" as const,
          },
        }
      })()
      : (() => {
        const absoluteTiers: AbsoluteTierDefinition[] = detailEditRows.map((row) => ({
          min_quantity: Number(row.min_quantity),
          max_quantity: row.max_quantity === "" ? null : Number(row.max_quantity),
          amounts_by_currency: Object.fromEntries(
            detailCurrencies.map((currency) => [currency, Number(row.amounts_by_currency[currency])])
          ),
        }))

        const errors = validateTemplateTiers(absoluteTiers)
        return {
          errors,
          payload: {
            variants: [
              {
                variant_id: detailVariant.variant_id,
                tier1_by_currency: {},
              },
            ],
            tiers: absoluteTiers,
            mode: "replace_all_tiers" as const,
          },
        }
      })()

    if (payload.errors.length || !payload.payload) {
      toast.error(payload.errors[0] || "Invalid pricing data")
      return
    }

    setIsDetailSubmitting(true)

    try {
      const response = await applyPricing(payload.payload)

      await loadVariants()

      const failed = response.failed.find(
        (item) => item.variant_id === detailVariant.variant_id
      )

      if (failed) {
        toast.error(failed.reason || "Failed to update variant pricing")
      } else {
        setDetachedTemplateVariantIds((prev) => {
          const next = new Set(prev)
          next.add(detailVariant.variant_id)
          return next
        })
        toast.success("Variant pricing updated")
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to update variant pricing")
    } finally {
      setIsDetailSubmitting(false)
    }
  }

  const toMultiplierTemplateTiers = (
    sourceTiers: TemplateTierDefinition[]
  ): MultiplierTierDefinition[] => {
    if (sourceTiers.every(isMultiplierTemplateTier)) {
      return sourceTiers.map((tier) => ({ ...tier }))
    }

    const fallbackCurrency =
      currencies.find((currency) => Number(templateDefaults[currency]) > 0) || currencies[0] || "usd"

    return sourceTiers.map((tier) => {
      if (isMultiplierTemplateTier(tier)) {
        return { ...tier }
      }

      const base = Number(templateDefaults[fallbackCurrency] || 0)
      const amount = Number(tier.amounts_by_currency?.[fallbackCurrency] || 0)
      const multiplier = base > 0 && amount > 0 ? (amount / base) : 1

      return {
        min_quantity: tier.min_quantity,
        max_quantity: tier.max_quantity,
        multiplier: Math.max(0.0001, multiplier),
      }
    })
  }

  const toAbsoluteTemplateTiers = (
    sourceTiers: TemplateTierDefinition[]
  ): TemplateTierDefinition[] => {
    return sourceTiers.map((tier) => {
      if (!isMultiplierTemplateTier(tier)) {
        return { ...tier, amounts_by_currency: { ...tier.amounts_by_currency } }
      }

      const amountsByCurrency = Object.fromEntries(
        currencies.map((currency) => {
          const defaultTier1 = Number(templateDefaults[currency] || 0)
          const computed = defaultTier1 > 0
            ? (defaultTier1 * tier.multiplier)
            : 1
          return [currency, computed]
        })
      )

      return {
        min_quantity: tier.min_quantity,
        max_quantity: tier.max_quantity,
        amounts_by_currency: amountsByCurrency,
      }
    })
  }

  const switchTemplateTierMode = (nextMode: TemplateTierMode) => {
    if (nextMode === templateTierMode) {
      return
    }

    if (nextMode === "absolute" && !currencies.length) {
      toast.error("Currencies are required before switching to absolute mode.")
      return
    }

    setTemplateTierMode(nextMode)
    setTemplateTiers((prev) =>
      nextMode === "multiplier"
        ? toMultiplierTemplateTiers(prev)
        : toAbsoluteTemplateTiers(prev)
    )
  }

  const setTemplateTierBaseField = (
    index: number,
    key: "min_quantity" | "max_quantity",
    value: string
  ) => {
    setTemplateTiers((prev) => {
      const next = [...prev]
      const current = { ...(next[index] || { min_quantity: 1, max_quantity: null, multiplier: 1 }) }

      if (key === "max_quantity") {
        current.max_quantity = value === "" ? null : Number(value)
      } else {
        current.min_quantity = Number(value)
      }

      next[index] = current
      return next
    })
  }

  const setTemplateTierMultiplier = (index: number, value: string) => {
    setTemplateTiers((prev) => {
      const next = [...prev]
      const current = next[index]
      if (!current || !isMultiplierTemplateTier(current)) {
        return prev
      }

      next[index] = {
        ...current,
        multiplier: Number(value),
      }
      return next
    })
  }

  const setTemplateTierAmount = (index: number, currency: string, value: string) => {
    setTemplateTiers((prev) => {
      const next = [...prev]
      const current = next[index]
      if (!current || isMultiplierTemplateTier(current)) {
        return prev
      }

      const amount = Number(value)
      next[index] = {
        ...current,
        amounts_by_currency: {
          ...(current.amounts_by_currency || {}),
          [currency]: Number.isFinite(amount) ? amount : 0,
        },
      }

      return next
    })
  }

  const addTemplateTier = () => {
    setTemplateTiers((prev) => {
      const last = prev[prev.length - 1]
      const nextMin = last?.max_quantity === null
        ? (last.min_quantity || 1) + 1
        : ((last?.max_quantity || 0) + 1)

      const normalizedPrev = prev.map((tier, index) =>
        index === prev.length - 1 && tier.max_quantity === null
          ? { ...tier, max_quantity: tier.min_quantity + 100 }
          : tier
      )

      if (templateTierMode === "multiplier") {
        return [
          ...normalizedPrev,
          {
            min_quantity: Math.max(1, nextMin),
            max_quantity: null,
            multiplier: 0.9,
          },
        ]
      }

      const amountsByCurrency = Object.fromEntries(
        currencies.map((currency) => {
          const amount = Number(templateDefaults[currency] || 0)
          return [currency, amount > 0 ? amount : 1]
        })
      )

      return [
        ...normalizedPrev,
        {
          min_quantity: Math.max(1, nextMin),
          max_quantity: null,
          amounts_by_currency: amountsByCurrency,
        },
      ]
    })
  }

  const removeTemplateTier = (index: number) => {
    setTemplateTiers((prev) => prev.filter((_, i) => i !== index))
  }

  const toggleVariantSelection = (variantId: string, checked: boolean) => {
    setSelectedVariantIds((prev) => toggleSelection(prev, variantId, checked))
  }

  const toggleAllCurrentPage = (checked: boolean) => {
    const pageVariantIds = variants.map((variant) => variant.variant_id)
    setSelectedVariantIds((prev) => toggleSelectionForMany(prev, pageVariantIds, checked))
  }

  const toggleProductGroup = (variantIds: string[], checked: boolean) => {
    setSelectedVariantIds((prev) => toggleSelectionForMany(prev, variantIds, checked))
  }

  const openVariantDetail = (variantId: string) => setDetailVariantId(variantId)

  const applyTemplateToEditor = (template: PriceControlTemplate) => {
    const templateMode = template.tier_mode || detectTemplateTierMode(template.tiers) || "multiplier"
    const nextTemplateTiers = template.tiers.map((tier) =>
      isMultiplierTemplateTier(tier)
        ? { ...tier }
        : { ...tier, amounts_by_currency: { ...tier.amounts_by_currency } }
    )
    setTemplateTierMode(templateMode)
    setTemplateTiers(nextTemplateTiers)

    if (templateMode === "multiplier") {
      const nextBulkTiers = toMultiplierTemplateTiers(nextTemplateTiers)
      setTiers(nextBulkTiers)
    }

    const defaults = Object.fromEntries(
      currencies.map((currency) => [currency, String(template.default_tier1_by_currency[currency] || "")])
    )

    setTemplateDefaults(defaults)

    if (!selectedVariantIds.size) {
      return
    }

    setTier1Inputs((prev) => applyTemplateDefaultsToTier1Inputs({
      currentInputs: prev,
      selectedVariantIds,
      defaults,
    }))
  }

  const onSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId)

    if (!templateId) {
      setTemplateName("")
      setTemplateTierMode("multiplier")
      setTemplateTiers(DEFAULT_TIERS)
      setTemplateDefaults(
        Object.fromEntries(currencies.map((currency) => [currency, ""]))
      )
      return
    }

    const template = templateById[templateId]
    if (!template) {
      return
    }

    setTemplateName(template.name)
    applyTemplateToEditor(template)
  }

  const onCreateTemplate = async (name: string) => {
    const errors = validateTemplateTiers(templateTiers)
    if (errors.length) {
      toast.error(errors[0])
      return
    }

    const defaults = parsePositiveNumberMap(templateDefaults)

    if (templateTierMode === "multiplier" && !Object.keys(defaults).length) {
      toast.error("Price template defaults must include at least one positive Tier 1 value.")
      return
    }

    if (!name.trim()) {
      toast.error("Price template name is required.")
      return
    }

    try {
      const created = await createTemplate({
        name: name.trim(),
        tiers: templateTiers,
        default_tier1_by_currency: defaults,
      })

      setSelectedTemplateId(created.id)
      setTemplateName(created.name)
      setCreateTemplateName("")
      setIsCreateDialogOpen(false)
      await loadTemplates()
      toast.success("Price template created")
    } catch (error: any) {
      toast.error(error?.message || "Failed to create price template")
    }
  }

  const onDuplicateTemplate = async () => {
    if (!selectedTemplateId) {
      toast.error("Select a price template to duplicate.")
      return
    }

    const baseName = templateName.trim() || "Price Template"
    await onCreateTemplate(`${baseName} Copy`)
  }

  const onUpdateTemplate = async () => {
    if (!selectedTemplateId) {
      toast.error("Select a price template to update.")
      return
    }

    const errors = validateTemplateTiers(templateTiers)
    if (errors.length) {
      toast.error(errors[0])
      return
    }

    const defaults = parsePositiveNumberMap(templateDefaults)

    if (templateTierMode === "multiplier" && !Object.keys(defaults).length) {
      toast.error("Price template defaults must include at least one positive Tier 1 value.")
      return
    }

    try {
      await updateTemplate(selectedTemplateId, {
        name: templateName.trim() || undefined,
        tiers: templateTiers,
        default_tier1_by_currency: defaults,
      })

      await loadTemplates()
      toast.success("Price template updated")
    } catch (error: any) {
      toast.error(error?.message || "Failed to update price template")
    }
  }

  const onDeleteTemplate = async () => {
    if (!selectedTemplateId) {
      return
    }

    try {
      await deleteTemplate(selectedTemplateId)
      setSelectedTemplateId("")
      setTemplateName("")
      setTemplateTierMode("multiplier")
      setTemplateTiers(DEFAULT_TIERS)
      setIsDeleteDialogOpen(false)
      await loadTemplates()
      toast.success("Price template deleted")
    } catch (error: any) {
      toast.error(error?.message || "Failed to delete price template")
    }
  }

  const onApplyPricing = async () => {
    const errors = validateTiers(tiers)
    if (errors.length) {
      toast.error(errors[0])
      return
    }

    if (!selectedVariants.length) {
      toast.error("Select at least one variant.")
      return
    }

    const payload = buildApplyPayload({
      selectedVariants,
      tier1Inputs,
      tiers,
      templateId: selectedTemplateId || undefined,
    })

    if (!payload.variants.length) {
      toast.error("Selected variants need at least one positive Tier 1 value.")
      return
    }

    setIsSubmitting(true)

    try {
      const result = await applyPricing({
        ...payload,
      })

      await loadVariants()

      if (selectedTemplateId) {
        const failedIds = new Set(result.failed.map((item) => item.variant_id))
        const successIds = payload.variants
          .map((item) => item.variant_id)
          .filter((variantId) => !failedIds.has(variantId))

        if (successIds.length) {
          setDetachedTemplateVariantIds((prev) => {
            const next = new Set(prev)
            for (const variantId of successIds) {
              next.delete(variantId)
            }
            return next
          })
        }
      }

      if (result.failed.length) {
        toast.warning(`Updated ${result.updated_count} variants. ${result.failed.length} failed.`)
      } else {
        toast.success(`Updated ${result.updated_count} variants.`)
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to apply pricing")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Backend Price Control</h1>
            <p className="text-sm text-slate-600">Manage product variant tier pricing with editable price templates and multipliers.</p>
          </div>
          <Button variant="outline" onClick={logout}>Logout</Button>
        </header>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="bulk">Product List</TabsTrigger>
            <TabsTrigger value="templates">Price Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="bulk" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Variant Selection</CardTitle>
                <CardDescription>Select variants across products, then apply computed tier pricing.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Input
                    placeholder="Search by product / variant / SKU"
                    value={search}
                    onChange={(event) => {
                      setOffset(0)
                      setSearch(event.target.value)
                    }}
                  />
                </div>

                <div className="flex flex-nowrap items-center gap-3 overflow-x-auto rounded-md border border-slate-200 bg-slate-100 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-slate-700">
                    <span>Selected variants</span>
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-semibold text-white">
                      {selectedVariantIds.size}
                    </span>
                  </div>
                  <div className="ml-2 flex shrink-0 items-center gap-2 whitespace-nowrap">
                    <span className="whitespace-nowrap font-medium text-slate-700">Select Template</span>
                    <Select
                      className="w-[220px] shrink-0"
                      value={selectedTemplateId}
                      onChange={(event) => onSelectTemplate(event.target.value)}
                    >
                      <option value="">No Template</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setSelectedVariantIds(new Set())}>Clear</Button>
                    <Button size="sm" onClick={onApplyPricing} disabled={isSubmitting || !selectedVariantIds.size}>
                      {isSubmitting ? "Applying..." : "Apply"}
                    </Button>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[44px]">
                        <Checkbox
                          checked={allCurrentPageSelected}
                          onChange={(event) => toggleAllCurrentPage(event.target.checked)}
                        />
                      </TableHead>
                      <TableHead>Product / Variant</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Tier 1 Snapshot</TableHead>
                      <TableHead>Price Template In Use</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isVariantsLoading && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-slate-500">Loading variants...</TableCell>
                      </TableRow>
                    )}

                    {!isVariantsLoading && groupedVariants.map(([productId, group]) => {
                      const variantIds = group.variants.map((variant) => variant.variant_id)
                      const allSelected = variantIds.every((id) => selectedVariantIds.has(id))

                      return (
                        <Fragment key={`group-fragment-${productId}`}>
                          <TableRow className="bg-slate-100/70">
                            <TableCell>
                              <Checkbox
                                checked={allSelected}
                                onChange={(event) => toggleProductGroup(variantIds, event.target.checked)}
                              />
                            </TableCell>
                            <TableCell className="font-semibold text-slate-800">{group.productTitle}</TableCell>
                            <TableCell className="text-xs text-slate-500">{productId}</TableCell>
                            <TableCell className="text-xs text-slate-500">{group.variants.length} variants</TableCell>
                            <TableCell />
                          </TableRow>

                          {group.variants.map((variant) => (
                            <TableRow
                              key={variant.variant_id}
                              className="cursor-pointer hover:bg-slate-50"
                              onClick={() => openVariantDetail(variant.variant_id)}
                            >
                              <TableCell onClick={(event) => event.stopPropagation()}>
                                <Checkbox
                                  checked={selectedVariantIds.has(variant.variant_id)}
                                  onChange={(event) => toggleVariantSelection(variant.variant_id, event.target.checked)}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="font-medium text-slate-900">{variant.variant_title || "Untitled Variant"}</div>
                                <div className="text-xs text-slate-500">{variant.variant_id}</div>
                              </TableCell>
                              <TableCell className="text-sm text-slate-600">{variant.sku || "-"}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1.5">
                                  {currencies.map((currency) => (
                                    <span key={`${variant.variant_id}-${currency}`} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                                      {currency.toUpperCase()}: {variant.tier1_by_currency[currency] || "-"}
                                    </span>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                {detachedTemplateVariantIds.has(variant.variant_id)
                                  ? ""
                                  : (templateInUseByVariantId[variant.variant_id] || "")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">Showing {Math.min(offset + 1, count)}-{Math.min(offset + pageLimit, count)} of {count}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 whitespace-nowrap">
                      <span className="text-xs text-slate-500 whitespace-nowrap">Per page</span>
                      <Select
                        className="w-[96px]"
                        value={String(pageLimit)}
                        onChange={(event) => {
                          setOffset(0)
                          setPageLimit(Number(event.target.value))
                        }}
                      >
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                        <option value="200">200</option>
                      </Select>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setOffset((prev) => Math.max(prev - pageLimit, 0))} disabled={!canGoPrev}>Previous</Button>
                    <Button size="sm" variant="outline" onClick={() => setOffset((prev) => prev + pageLimit)} disabled={!canGoNext}>Next</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Price Templates</CardTitle>
                <CardDescription>Create reusable price templates. Click a row to edit.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Defaults</TableHead>
                        <TableHead>Tier Count</TableHead>
                        <TableHead>Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templates.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-6 text-center text-slate-500">No price templates yet.</TableCell>
                        </TableRow>
                      )}

                      {templates.map((template) => {
                        const isSelected = selectedTemplateId === template.id

                        return (
                          <TableRow
                            key={`template-row-${template.id}`}
                            className={`cursor-pointer ${isSelected ? "bg-slate-900 text-white hover:bg-slate-900" : "hover:bg-slate-50"}`}
                            onClick={() => onSelectTemplate(template.id)}
                          >
                            <TableCell className={`font-medium ${isSelected ? "text-white" : ""}`}>{template.name}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1.5">
                                {currencies.map((currency) => (
                                  <span
                                    key={`${template.id}-${currency}`}
                                    className={`rounded px-2 py-0.5 text-xs ${isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}
                                  >
                                    {currency.toUpperCase()}: {template.default_tier1_by_currency[currency] || "-"}
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className={isSelected ? "text-white" : ""}>{template.tiers.length} ({template.tier_mode || detectTemplateTierMode(template.tiers) || "multiplier"})</TableCell>
                            <TableCell className={isSelected ? "text-white" : ""}>{new Date(template.updated_at).toLocaleString()}</TableCell>
                          </TableRow>
                        )
                      })}

                      <TableRow
                        className="cursor-pointer border-t border-dashed bg-slate-50/70 hover:bg-slate-100"
                        onClick={() => setIsCreateDialogOpen(true)}
                      >
                        <TableCell colSpan={4} className="font-medium text-slate-700">+ Create Price Template</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Price Template Editor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Template Name</label>
                  <Input
                    className="w-full"
                    placeholder="Price template name"
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    disabled={!selectedTemplateId}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Select Mode</p>
                  <Tabs
                    value={templateTierMode}
                    onValueChange={(value) => switchTemplateTierMode(value as TemplateTierMode)}
                    className="space-y-2"
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="multiplier" className="w-full">Multiplier Mode</TabsTrigger>
                      <TabsTrigger value="absolute" className="w-full">Absolute Mode</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <p className="text-xs text-slate-500">
                    {templateTierMode === "multiplier"
                      ? "Based on Tier 1 per currency. Each tier amount = Tier 1 x multiplier."
                      : "Tier rows use fixed per-currency amounts."}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {currencies.map((currency) => (
                    <label key={`template-default-${currency}`} className="space-y-1">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {currency} Tier 1 {templateTierMode === "absolute" ? "(optional)" : ""}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        value={templateDefaults[currency] || ""}
                        onChange={(event) => setTemplateDefaults((prev) => ({
                          ...prev,
                          [currency]: event.target.value,
                        }))}
                      />
                    </label>
                  ))}
                </div>

                <div className="rounded-md border border-slate-200 p-3">
                  <div className="mb-3">
                    <p className="text-sm font-medium text-slate-700">Price Template Tier Editor</p>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[90px]">Tier</TableHead>
                        <TableHead>Min Qty</TableHead>
                        <TableHead>Max Qty</TableHead>
                        {templateTierMode === "multiplier"
                          ? (
                            <TableHead>Multiplier</TableHead>
                          )
                          : currencies.map((currency) => (
                            <TableHead key={`template-tier-head-${currency}`}>
                              {currency.toUpperCase()}
                            </TableHead>
                          ))}
                        <TableHead className="w-[70px]">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templateTiers.map((tier, index) => (
                        <TableRow key={`template-tier-${index}`}>
                          <TableCell className="font-medium text-slate-700">Tier {index + 1}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={String(tier.min_quantity)}
                              onChange={(event) => setTemplateTierBaseField(index, "min_quantity", event.target.value)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={tier.max_quantity === null ? "" : String(tier.max_quantity)}
                              placeholder="Open"
                              onChange={(event) => setTemplateTierBaseField(index, "max_quantity", event.target.value)}
                            />
                          </TableCell>
                          {templateTierMode === "multiplier"
                            ? (
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={String(isMultiplierTemplateTier(tier) ? tier.multiplier : "")}
                                  onChange={(event) => setTemplateTierMultiplier(index, event.target.value)}
                                />
                              </TableCell>
                            )
                            : currencies.map((currency) => (
                              <TableCell key={`template-tier-${index}-${currency}`}>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={String(
                                    !isMultiplierTemplateTier(tier)
                                      ? (tier.amounts_by_currency?.[currency] ?? "")
                                      : ""
                                  )}
                                  onChange={(event) => setTemplateTierAmount(index, currency, event.target.value)}
                                />
                              </TableCell>
                            ))}
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => removeTemplateTier(index)}
                              disabled={templateTiers.length <= 1}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-3 flex items-center gap-3">
                    <Button type="button" variant="secondary" onClick={addTemplateTier}>Add Tier</Button>
                    <div className="ml-auto flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        className="bg-transparent px-0 text-red-600 hover:bg-transparent hover:text-red-700"
                        onClick={() => setIsDeleteDialogOpen(true)}
                        disabled={!selectedTemplateId}
                      >
                        Delete
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="bg-transparent px-0 text-slate-700 hover:bg-transparent hover:text-slate-900"
                        onClick={onDuplicateTemplate}
                        disabled={!selectedTemplateId}
                      >
                        Duplicate
                      </Button>
                      <Button type="button" onClick={onUpdateTemplate} disabled={!selectedTemplateId}>Update</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Price Template</DialogTitle>
            <DialogDescription>
              This will permanently delete the selected price template. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose onClick={() => setIsDeleteDialogOpen(false)} />
            <Button type="button" variant="destructive" onClick={onDeleteTemplate}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Price Template</DialogTitle>
            <DialogDescription>
              Enter a name for the new price template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="Price template name"
              value={createTemplateName}
              onChange={(event) => setCreateTemplateName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <DialogClose onClick={() => setIsCreateDialogOpen(false)} />
            <Button type="button" onClick={() => onCreateTemplate(createTemplateName)}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(detailVariant)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailVariantId(null)
          }
        }}
      >
        <DialogContent className="max-w-[95vw] xl:max-w-7xl">
          <DialogHeader>
            <DialogTitle>{detailVariant?.variant_title || "Variant Price Detail"}</DialogTitle>
            <DialogDescription>
              {detailVariant?.variant_id || ""}
            </DialogDescription>
          </DialogHeader>

          {detailVariant && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {detailCurrencies.map((currency) => (
                  <span key={`detail-tier1-${currency}`} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {currency.toUpperCase()}: {detailTier1Inputs[currency] || "-"}
                  </span>
                ))}
              </div>

              <Tabs
                value={detailEditMode}
                onValueChange={(value) => switchDetailEditMode(value as TemplateTierMode)}
                className="space-y-3"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="absolute" className="w-full">Absolute Mode</TabsTrigger>
                  <TabsTrigger value="multiplier" className="w-full">Multiplier Mode</TabsTrigger>
                </TabsList>
              </Tabs>

              {detailEditMode === "multiplier" && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">Base amount per currency. Tier amount = Base x multiplier.</p>
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {detailCurrencies.map((currency) => (
                      <label key={`detail-tier1-input-${currency}`} className="space-y-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{currency.toUpperCase()}</span>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={detailTier1Inputs[currency] || ""}
                          onChange={(event) => setDetailTier1Input(currency, event.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {detailEditMode === "multiplier" ? (
                detailMultiplierRows.length ? (
                  <div className="space-y-3">
                    <div className="max-h-[60vh] overflow-auto rounded-md border border-slate-200">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[240px]">Qty</TableHead>
                            <TableHead>Multiplier</TableHead>
                            <TableHead className="w-[70px]">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailMultiplierRows.map((row, index) => (
                            <TableRow key={`detail-multiplier-row-${index}`}>
                              <TableCell>
                                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={row.min_quantity}
                                    onChange={(event) => setDetailMultiplierTierBaseField(index, "min_quantity", event.target.value)}
                                  />
                                  <span className="text-xs text-slate-500">to</span>
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="Open"
                                    value={row.max_quantity}
                                    onChange={(event) => setDetailMultiplierTierBaseField(index, "max_quantity", event.target.value)}
                                  />
                                </div>
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.0001"
                                  min={0}
                                  value={row.multiplier}
                                  onChange={(event) => setDetailMultiplierTierValue(index, event.target.value)}
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 px-0"
                                  aria-label="Remove tier"
                                  onClick={() => removeDetailTierRow(index)}
                                  disabled={detailMultiplierRows.length <= 1 || isDetailSubmitting}
                                >
                                  X
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={addDetailTierRow}
                      disabled={isDetailSubmitting}
                    >
                      Add Tier
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No tier rows available for this variant.</p>
                )
              ) : (
                detailEditRows.length ? (
                  <div className="space-y-3">
                    <div className="max-h-[60vh] overflow-auto rounded-md border border-slate-200">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[240px]">Qty</TableHead>
                            {detailCurrencies.map((currency) => (
                              <TableHead key={`detail-head-${currency}`}>{currency.toUpperCase()}</TableHead>
                            ))}
                            <TableHead className="w-[70px]">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailEditRows.map((row, index) => (
                            <TableRow key={`detail-edit-row-${index}`}>
                              <TableCell>
                                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={row.min_quantity}
                                    onChange={(event) => setDetailTierBaseField(index, "min_quantity", event.target.value)}
                                  />
                                  <span className="text-xs text-slate-500">to</span>
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="Open"
                                    value={row.max_quantity}
                                    onChange={(event) => setDetailTierBaseField(index, "max_quantity", event.target.value)}
                                  />
                                </div>
                              </TableCell>
                              {detailCurrencies.map((currency) => (
                                <TableCell key={`detail-cell-${index}-${currency}`}>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    value={row.amounts_by_currency[currency] ?? ""}
                                    onChange={(event) => setDetailTierAmount(index, currency, event.target.value)}
                                  />
                                </TableCell>
                              ))}
                              <TableCell>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 w-8 px-0"
                                  aria-label="Remove tier"
                                  onClick={() => removeDetailTierRow(index)}
                                  disabled={detailEditRows.length <= 1 || isDetailSubmitting}
                                >
                                  X
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full"
                      onClick={addDetailTierRow}
                      disabled={isDetailSubmitting}
                    >
                      Add Tier
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">No tier rows available for this variant.</p>
                )
              )}
            </div>
          )}

          <DialogFooter className="justify-between">
            <Button type="button" variant="outline" onClick={() => setDetailVariantId(null)} disabled={isDetailSubmitting}>Close</Button>
            <Button type="button" onClick={onUpdateDetailVariantPricing} disabled={isDetailSubmitting}>
              {isDetailSubmitting ? "Updating..." : "Update Variant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
