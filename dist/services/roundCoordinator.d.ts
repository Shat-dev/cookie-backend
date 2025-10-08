import "dotenv/config";
import { type SnapshotRow } from "./freezeCoordinator";
export declare class RoundCoordinator {
    private creatingRound;
    createRoundIfNeeded(): Promise<number | null>;
    getFreezeTime(round: number): Promise<number>;
    freezeIfNeeded(round: number): Promise<{
        shouldFreeze: boolean;
        reason?: string;
        now: number;
        start: number;
        end: number;
        freezeAt: number;
        alreadyFrozen: boolean;
    }>;
    pushSnapshot(round: number, entries: SnapshotRow[]): Promise<string | null>;
}
export declare const roundCoordinator: RoundCoordinator;
//# sourceMappingURL=roundCoordinator.d.ts.map