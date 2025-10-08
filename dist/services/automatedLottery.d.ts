import "dotenv/config";
export declare class AutomatedLotteryService {
    private isRunning;
    private isTicking;
    private timer;
    private checkInterval;
    private lastRemainingMinutes;
    start(): void;
    stop(): void;
    private tick;
    private performFreeze;
    private recoverSnapshotAfterEnd;
}
export declare const automatedLotteryService: AutomatedLotteryService;
//# sourceMappingURL=automatedLottery.d.ts.map