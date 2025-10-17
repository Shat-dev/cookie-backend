import "dotenv/config";
import lotteryAddr from "../constants/LotteryVrfV25Address.json";
import cookie from "../constants/contract-address.json";
import vrfConfig from "../constants/VrfConfig.json";

/** Require an env var with a friendly error */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing required env: ${name}`);
  return v.trim();
}

/** Get an env var with a default value */
function getEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

// Network configuration from JSON file
export const NETWORK_NAME = lotteryAddr.network;
export const CHAIN_ID = Number(lotteryAddr.chainId);
export const RPC_URL = requireEnv("RPC_URL");
export const PRIVATE_KEY = getEnv("PRIVATE_KEY", "");

// Contract addresses from JSON file and environment variables
export const LOTTERY_CONTRACT_ADDRESS = lotteryAddr.LotteryVrfV25;
export const COOKIE_CONTRACT_ADDRESS = cookie.Cookie;

// VRF configuration from JSON file
export const VRF_COORDINATOR = vrfConfig.VRF_COORDINATOR;
export const VRF_KEY_HASH = vrfConfig.KEY_HASH;
export const VRF_SUBSCRIPTION_ID = vrfConfig.SUB_ID;
export const LINK_TOKEN = vrfConfig.LINK_TOKEN;
export const VRF_NATIVE = vrfConfig.VRF_NATIVE === "true";

// Log network configuration on startup
console.log(`🌐 Network: ${NETWORK_NAME} (Chain ID: ${CHAIN_ID})`);
console.log(`📍 RPC URL: ${RPC_URL}`);
console.log(`🎰 Lottery Contract: ${LOTTERY_CONTRACT_ADDRESS}`);
console.log(`🍪 Cookie Contract: ${COOKIE_CONTRACT_ADDRESS}`);
if (VRF_COORDINATOR) {
  console.log(`🎲 VRF Coordinator: ${VRF_COORDINATOR}`);
  console.log(`🔑 VRF Key Hash: ${VRF_KEY_HASH}`);
  console.log(`📋 VRF Subscription ID: ${VRF_SUBSCRIPTION_ID}`);
  console.log(`💰 VRF Native Payment: ${VRF_NATIVE}`);
}
