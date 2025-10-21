import { Request, Response } from "express";
import { CountdownState } from "../repositories/countdownRepository";
export declare function restoreCountdownState(): Promise<void>;
export declare const getCountdownStatus: (req: Request, res: Response) => Promise<void>;
export declare const startCountdownRound: (req: Request, res: Response) => Promise<void>;
export declare const getCurrentState: () => Promise<CountdownState>;
export declare const resetCountdown: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=manualCountdownController.d.ts.map