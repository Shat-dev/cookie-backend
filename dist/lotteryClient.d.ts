import "dotenv/config";
import { ethers } from "ethers";
export declare const provider: ethers.JsonRpcProvider;
export declare const signer: ethers.Wallet | null;
export declare const lottery: ethers.Contract;
export declare function setFundsAdmin(newFundsAdmin: string): Promise<string>;
export declare function adminWithdrawAllETH(): Promise<string>;
export declare function fundPrizePool(amountBnb: string): Promise<string>;
export declare function getFundsAdmin(): Promise<string>;
export declare function getContractOwner(): Promise<string>;
export declare function getContractBalance(): Promise<string>;
export declare function isValidWinner(address: string): Promise<boolean>;
export declare function createInstantRound(windowSeconds?: number): Promise<number>;
export interface RoundData {
    start: string;
    end: string;
    isActive: boolean;
    isCompleted: boolean;
    winner: string;
    winningTokenId: string;
    totalEntries: string;
}
export declare function getRound(round: number): Promise<RoundData>;
export declare function getWinnerFor(round: number): Promise<{
    winner: any;
    tokenId: bigint;
}>;
export declare function checkAndInvalidateCompletedRounds(fromBlock?: number): Promise<number[]>;
export declare function getFulfillmentLog(requestId: bigint): Promise<{
    blockNumber: number;
    txHash: string;
    success: boolean;
    paymentJuels: bigint;
    outputSeed: bigint;
} | null>;
export declare function waitForFulfillment(requestId: bigint, timeoutMs?: number, pollMs?: number, fromBlockHint?: number): Promise<{
    blockNumber: number;
    txHash: string;
    success: boolean;
    paymentJuels: bigint;
    outputSeed: bigint;
}>;
export declare function ensureVrfReady(minLink?: string): Promise<void>;
export declare function drawAndWait(round: number, timeoutMs?: number, pollMs?: number): Promise<{
    winner: string;
    tokenId: bigint;
}>;
//# sourceMappingURL=lotteryClient.d.ts.map