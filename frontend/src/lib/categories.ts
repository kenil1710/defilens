/**
 * DeFi Llama's category vocabulary, grouped into the handful a depositor
 * actually filters by.
 *
 * Llama publishes dozens of categories ("Dexs", "Derivatives", "Liquid
 * Staking", "CDP", "Leveraged Farming"…). A filter listing all of them is a
 * filter nobody uses, so these are the buckets — and the raw category is still
 * shown on every card, because the group is for finding things and the exact
 * category is what the rubric actually scored.
 *
 * A category in no group still appears under "All"; grouping is a convenience,
 * never a gate that could hide a rating.
 */
export const CATEGORY_GROUPS: Record<string, string[]> = {
  DEX: ["Dexs", "DEX Aggregator", "Dex Aggregator"],
  Lending: ["Lending", "CDP", "NFT Lending", "Uncollateralized Lending"],
  Bridge: ["Bridge", "Cross Chain", "Cross Chain Bridge", "Canonical Bridge"],
  Yield: [
    "Yield", "Yield Aggregator", "Farm", "Leveraged Farming",
    "Liquidity manager", "Managed Token Pools",
  ],
  Staking: ["Liquid Staking", "Restaking", "Liquid Restaking", "Staking Pool"],
  Derivatives: ["Derivatives", "Options", "Options Vault", "Synthetics", "Prediction Market"],
  Stablecoins: ["Algo-Stables", "Stablecoin Issuer", "Basis Trading", "RWA", "RWA Lending"],
  Other: ["Insurance", "Payments", "Privacy", "Launchpad", "Services", "Chain", "CEX"],
};
