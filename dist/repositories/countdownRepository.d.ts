export interface CountdownState {
    id: number;
    phase: "starting" | "countdown" | "selecting" | "winner" | "new_round";
    ends_at: Date | null;
    is_active: boolean;
    updated_at: Date;
}
export declare function getCountdownState(): Promise<CountdownState>;
export declare function setCountdownState(state: {
    phase?: CountdownState["phase"];
    ends_at?: Date | null;
    is_active?: boolean;
}): Promise<void>;
export declare function resetCountdownState(): Promise<void>;
//# sourceMappingURL=countdownRepository.d.ts.map