const { z } = require("zod");

const conditionEnum = z.enum([
  "new",
  "excellent",
  "good",
  "fair",
  "needs_work",
  "fixer_upper"
]);

const optionalNumber = () =>
  z.coerce.number().refine(Number.isFinite, "Must be a valid number").optional();

const optionalPositiveNumber = () =>
  z.coerce.number().positive("Must be greater than 0").optional();

const optionalNonNegativeNumber = () =>
  z.coerce.number().min(0, "Must be 0 or greater").optional();

const propertyObjectSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    address: z.string().min(3).optional(),
    url: z.string().url().optional(),
    price: optionalPositiveNumber(),
    currency: z.string().min(3).max(5).optional(),
    bedrooms: optionalNonNegativeNumber(),
    bathrooms: optionalNonNegativeNumber(),
    sizeSqm: optionalPositiveNumber(),
    location: z.string().optional(),
    neighborhood: z.string().optional(),
    propertyType: z.string().optional(),
    condition: conditionEnum.optional(),
    estimatedHoaMonthly: optionalNonNegativeNumber(),
    annualPropertyTax: optionalNonNegativeNumber(),
    schoolScore: z.coerce.number().min(0).max(10).optional(),
    safetyScore: z.coerce.number().min(0).max(10).optional(),
    amenityScore: z.coerce.number().min(0).max(10).optional(),
    locationScore: z.coerce.number().min(0).max(10).optional(),
    commuteMinutes: optionalNonNegativeNumber(),
    rentalYieldPercent: z.coerce.number().min(0).max(30).optional(),
    appreciationScore: z.coerce.number().min(0).max(10).optional(),
    livingQualityScore: z.coerce.number().min(0).max(10).optional(),
    investmentPotentialScore: z.coerce.number().min(0).max(10).optional(),
    features: z.array(z.string().min(1)).max(50).optional(),
    notes: z.string().max(2000).optional()
  })
  .passthrough();

const propertyInputSchema = z.union([
  z.string().min(3),
  propertyObjectSchema
]);

const prioritiesSchema = z
  .object({
    price: optionalNumber(),
    location: optionalNumber(),
    investmentPotential: optionalNumber(),
    livingQuality: optionalNumber(),
    size: optionalNumber(),
    condition: optionalNumber(),
    hiddenCosts: optionalNumber()
  })
  .partial()
  .optional();

const preferencesSchema = z
  .object({
    budget: optionalPositiveNumber(),
    currency: z.string().min(3).max(5).optional(),
    mustHaves: z.array(z.string().min(1)).optional(),
    dealBreakers: z.array(z.string().min(1)).optional(),
    minBedrooms: optionalNonNegativeNumber(),
    minBathrooms: optionalNonNegativeNumber(),
    minSizeSqm: optionalPositiveNumber(),
    maxCommuteMinutes: optionalPositiveNumber(),
    purpose: z
      .enum([
        "primary_home",
        "rental_investment",
        "flip",
        "vacation_home",
        "mixed"
      ])
      .optional(),
    priorities: prioritiesSchema,
    outputFormat: z.enum(["json", "markdown", "both"]).optional()
  })
  .default({});

const compareRequestSchema = z.object({
  properties: z.array(propertyInputSchema).min(2).max(5),
  userPreferences: preferencesSchema
});

function validateCompareRequest(req, res, next) {
  const bodyToValidate = {
    properties: req.body?.properties,
    userPreferences: req.body?.userPreferences || req.body?.preferences || {}
  };

  const parsed = compareRequestSchema.safeParse(bodyToValidate);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "ValidationError",
      message: "Invalid compare request payload.",
      details: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }

  req.validatedBody = parsed.data;
  next();
}

module.exports = validateCompareRequest;