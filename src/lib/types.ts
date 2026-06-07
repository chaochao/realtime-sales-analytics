export type Transaction = {
  id: string;
  customerName: string;
  amount: number;
  currency: string;
  amountUsd: number;
  region: string;
  salesRep: string;
  date: string;       // ISO date (YYYY-MM-DD)
  createdAt: string;  // ISO datetime
};

export type NewTransactionInput = {
  customerName: string;
  amount: number;
  currency: string;
  region: string;
  salesRep: string;
  date?: string;      // defaults to today if omitted
};

export type Filter = {
  salesRep?: string;
  region?: string;
  customer?: string;
  currency?: string;
  amountMin?: number;
  amountMax?: number;
  dateFrom?: string;
  dateTo?: string;
};

export type Analytics = {
  totalRevenueUsd: number;
  transactionCount: number;
  avgDealSizeUsd: number;
  revenueByRegion: { region: string; revenueUsd: number }[];
  topReps: { salesRep: string; revenueUsd: number }[];
};

export type Ambiguity = { field: keyof Filter; term: string; candidates: string[] };

export type ResolveResult = {
  resolved: Filter;
  ambiguities: Ambiguity[];
  interpretation: string;
  needsClarification: boolean;
};

export type DriftInsight = {
  region: string;
  amount: number;
  z: number;
  prevAvg: number;
  newAvg: number;
  pctChange: number;
  message: string;
};
