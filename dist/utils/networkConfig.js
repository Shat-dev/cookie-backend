"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VRF_NATIVE = exports.LINK_TOKEN = exports.VRF_SUBSCRIPTION_ID = exports.VRF_KEY_HASH = exports.VRF_COORDINATOR = exports.COOKIE_CONTRACT_ADDRESS = exports.LOTTERY_CONTRACT_ADDRESS = exports.PRIVATE_KEY = exports.RPC_URL = exports.CHAIN_ID = exports.NETWORK_NAME = void 0;
require("dotenv/config");
const LotteryVrfV25Address_json_1 = __importDefault(require("../constants/LotteryVrfV25Address.json"));
const contract_address_json_1 = __importDefault(require("../constants/contract-address.json"));
const VrfConfig_json_1 = __importDefault(require("../constants/VrfConfig.json"));
function requireEnv(name) {
    const v = process.env[name];
    if (!v || !v.trim())
        throw new Error(`Missing required env: ${name}`);
    return v.trim();
}
function getEnv(name, defaultValue) {
    return process.env[name] || defaultValue;
}
exports.NETWORK_NAME = LotteryVrfV25Address_json_1.default.network;
exports.CHAIN_ID = Number(LotteryVrfV25Address_json_1.default.chainId);
exports.RPC_URL = requireEnv("RPC_URL");
exports.PRIVATE_KEY = getEnv("PRIVATE_KEY", "");
exports.LOTTERY_CONTRACT_ADDRESS = LotteryVrfV25Address_json_1.default.LotteryVrfV25;
exports.COOKIE_CONTRACT_ADDRESS = contract_address_json_1.default.Cookie;
exports.VRF_COORDINATOR = VrfConfig_json_1.default.VRF_COORDINATOR;
exports.VRF_KEY_HASH = VrfConfig_json_1.default.KEY_HASH;
exports.VRF_SUBSCRIPTION_ID = VrfConfig_json_1.default.SUB_ID;
exports.LINK_TOKEN = VrfConfig_json_1.default.LINK_TOKEN;
exports.VRF_NATIVE = VrfConfig_json_1.default.VRF_NATIVE === "true";
console.log(`🌐 Network: ${exports.NETWORK_NAME} (Chain ID: ${exports.CHAIN_ID})`);
console.log(`📍 RPC URL: ${exports.RPC_URL}`);
console.log(`🎰 Lottery Contract: ${exports.LOTTERY_CONTRACT_ADDRESS}`);
console.log(`🍪 Cookie Contract: ${exports.COOKIE_CONTRACT_ADDRESS}`);
if (exports.VRF_COORDINATOR) {
    console.log(`🎲 VRF Coordinator: ${exports.VRF_COORDINATOR}`);
    console.log(`🔑 VRF Key Hash: ${exports.VRF_KEY_HASH}`);
    console.log(`📋 VRF Subscription ID: ${exports.VRF_SUBSCRIPTION_ID}`);
    console.log(`💰 VRF Native Payment: ${exports.VRF_NATIVE}`);
}
//# sourceMappingURL=networkConfig.js.map