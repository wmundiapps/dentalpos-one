"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/dotenv/package.json
var require_package = __commonJS({
  "node_modules/dotenv/package.json"(exports2, module2) {
    module2.exports = {
      name: "dotenv",
      version: "16.6.1",
      description: "Loads environment variables from .env file",
      main: "lib/main.js",
      types: "lib/main.d.ts",
      exports: {
        ".": {
          types: "./lib/main.d.ts",
          require: "./lib/main.js",
          default: "./lib/main.js"
        },
        "./config": "./config.js",
        "./config.js": "./config.js",
        "./lib/env-options": "./lib/env-options.js",
        "./lib/env-options.js": "./lib/env-options.js",
        "./lib/cli-options": "./lib/cli-options.js",
        "./lib/cli-options.js": "./lib/cli-options.js",
        "./package.json": "./package.json"
      },
      scripts: {
        "dts-check": "tsc --project tests/types/tsconfig.json",
        lint: "standard",
        pretest: "npm run lint && npm run dts-check",
        test: "tap run --allow-empty-coverage --disable-coverage --timeout=60000",
        "test:coverage": "tap run --show-full-coverage --timeout=60000 --coverage-report=text --coverage-report=lcov",
        prerelease: "npm test",
        release: "standard-version"
      },
      repository: {
        type: "git",
        url: "git://github.com/motdotla/dotenv.git"
      },
      homepage: "https://github.com/motdotla/dotenv#readme",
      funding: "https://dotenvx.com",
      keywords: [
        "dotenv",
        "env",
        ".env",
        "environment",
        "variables",
        "config",
        "settings"
      ],
      readmeFilename: "README.md",
      license: "BSD-2-Clause",
      devDependencies: {
        "@types/node": "^18.11.3",
        decache: "^4.6.2",
        sinon: "^14.0.1",
        standard: "^17.0.0",
        "standard-version": "^9.5.0",
        tap: "^19.2.0",
        typescript: "^4.8.4"
      },
      engines: {
        node: ">=12"
      },
      browser: {
        fs: false
      }
    };
  }
});

// node_modules/dotenv/lib/main.js
var require_main = __commonJS({
  "node_modules/dotenv/lib/main.js"(exports2, module2) {
    var fs2 = require("fs");
    var path2 = require("path");
    var os2 = require("os");
    var crypto2 = require("crypto");
    var packageJson = require_package();
    var version = packageJson.version;
    var LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
    function parse(src) {
      const obj = {};
      let lines = src.toString();
      lines = lines.replace(/\r\n?/mg, "\n");
      let match;
      while ((match = LINE.exec(lines)) != null) {
        const key = match[1];
        let value = match[2] || "";
        value = value.trim();
        const maybeQuote = value[0];
        value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
        if (maybeQuote === '"') {
          value = value.replace(/\\n/g, "\n");
          value = value.replace(/\\r/g, "\r");
        }
        obj[key] = value;
      }
      return obj;
    }
    function _parseVault(options) {
      options = options || {};
      const vaultPath = _vaultPath(options);
      options.path = vaultPath;
      const result = DotenvModule.configDotenv(options);
      if (!result.parsed) {
        const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
        err.code = "MISSING_DATA";
        throw err;
      }
      const keys = _dotenvKey(options).split(",");
      const length = keys.length;
      let decrypted;
      for (let i = 0; i < length; i++) {
        try {
          const key = keys[i].trim();
          const attrs = _instructions(result, key);
          decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
          break;
        } catch (error) {
          if (i + 1 >= length) {
            throw error;
          }
        }
      }
      return DotenvModule.parse(decrypted);
    }
    function _warn(message) {
      console.log(`[dotenv@${version}][WARN] ${message}`);
    }
    function _debug(message) {
      console.log(`[dotenv@${version}][DEBUG] ${message}`);
    }
    function _log(message) {
      console.log(`[dotenv@${version}] ${message}`);
    }
    function _dotenvKey(options) {
      if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
        return options.DOTENV_KEY;
      }
      if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
        return process.env.DOTENV_KEY;
      }
      return "";
    }
    function _instructions(result, dotenvKey) {
      let uri;
      try {
        uri = new URL(dotenvKey);
      } catch (error) {
        if (error.code === "ERR_INVALID_URL") {
          const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        }
        throw error;
      }
      const key = uri.password;
      if (!key) {
        const err = new Error("INVALID_DOTENV_KEY: Missing key part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environment = uri.searchParams.get("environment");
      if (!environment) {
        const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
      const ciphertext = result.parsed[environmentKey];
      if (!ciphertext) {
        const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
        err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
        throw err;
      }
      return { ciphertext, key };
    }
    function _vaultPath(options) {
      let possibleVaultPath = null;
      if (options && options.path && options.path.length > 0) {
        if (Array.isArray(options.path)) {
          for (const filepath of options.path) {
            if (fs2.existsSync(filepath)) {
              possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
            }
          }
        } else {
          possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
        }
      } else {
        possibleVaultPath = path2.resolve(process.cwd(), ".env.vault");
      }
      if (fs2.existsSync(possibleVaultPath)) {
        return possibleVaultPath;
      }
      return null;
    }
    function _resolveHome(envPath) {
      return envPath[0] === "~" ? path2.join(os2.homedir(), envPath.slice(1)) : envPath;
    }
    function _configVault(options) {
      const debug = Boolean(options && options.debug);
      const quiet = options && "quiet" in options ? options.quiet : true;
      if (debug || !quiet) {
        _log("Loading env from encrypted .env.vault");
      }
      const parsed = DotenvModule._parseVault(options);
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsed, options);
      return { parsed };
    }
    function configDotenv(options) {
      const dotenvPath = path2.resolve(process.cwd(), ".env");
      let encoding = "utf8";
      const debug = Boolean(options && options.debug);
      const quiet = options && "quiet" in options ? options.quiet : true;
      if (options && options.encoding) {
        encoding = options.encoding;
      } else {
        if (debug) {
          _debug("No encoding is specified. UTF-8 is used by default");
        }
      }
      let optionPaths = [dotenvPath];
      if (options && options.path) {
        if (!Array.isArray(options.path)) {
          optionPaths = [_resolveHome(options.path)];
        } else {
          optionPaths = [];
          for (const filepath of options.path) {
            optionPaths.push(_resolveHome(filepath));
          }
        }
      }
      let lastError;
      const parsedAll = {};
      for (const path3 of optionPaths) {
        try {
          const parsed = DotenvModule.parse(fs2.readFileSync(path3, { encoding }));
          DotenvModule.populate(parsedAll, parsed, options);
        } catch (e) {
          if (debug) {
            _debug(`Failed to load ${path3} ${e.message}`);
          }
          lastError = e;
        }
      }
      let processEnv = process.env;
      if (options && options.processEnv != null) {
        processEnv = options.processEnv;
      }
      DotenvModule.populate(processEnv, parsedAll, options);
      if (debug || !quiet) {
        const keysCount = Object.keys(parsedAll).length;
        const shortPaths = [];
        for (const filePath of optionPaths) {
          try {
            const relative = path2.relative(process.cwd(), filePath);
            shortPaths.push(relative);
          } catch (e) {
            if (debug) {
              _debug(`Failed to load ${filePath} ${e.message}`);
            }
            lastError = e;
          }
        }
        _log(`injecting env (${keysCount}) from ${shortPaths.join(",")}`);
      }
      if (lastError) {
        return { parsed: parsedAll, error: lastError };
      } else {
        return { parsed: parsedAll };
      }
    }
    function config2(options) {
      if (_dotenvKey(options).length === 0) {
        return DotenvModule.configDotenv(options);
      }
      const vaultPath = _vaultPath(options);
      if (!vaultPath) {
        _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
        return DotenvModule.configDotenv(options);
      }
      return DotenvModule._configVault(options);
    }
    function decrypt(encrypted, keyStr) {
      const key = Buffer.from(keyStr.slice(-64), "hex");
      let ciphertext = Buffer.from(encrypted, "base64");
      const nonce = ciphertext.subarray(0, 12);
      const authTag = ciphertext.subarray(-16);
      ciphertext = ciphertext.subarray(12, -16);
      try {
        const aesgcm = crypto2.createDecipheriv("aes-256-gcm", key, nonce);
        aesgcm.setAuthTag(authTag);
        return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
      } catch (error) {
        const isRange = error instanceof RangeError;
        const invalidKeyLength = error.message === "Invalid key length";
        const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
        if (isRange || invalidKeyLength) {
          const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
          err.code = "INVALID_DOTENV_KEY";
          throw err;
        } else if (decryptionFailed) {
          const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
          err.code = "DECRYPTION_FAILED";
          throw err;
        } else {
          throw error;
        }
      }
    }
    function populate(processEnv, parsed, options = {}) {
      const debug = Boolean(options && options.debug);
      const override = Boolean(options && options.override);
      if (typeof parsed !== "object") {
        const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
        err.code = "OBJECT_REQUIRED";
        throw err;
      }
      for (const key of Object.keys(parsed)) {
        if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
          if (override === true) {
            processEnv[key] = parsed[key];
          }
          if (debug) {
            if (override === true) {
              _debug(`"${key}" is already defined and WAS overwritten`);
            } else {
              _debug(`"${key}" is already defined and was NOT overwritten`);
            }
          }
        } else {
          processEnv[key] = parsed[key];
        }
      }
    }
    var DotenvModule = {
      configDotenv,
      _configVault,
      _parseVault,
      config: config2,
      decrypt,
      parse,
      populate
    };
    module2.exports.configDotenv = DotenvModule.configDotenv;
    module2.exports._configVault = DotenvModule._configVault;
    module2.exports._parseVault = DotenvModule._parseVault;
    module2.exports.config = DotenvModule.config;
    module2.exports.decrypt = DotenvModule.decrypt;
    module2.exports.parse = DotenvModule.parse;
    module2.exports.populate = DotenvModule.populate;
    module2.exports = DotenvModule;
  }
});

// src/scripts/receitaImport.ts
var receitaImport_exports = {};
__export(receitaImport_exports, {
  cacheDir: () => cacheDir,
  establishmentRecord: () => establishmentRecord,
  fixOldMobile: () => fixOldMobile,
  isMeiNature: () => isMeiNature,
  latestMonth: () => latestMonth,
  pgConfig: () => pgConfig,
  shareInfo: () => shareInfo,
  splitRow: () => splitRow,
  zipLines: () => zipLines
});
module.exports = __toCommonJS(receitaImport_exports);
var import_node_fs = __toESM(require("node:fs"));
var import_node_os = __toESM(require("node:os"));
var import_node_path = __toESM(require("node:path"));
var import_node_readline = __toESM(require("node:readline"));
var import_promises = require("node:stream/promises");
var import_node_stream = require("node:stream");
var import_node_zlib = __toESM(require("node:zlib"));

// src/config.ts
var import_dotenv = __toESM(require_main());
import_dotenv.default.config();
function list(v) {
  return (v || "").split(",").map((s) => s.trim()).filter(Boolean);
}
var isProduction = process.env.NODE_ENV === "production";
var config = {
  port: Number(process.env.PORT || 4e3),
  jwtSecret: process.env.JWT_SECRET || (isProduction ? "" : "revah-dev-secret-change-me"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  encryptionKey: process.env.ENCRYPTION_KEY || "",
  publicApiUrl: (process.env.PUBLIC_API_URL || "http://localhost:4000").replace(/\/$/, ""),
  appUrl: (process.env.APP_URL || "http://localhost:5174").replace(/\/$/, ""),
  siteUrl: (process.env.SITE_URL || "https://revah.com.br").replace(/\/$/, ""),
  corsOrigins: list(process.env.CORS_ORIGINS),
  cronSecret: process.env.CRON_SECRET || "",
  superadminEmails: list(process.env.REVAH_SUPERADMIN_EMAILS).map((e) => e.toLowerCase()),
  adminRequire2fa: process.env.REVAH_ADMIN_REQUIRE_2FA !== "0",
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    prices: {
      START: process.env.STRIPE_PRICE_START || "",
      PRO: process.env.STRIPE_PRICE_PRO || "",
      LEADS: process.env.STRIPE_PRICE_LEADS || ""
    },
    // Vendas internacionais: cartão. Adicione boleto/pix se a conta Stripe permitir.
    paymentMethods: list(process.env.STRIPE_PAYMENT_METHODS || "card")
  },
  // Asaas: vendas no Brasil (Pix, boleto e cartão), assinatura mensal.
  asaas: {
    apiKey: process.env.ASAAS_API_KEY || "",
    baseUrl: (process.env.ASAAS_BASE_URL || "https://api.asaas.com/v3").replace(/\/$/, ""),
    webhookToken: process.env.ASAAS_WEBHOOK_TOKEN || ""
  },
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.REVAH_AI_MODEL || "claude-opus-5"
  },
  meta: {
    verifyToken: process.env.META_VERIFY_TOKEN || "",
    appSecret: process.env.META_APP_SECRET || "",
    graphVersion: process.env.META_GRAPH_VERSION || "v21.0"
  },
  leads: {
    googlePlacesKey: process.env.GOOGLE_PLACES_API_KEY || "",
    termsVersion: process.env.LEADS_TERMS_VERSION || "2026-09-v1",
    // Dados abertos de CNPJ (compartilhamento público no Nextcloud da Receita Federal).
    cnpjDataUrl: (process.env.RECEITA_CNPJ_URL || "https://arquivos.receitafederal.gov.br/index.php/s/YggdBLfdninEJX9").replace(/\/$/, "")
  },
  // LinkedIn Lead Sync (formulários de anúncios da própria empresa). Exige app aprovado no produto "Lead Sync API".
  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID || "",
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET || "",
    apiVersion: process.env.LINKEDIN_API_VERSION || "202509"
  },
  dentalpos: {
    // Segredo compartilhado com o DentalPos One (SSO + provisionamento servidor-a-servidor).
    sharedSecret: process.env.DENTALPOS_SHARED_SECRET || ""
  },
  systemEmail: {
    // Usa a mesma conta Resend do DentalPos (domínio dentalpos.com.br verificado) se não houver uma própria.
    resendKey: process.env.REVAH_SYSTEM_RESEND_KEY || process.env.RESEND_API_KEY || "",
    from: process.env.REVAH_SYSTEM_EMAIL_FROM || "REVAH <contato@dentalpos.com.br>",
    // Recebe o aviso de cada conta nova criada.
    adminNotify: process.env.REVAH_ADMIN_NOTIFY_EMAIL || "contato@dentalpos.com.br"
  },
  worker: {
    batchSize: Number(process.env.WORKER_BATCH_SIZE || 25),
    // Intervalo mínimo entre envios de campanha no mesmo canal (ms) — protege a reputação do número.
    campaignThrottleMs: Number(process.env.CAMPAIGN_THROTTLE_MS || 1500)
  }
};
var defaultLimits = {
  TRIAL: { users: 1, channels: 2, monthlyMessages: 0, voice: false, ai: "basic", templates: 5, integrations: 0, csvImport: false },
  START: { users: 3, channels: 3, monthlyMessages: 5e3, voice: false, ai: "basic", templates: 5, integrations: 1, csvImport: false },
  PRO: { users: 10, channels: null, monthlyMessages: 25e3, voice: true, ai: "advanced", templates: null, integrations: null, csvImport: true },
  ENTERPRISE: { users: null, channels: null, monthlyMessages: null, voice: true, ai: "advanced", templates: null, integrations: null, csvImport: true }
};
function loadLimits() {
  try {
    const raw = process.env.PLAN_LIMITS_JSON;
    if (!raw) return defaultLimits;
    const parsed = JSON.parse(raw);
    return {
      TRIAL: { ...defaultLimits.TRIAL, ...parsed.TRIAL },
      START: { ...defaultLimits.START, ...parsed.START },
      PRO: { ...defaultLimits.PRO, ...parsed.PRO },
      ENTERPRISE: { ...defaultLimits.ENTERPRISE, ...parsed.ENTERPRISE }
    };
  } catch {
    return defaultLimits;
  }
}
var planLimits = loadLimits();
var TRIAL_RULES = {
  days: Number(process.env.TRIAL_DAYS || 14),
  maxRecipientsPerCampaign: 20,
  maxMessages: Number(process.env.TRIAL_MAX_MESSAGES || 1e3)
};
var PLAN_PRICES_BRL = {
  START: Number(process.env.PRICE_START_BRL || 247),
  PRO: Number(process.env.PRICE_PRO_BRL || 597)
};
var LEADS_PRICE_BRL = Number(process.env.PRICE_LEADS_BRL || 0);

// src/scripts/receitaImport.ts
var import_node_crypto = __toESM(require("node:crypto"));
var import_pg = require("pg");

// src/lib/normalize.ts
function digits(v) {
  return String(v ?? "").replace(/\D/g, "");
}
function normalizePhone(raw, defaultCountry = "55") {
  let d = digits(raw);
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = defaultCountry + d;
  if (d.startsWith("55")) {
    if (d.length !== 12 && d.length !== 13) return null;
    const ddd = Number(d.slice(2, 4));
    if (ddd < 11 || ddd > 99) return null;
    return d;
  }
  return d.length >= 8 && d.length <= 15 ? d : null;
}
function normalizeEmail(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : null;
}
function searchText(v) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// src/scripts/receitaImport.ts
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] ?? true;
  }
  return out;
}
var db;
function pgConfig(url) {
  const u = new URL(url);
  for (const k of ["sslmode", "connection_limit", "pgbouncer", "schema"]) u.searchParams.delete(k);
  const local = ["localhost", "127.0.0.1"].includes(u.hostname);
  return { connectionString: u.toString(), ssl: local ? false : { rejectUnauthorized: false } };
}
async function sql(text, params = []) {
  const r = await db.query(text, params);
  return r.rowCount ?? 0;
}
var list2 = (v) => typeof v === "string" ? v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) : [];
function shareInfo(shareUrl) {
  const u = new URL(shareUrl);
  const token = u.pathname.split("/").filter(Boolean).pop() || "";
  return { origin: u.origin, token, shareUrl: `${u.origin}${u.pathname.replace(/\/$/, "")}`, auth: "Basic " + Buffer.from(`${token}:`).toString("base64") };
}
async function listDir(share, dir = "") {
  const res = await fetch(`${share.origin}/public.php/webdav/${dir}`, { method: "PROPFIND", headers: { Authorization: share.auth, Depth: "1" } });
  if (!res.ok) throw new Error(`N\xE3o foi poss\xEDvel listar o compartilhamento (${res.status}). Confira o link ou use --dir com os arquivos baixados.`);
  const xml = await res.text();
  return [...xml.matchAll(/<d:href>([^<]+)<\/d:href>/gi)].map((m) => decodeURIComponent(m[1]).replace(/^.*\/public\.php\/webdav\/?/, "").replace(/\/$/, "")).filter((p) => p && p !== dir.replace(/\/$/, "")).map((p) => p.split("/").pop());
}
function latestMonth(names) {
  return names.filter((n) => /^\d{4}-\d{2}$/.test(n)).sort().pop() || null;
}
async function download(share, month, file, dest) {
  const urls = [
    [`${share.origin}/public.php/webdav/${month}/${encodeURIComponent(file)}`, { Authorization: share.auth }],
    [`${share.shareUrl}/download?path=${encodeURIComponent("/" + month)}&files=${encodeURIComponent(file)}`, {}]
  ];
  let last = "";
  for (const [url, headers] of urls) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        await (0, import_promises.pipeline)(import_node_stream.Readable.fromWeb(res.body), import_node_fs.default.createWriteStream(dest));
        return;
      } catch (e) {
        last = e?.message || String(e);
        await new Promise((r) => setTimeout(r, attempt * 3e3));
      }
    }
  }
  throw new Error(`Falha ao baixar ${file}: ${last}`);
}
async function zipLines(file) {
  const fd = await import_node_fs.default.promises.open(file, "r");
  const head = Buffer.alloc(30);
  await fd.read(head, 0, 30, 0);
  await fd.close();
  if (head.readUInt32LE(0) !== 67324752) throw new Error(`${import_node_path.default.basename(file)} n\xE3o \xE9 um zip v\xE1lido.`);
  const method = head.readUInt16LE(8);
  const start = 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
  const raw = import_node_fs.default.createReadStream(file, { start });
  let stream = raw;
  if (method === 8) {
    const inflate = import_node_zlib.default.createInflateRaw();
    raw.pipe(inflate);
    inflate.on("end", () => raw.destroy());
    stream = inflate;
  } else if (method !== 0) throw new Error(`Compress\xE3o ${method} n\xE3o suportada em ${import_node_path.default.basename(file)}.`);
  stream.setEncoding("latin1");
  return import_node_readline.default.createInterface({ input: stream, crlfDelay: Infinity });
}
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('"')) s = s.slice(1);
  if (s.endsWith('"')) s = s.slice(0, -1);
  return s.split('";"').map((v) => v.trim());
}
function fixOldMobile(national) {
  return national.length === 10 && "6789".includes(national[2]) ? `${national.slice(0, 2)}9${national.slice(2)}` : national;
}
function phoneOf(ddd, num) {
  const d = digits(ddd);
  const n = digits(num);
  return d && n ? normalizePhone(fixOldMobile(d + n)) : null;
}
var isMeiNature = (code) => digits(code) === "2135";
function establishmentRecord(f, o) {
  if (f.length < 28 || f[5] !== "02") return null;
  const uf = f[19];
  if (o.ufs.length && !o.ufs.includes(uf)) return null;
  const cnae = digits(f[11]).padStart(7, "0");
  const secondary = f[12] ? f[12].split(",").map((c) => digits(c)).filter(Boolean) : [];
  if (o.cnaes.length && !o.cnaes.some((p) => cnae.startsWith(p) || secondary.some((s) => s.startsWith(p)))) return null;
  const phone = phoneOf(f[21], f[22]);
  const phone2 = phoneOf(f[23], f[24]);
  const email = normalizeEmail(f[27]);
  if (o.requireContact && !phone && !phone2 && !email) return null;
  const city = o.cities.get(f[20]) || null;
  return {
    cnpj: `${f[0]}${f[1]}${f[2]}`,
    basico: f[0],
    tradeName: f[4] || null,
    cnae,
    cnaeSecondary: secondary.length ? secondary.join(",") : null,
    uf,
    cityCode: f[20],
    city,
    cityNorm: city ? searchText(city) : null,
    district: f[17] || null,
    zip: f[18] || null,
    address: [[f[13], f[14]].filter(Boolean).join(" "), f[15], f[16]].filter(Boolean).join(", ") || null,
    phone: phone || phone2,
    phone2: phone && phone2 && phone2 !== phone ? phone2 : null,
    email,
    openedAt: f[10] || null,
    refMonth: o.month
  };
}
var COLS = ["cnpj", "basico", "tradeName", "cnae", "cnaeSecondary", "uf", "cityCode", "city", "cityNorm", "district", "zip", "address", "phone", "phone2", "email", "openedAt", "refMonth"];
async function upsertBatch(batch) {
  const rows = [...new Map(batch.map((r) => [r.cnpj, r])).values()];
  if (!rows.length) return;
  const params = [];
  const values = rows.map((r) => {
    const ph = COLS.map((c) => {
      params.push(r[c]);
      return `$${params.length}`;
    });
    return `(${ph.join(",")},NOW())`;
  });
  const cols = COLS.map((c) => `"${c}"`).join(",");
  const updates = COLS.filter((c) => c !== "cnpj").map((c) => `"${c}"=EXCLUDED."${c}"`).join(",");
  await sql(`INSERT INTO "CompanyRecord" (${cols},"updatedAt") VALUES ${values.join(",")} ON CONFLICT ("cnpj") DO UPDATE SET ${updates},"updatedAt"=NOW()`, params);
}
async function updateLegalNames(rows) {
  if (!rows.length) return;
  const params = [];
  const values = rows.map(([b, l, s, m]) => {
    params.push(b, l, s, m);
    return `($${params.length - 3},$${params.length - 2},$${params.length - 1},$${params.length}::boolean)`;
  });
  await sql(`UPDATE "CompanyRecord" c SET "legalName"=v.l,"size"=v.s,"isMei"=v.m FROM (VALUES ${values.join(",")}) AS v(b,l,s,m) WHERE c."basico"=v.b`, params);
}
function cacheDir(month) {
  const base = process.env.LOCALAPPDATA ? import_node_path.default.join(process.env.LOCALAPPDATA, "RevahReceita") : import_node_path.default.join(import_node_os.default.homedir(), ".cache", "revah-receita");
  import_node_fs.default.mkdirSync(import_node_path.default.join(base, month), { recursive: true });
  for (const d of import_node_fs.default.readdirSync(base)) if (d !== month && /^\d{4}-\d{2}$/.test(d)) import_node_fs.default.rmSync(import_node_path.default.join(base, d), { recursive: true, force: true });
  return import_node_path.default.join(base, month);
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ufs = list2(args.ufs);
  const cnaes = list2(args.cnaes).map((c) => digits(c));
  if (!ufs.length && !cnaes.length && !args.all) {
    console.error("Informe filtros (--ufs=PR,SP e/ou --cnaes=8630) ou --all para o Brasil inteiro (base muito grande).");
    process.exit(1);
  }
  const dryRun = Boolean(args["dry-run"]);
  const requireContact = !args["keep-without-contact"];
  const share = shareInfo(String(args.url || config.leads.cnpjDataUrl));
  const localDir = typeof args.dir === "string" ? args.dir : null;
  let month = typeof args.month === "string" ? args.month : null;
  if (!month && !localDir) month = latestMonth(await listDir(share));
  if (!month) month = (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
  console.log(`Base de ${month} \u2014 filtros: UF=${ufs.join(",") || "todas"} CNAE=${cnaes.join(",") || "todos"}${dryRun ? " (simula\xE7\xE3o)" : ""}`);
  const keepCache = !args["sem-cache"];
  const work = localDir || (keepCache ? cacheDir(month) : import_node_fs.default.mkdtempSync(import_node_path.default.join(import_node_os.default.tmpdir(), "revah-cnpj-")));
  const remote = localDir ? [] : await listDir(share, month).catch(() => []);
  const fileFor = async (name) => {
    const local = import_node_path.default.join(work, name);
    if (import_node_fs.default.existsSync(local)) return local;
    if (localDir) throw new Error(`Arquivo ${name} n\xE3o encontrado em ${localDir}.`);
    if (remote.length && !remote.includes(name)) throw new Error(`Arquivo ${name} n\xE3o existe em ${month}.`);
    console.log(`Baixando ${name}...`);
    await download(share, month, name, `${local}.part`);
    await import_node_fs.default.promises.rename(`${local}.part`, local);
    return local;
  };
  const done = async (file) => {
    if (!localDir && !keepCache) await import_node_fs.default.promises.rm(file, { force: true });
  };
  if (!process.env.DATABASE_URL && !dryRun) throw new Error("Defina DATABASE_URL com o endere\xE7o do banco do REVAH.");
  db = new import_pg.Client(pgConfig(process.env.DATABASE_URL || "postgresql://localhost/revah"));
  if (!dryRun) await db.connect();
  const jobId = dryRun ? null : "imp_" + import_node_crypto.default.randomBytes(10).toString("hex");
  if (jobId) await sql(`INSERT INTO "CompanyImport" ("id","refMonth","filters","status","rows","startedAt") VALUES ($1,$2,$3,'RUNNING',0,NOW())`, [jobId, month, JSON.stringify({ ufs, cnaes, requireContact })]);
  try {
    const cities = /* @__PURE__ */ new Map();
    const muni = await fileFor("Municipios.zip");
    for await (const line of await zipLines(muni)) {
      const f = splitRow(line);
      if (f[0]) cities.set(f[0], f[1]);
    }
    await done(muni);
    const cnaeFile = await fileFor("Cnaes.zip");
    const cnaeRows = [];
    for await (const line of await zipLines(cnaeFile)) {
      const f = splitRow(line);
      if (f[0]) cnaeRows.push({ code: digits(f[0]).padStart(7, "0"), description: f[1], searchNorm: searchText(f[1]) });
    }
    await done(cnaeFile);
    if (!dryRun) {
      for (let i = 0; i < cnaeRows.length; i += 500) {
        const chunk = cnaeRows.slice(i, i + 500);
        const params = chunk.flatMap((c) => [c.code, c.description, c.searchNorm]);
        const values = chunk.map((_, j) => `($${j * 3 + 1},$${j * 3 + 2},$${j * 3 + 3})`).join(",");
        await sql(`INSERT INTO "CnaeCode" ("code","description","searchNorm") VALUES ${values} ON CONFLICT ("code") DO UPDATE SET "description"=EXCLUDED."description","searchNorm"=EXCLUDED."searchNorm"`, params);
      }
    }
    console.log(`${cities.size} munic\xEDpios, ${cnaeRows.length} CNAEs.`);
    const indexes = typeof args.files === "string" ? args.files.split(",").map(Number) : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const basicos = /* @__PURE__ */ new Set();
    let kept = 0;
    for (const i of indexes) {
      const file = await fileFor(`Estabelecimentos${i}.zip`);
      let batch = [];
      let read = 0;
      for await (const line of await zipLines(file)) {
        read++;
        const rec = establishmentRecord(splitRow(line), { ufs, cnaes, requireContact, cities, month });
        if (!rec) continue;
        kept++;
        basicos.add(rec.basico);
        if (dryRun) continue;
        batch.push(rec);
        if (batch.length >= 500) {
          await upsertBatch(batch);
          batch = [];
        }
      }
      if (!dryRun) await upsertBatch(batch);
      await done(file);
      console.log(`Estabelecimentos${i}: ${read.toLocaleString("pt-BR")} lidos, ${kept.toLocaleString("pt-BR")} empresas na base at\xE9 agora.`);
    }
    if (!dryRun && basicos.size) {
      for (let i = 0; i <= 9; i++) {
        const file = await fileFor(`Empresas${i}.zip`);
        let batch = [];
        for await (const line of await zipLines(file)) {
          const f = splitRow(line);
          if (!basicos.has(f[0])) continue;
          batch.push([f[0], f[1], f[5] || null, isMeiNature(f[2])]);
          if (batch.length >= 1e3) {
            await updateLegalNames(batch);
            batch = [];
          }
        }
        await updateLegalNames(batch);
        await done(file);
        console.log(`Empresas${i}: raz\xE3o social atualizada.`);
      }
    }
    if (!dryRun && indexes.length === 10) {
      const where = [`"refMonth" <> $1`];
      const params = [month];
      if (ufs.length) {
        params.push(ufs);
        where.push(`"uf" = ANY($${params.length})`);
      }
      if (!cnaes.length) {
        const removed = await sql(`DELETE FROM "CompanyRecord" WHERE ${where.join(" AND ")}`, params);
        console.log(`${removed} empresas inativas removidas.`);
      }
    }
    if (jobId) await sql(`UPDATE "CompanyImport" SET "status"='DONE',"rows"=$2,"finishedAt"=NOW() WHERE "id"=$1`, [jobId, kept]);
    console.log(`Conclu\xEDdo: ${kept.toLocaleString("pt-BR")} empresas ativas ${dryRun ? "encontradas" : "na base"}.`);
  } catch (e) {
    if (jobId) await sql(`UPDATE "CompanyImport" SET "status"='FAILED',"error"=$2,"finishedAt"=NOW() WHERE "id"=$1`, [jobId, String(e?.message || e).slice(0, 1e3)]).catch(() => 0);
    throw e;
  } finally {
    if (!localDir && !keepCache) await import_node_fs.default.promises.rm(work, { recursive: true, force: true });
    if (!dryRun) await db.end().catch(() => void 0);
  }
}
if (require.main === module) {
  main().catch((e) => {
    const cause = e?.cause ? ` \u2014 causa: ${e.cause.code || ""} ${e.cause.message || e.cause}`.trimEnd() : "";
    console.error(`${e?.message || e}${cause}`);
    process.exit(1);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cacheDir,
  establishmentRecord,
  fixOldMobile,
  isMeiNature,
  latestMonth,
  pgConfig,
  shareInfo,
  splitRow,
  zipLines
});
