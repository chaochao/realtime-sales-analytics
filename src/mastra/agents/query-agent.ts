import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { Filter } from "@/src/lib/types";

const filterSchema = z.object({
  salesRep: z.string().optional(),
  region: z.string().optional(),
  customer: z.string().optional(),
  currency: z.string().optional(),
  amountMin: z.number().optional(),
  amountMax: z.number().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export async function parseQuery(text: string): Promise<Filter> {
  if (!process.env.OPENAI_API_KEY) return {};
  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: filterSchema,
      prompt: `Extract sales transaction filters from this request. Use partial names exactly as typed — do NOT guess full names. Omit fields not mentioned. Dates: ISO (YYYY-MM-DD). Amounts: numbers only.

Request: "${text}"`,
    });
    return Object.fromEntries(
      Object.entries(object).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    ) as Filter;
  } catch {
    return {};
  }
}
