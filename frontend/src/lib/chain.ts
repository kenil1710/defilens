/**
 * Chain constants that are safe in the browser.
 *
 * Deliberately separate from `genlayer.ts`: that module imports the genlayer-js
 * client and reads the relayer key, so a client component importing it would
 * pull an SDK into the browser bundle to learn a chain id. Everything here is
 * a literal.
 */

export const CHAIN = {
  id: 61997,
  name: "GenLayer Studio Dev",
  rpc: "https://studio-dev.genlayer.com/api",
  explorer: "https://explorer-studio-dev.genlayer.com",
  currency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
} as const;

/** EIP-155 chain id as the hex string every wallet RPC expects. 61997 = 0xf22d. */
export const CHAIN_HEX = "0xf22d";

/** The payload for `wallet_addEthereumChain`, for a wallet that has never seen
 *  this network. Without it, a first-time visitor's switch attempt dead-ends. */
export const CHAIN_PARAMS = {
  chainId: CHAIN_HEX,
  chainName: CHAIN.name,
  nativeCurrency: CHAIN.currency,
  rpcUrls: [CHAIN.rpc],
  blockExplorerUrls: [CHAIN.explorer],
} as const;

export const GITHUB = "https://github.com/kenil1710/defilens";
