interface VrfDrawResult {
    success: boolean;
    txHash?: string;
    winnerAddress?: string;
    winningTokenId?: string;
    roundId?: number;
    roundNumber?: number;
    message: string;
    error?: string;
}
export declare function executeVrfDraw(adminIp?: string, userAgent?: string): Promise<VrfDrawResult>;
export {};
//# sourceMappingURL=vrfDrawService.d.ts.map