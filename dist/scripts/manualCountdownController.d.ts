import { Request, Response } from "express";
interface CountdownState {
    phase: "starting" | "countdown" | "selecting" | "winner" | "new_round";
    endsAt: Date | null;
    isActive: boolean;
}
export declare const getCountdownStatus: (req: Request, res: Response) => void;
export declare const startCountdownRound: (req: Request, res: Response) => void;
export declare const getCurrentState: () => CountdownState;
export declare const resetCountdown: (req: Request, res: Response) => void;
export {};
//# sourceMappingURL=manualCountdownController.d.ts.map