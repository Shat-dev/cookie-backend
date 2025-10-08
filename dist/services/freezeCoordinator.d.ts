import "dotenv/config";
export type SnapshotRow = {
    wallet_address: string;
    token_id: string;
};
export declare class FreezeCoordinator {
    private isPushing;
    performFinalValidation(): Promise<void>;
    pushSnapshot(roundNumber: number, entries: SnapshotRow[]): Promise<string | null>;
    freezeRound(roundNumber: number, entries: SnapshotRow[]): Promise<string | null>;
}
export declare const freezeCoordinator: FreezeCoordinator;
//# sourceMappingURL=freezeCoordinator.d.ts.map