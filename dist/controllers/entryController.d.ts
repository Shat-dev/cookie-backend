import { Request, Response } from "express";
declare function getCurrentPool(_req: Request, res: Response): Promise<void>;
declare function submitEntry(req: Request, res: Response): Promise<void>;
declare function verifyEntry(req: Request, res: Response): Promise<void>;
export declare const entryController: {
    getCurrentPool: typeof getCurrentPool;
    submitEntry: typeof submitEntry;
    verifyEntry: typeof verifyEntry;
};
export {};
//# sourceMappingURL=entryController.d.ts.map