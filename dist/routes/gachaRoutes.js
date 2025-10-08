"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ethers_1 = require("ethers");
const contract_address_json_1 = __importDefault(require("../constants/contract-address.json"));
const GachaABI_json_1 = __importDefault(require("../constants/GachaABI.json"));
const rpcProvider_1 = require("../utils/rpcProvider");
const router = express_1.default.Router();
const GACHA_ADDRESS = "0xfEF80b5Fb80B92406fbbAAbEB96cD780ae0c5c56";
const provider = rpcProvider_1.robustRpcProvider.getProvider();
const GACHA_ADDR = contract_address_json_1.default?.Gacha?.trim();
if (!GACHA_ADDR || !ethers_1.ethers.isAddress(GACHA_ADDR)) {
    throw new Error(`Invalid Gacha address in contract-address.json: '${GACHA_ADDR}'`);
}
const GACHA_ABI = GachaABI_json_1.default.abi;
const gacha = new ethers_1.ethers.Contract(GACHA_ADDR, GACHA_ABI, provider);
router.get("/gacha/owned/:wallet", async (req, res) => {
    try {
        const wallet = req.params.wallet;
        if (!ethers_1.ethers.isAddress(wallet)) {
            return res.status(400).json({ success: false, error: "invalid wallet" });
        }
        const ids = await gacha.owned(wallet);
        const tokenIds = ids.map((b) => b.toString());
        return res.json({
            success: true,
            wallet,
            tokenIds,
            count: tokenIds.length,
        });
    }
    catch (e) {
        console.error("gacha/owned error:", e);
        return res
            .status(500)
            .json({ success: false, error: e?.message || "internal error" });
    }
});
exports.default = router;
//# sourceMappingURL=gachaRoutes.js.map