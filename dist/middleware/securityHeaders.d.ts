export declare const productionSecurityHeaders: (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: (err?: unknown) => void) => void;
export declare const developmentSecurityHeaders: (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: (err?: unknown) => void) => void;
export declare const getSecurityHeaders: () => (req: import("http").IncomingMessage, res: import("http").ServerResponse, next: (err?: unknown) => void) => void;
export declare const logSecurityHeaders: (req: any, res: any, next: any) => void;
//# sourceMappingURL=securityHeaders.d.ts.map