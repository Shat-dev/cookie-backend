"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ethers_1 = require("ethers");
const contract_address_json_1 = __importDefault(require("../constants/contract-address.json"));
const CookieABI_json_1 = __importDefault(require("../constants/CookieABI.json"));
const rpcProvider_1 = require("../utils/rpcProvider");
const router = express_1.default.Router();
const COOKIE_ADDRESS = "0xfEF80b5Fb80B92406fbbAAbEB96cD780ae0c5c56";
const provider = rpcProvider_1.robustRpcProvider.getProvider();
const COOKIE_ADDR = contract_address_json_1.default?.Cookie?.trim();
if (!COOKIE_ADDR || !ethers_1.ethers.isAddress(COOKIE_ADDR)) {
    throw new Error(`Invalid Cookie address in contract-address.json: '${COOKIE_ADDR}'`);
}
const COOKIE_ABI = CookieABI_json_1.default.abi;
const cookie = new ethers_1.ethers.Contract(COOKIE_ADDR, COOKIE_ABI, provider);
router.get("/cookie/owned/:wallet", async (req, res) => {
    try {
        const wallet = req.params.wallet;
        if (!ethers_1.ethers.isAddress(wallet)) {
            return res.status(400).json({ success: false, error: "invalid wallet" });
        }
        const ids = await cookie.owned(wallet);
        const tokenIds = ids.map((b) => b.toString());
        return res.json({
            success: true,
            wallet,
            tokenIds,
            count: tokenIds.length,
        });
    }
    catch (e) {
        console.error("cookie/owned error:", e);
        return res
            .status(500)
            .json({ success: false, error: e?.message || "internal error" });
    }
});
exports.default = router;
//# sourceMappingURL=cookieRoutes.js.map