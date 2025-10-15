import "dotenv/config";
export type SnapshotRow = {
    wallet_address: string;
    token_id: string;
};
export declare class FreezeCoordinator {
    private isPushing;
    private validateContractConfiguration;
    private monitorContractEvents;
    pushSnapshot(roundNumber: number, entries: SnapshotRow[]): Promise<string | null>;
    getFundsAdminInfo(): Promise<{
        fundsAdmin: string;
        isValidEOA: boolean;
    }>;
}
export declare const freezeCoordinator: FreezeCoordinator;
//# sourceMappingURL=freezeCoordinator.d.ts.map