"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logSecurityHeaders = exports.getSecurityHeaders = exports.developmentSecurityHeaders = exports.productionSecurityHeaders = void 0;
const helmet_1 = __importDefault(require("helmet"));
const crypto_1 = __importDefault(require("crypto"));
const getAllowedDomains = () => {
    const domains = [];
    domains.push("localhost:3000", "127.0.0.1:3000");
    if (process.env.FRONTEND_URL) {
        const url = new URL(process.env.FRONTEND_URL);
        domains.push(url.host);
    }
    if (process.env.VERCEL_APP_NAME) {
        domains.push(`${process.env.VERCEL_APP_NAME}.vercel.app`);
    }
    if (process.env.CUSTOM_DOMAIN) {
        domains.push(process.env.CUSTOM_DOMAIN);
    }
    return domains;
};
exports.productionSecurityHeaders = (0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", ...getAllowedDomains().map((d) => `https://${d}`)],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    frameguard: {
        action: "deny",
    },
    noSniff: true,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
    ieNoOpen: true,
    hidePoweredBy: true,
    xssFilter: true,
    referrerPolicy: {
        policy: "strict-origin-when-cross-origin",
    },
    dnsPrefetchControl: {
        allow: false,
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: {
        policy: "cross-origin",
    },
});
exports.developmentSecurityHeaders = (0, helmet_1.default)({
    contentSecurityPolicy: false,
    frameguard: {
        action: "sameorigin",
    },
    noSniff: true,
    hsts: false,
    ieNoOpen: true,
    hidePoweredBy: true,
    xssFilter: true,
    referrerPolicy: {
        policy: "no-referrer-when-downgrade",
    },
    dnsPrefetchControl: {
        allow: true,
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: {
        policy: "cross-origin",
    },
});
const getSecurityHeaders = () => {
    const isProduction = process.env.NODE_ENV === "production";
    if (isProduction) {
        console.log("🔒 [SECURITY] Using PRODUCTION security headers (strict)");
        console.log("🔒 [SECURITY] CSP domains:", getAllowedDomains());
        return exports.productionSecurityHeaders;
    }
    else {
        console.log("🔓 [SECURITY] Using DEVELOPMENT security headers (permissive)");
        return exports.developmentSecurityHeaders;
    }
};
exports.getSecurityHeaders = getSecurityHeaders;
const logSecurityHeaders = (req, res, next) => {
    const originalSend = res.send;
    res.send = function (body) {
        if (crypto_1.default.randomInt(1, 101) <= 1) {
            console.log(`🔒 [SECURITY] Headers applied to ${req.method} ${req.path}`, {
                timestamp: new Date().toISOString(),
                headers: {
                    "X-Content-Type-Options": res.get("X-Content-Type-Options"),
                    "X-Frame-Options": res.get("X-Frame-Options"),
                    "X-XSS-Protection": res.get("X-XSS-Protection"),
                    "Strict-Transport-Security": res.get("Strict-Transport-Security"),
                    "Referrer-Policy": res.get("Referrer-Policy"),
                },
            });
        }
        return originalSend.call(this, body);
    };
    next();
};
exports.logSecurityHeaders = logSecurityHeaders;
//# sourceMappingURL=securityHeaders.js.map