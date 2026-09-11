export type Verdict = "SAFE" | "MODERATE" | "HIGH_RISK" | "UNKNOWN";

export const DIMENSIONS = [
  "tvl_health",
  "chain_diversity",
  "maturity",
  "category_risk",
  "momentum",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** The five dimensions, in the words a depositor would use, with the weight
 *  each carries. The weight is part of the label because it is load-bearing:
 *  a 55 on a 25%-weighted dimension moves the score more than a 55 on a 15% one. */
export const DIMENSION_META: Record<
  Dimension,
  { label: string; lower: string; weight: number; asks: string }
> = {
  tvl_health: {
    label: "TVL health",
    lower: "TVL health",
    weight: 25,
    asks: "How much of its all-time peak deposit base does the protocol still hold?",
  },
  chain_diversity: {
    label: "Chain diversity",
    lower: "chain diversity",
    weight: 20,
    asks: "How many chains is it deployed on? One chain is one outage away from all of it.",
  },
  maturity: {
    label: "Maturity",
    lower: "maturity",
    weight: 20,
    asks: "How long has it been holding deposits? Time is the only audit nobody can buy.",
  },
  category_risk: {
    label: "Category risk",
    lower: "category risk",
    weight: 20,
    asks: "How much is at stake in its category? A bridge concentrates every chain's deposits behind one validator set.",
  },
  momentum: {
    label: "Momentum",
    lower: "momentum",
    weight: 15,
    asks: "Which way has TVL moved over the last thirty days?",
  },
};

export type Assessment = {
  found: boolean;
  assessment_id: number;
  seq: number;
  slug: string;
  name: string;
  category: string;
  category_mapped: boolean;
  kind: "child" | "parent";
  verdict: Verdict;
  overall_score: number;
  scores: Record<Dimension, number>;
  weights: Record<Dimension, number>;
  labels: string[];
  audit_status: string;
  audit_bonus: number;
  audit_note: string;
  evidence: string;
  content_hash: string;
  rubric_version: string;
  tvl_usd: number;
  peak_tvl_usd: number;
  tvl_pct_of_peak: number;
  chain_count: number;
  chains: string[];
  children: string[];
  age_days: number;
  first_tvl_day: number;
  tvl_change_30d_pct: number;
  has_tvl_history: boolean;
  analyzed_at: number;
  analyst: string;
  fee_paid_wei: number | string;
  explorer_url: string;
  reason?: string;
};

export type ProtocolSummary = {
  slug: string;
  name: string;
  category: string;
  verdict: Verdict;
  overall_score: number;
  tvl_usd: number;
  assessment_id: number;
  analysis_count: number;
  best_score: number;
  worst_score: number;
  last_analyzed: number;
  first_analyzed: number;
};

export type Stats = {
  protocols_tracked: number;
  categories_tracked: number;
  total_requests: number;
  total_analyzed: number;
  total_rejected: number;
  verdicts: Record<Verdict, number>;
  average_score: number;
  average_dimensions: Record<Dimension, number>;
  fees_collected_wei: number | string;
  balance_wei: number | string;
  refunds_owed_wei: number | string;
  paused: boolean;
};

export type Config = {
  owner: string;
  paused: boolean;
  fee_wei: number | string;
  max_fee_wei: number | string;
  rubric_version: string;
  dimensions: Dimension[];
  weights: Record<Dimension, number>;
  quantisation_step: number;
  thresholds: { SAFE: number; MODERATE: number };
  verdicts: Verdict[];
  audit_bonus_max: number;
  audit_levels: string[];
  ladders: Record<string, number[]>;
  labels: Record<Dimension, string[]>;
  rate_limit_seconds: number;
  protocol_cooldown_seconds: number;
  pending_ttl_seconds: number;
  history_per_protocol: number;
  max_protocols: number;
  data_source: string;
  endpoints: string[];
};

export type Verification = {
  verified: boolean;
  assessment_id: number;
  slug: string;
  rubric_version: string;
  stored_rubric_version: string;
  evidence: string;
  differences: string[];
  recomputed: {
    overall_score: number;
    verdict: Verdict;
    scores: Record<Dimension, number>;
    labels: string[];
    audit_status: string;
    audit_bonus: number;
    bands: Record<string, number | boolean>;
    content_hash: string;
  };
  reason?: string;
};

export type LlamaProtocol = {
  slug: string;
  name: string;
  category: string;
  tvl: number;
  chains: number;
  logo?: string;
  parent?: string;
};
