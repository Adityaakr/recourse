// Typed access to the service keys and deployment record. Keys live only in
// .env (git-ignored, never committed); nothing secret is ever logged, put on
// chain, or shipped to the frontend.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/** Repo root, resolved from this file (packages/sdk/src/env.ts). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

loadDotenv({ path: join(REPO_ROOT, ".env") });

/** Every service role that owns a key in .env. */
export type Role =
  | "deployer"
  | "requester"
  | "bot-steady"
  | "bot-cheapskate"
  | "bot-premium"
  | "verifier"
  | "keeper";

const ENV_KEY: Record<Role, string> = {
  deployer: "RECOURSE_DEPLOYER_PK",
  requester: "RECOURSE_REQUESTER_PK",
  "bot-steady": "RECOURSE_BOT_STEADY_PK",
  "bot-cheapskate": "RECOURSE_BOT_CHEAPSKATE_PK",
  "bot-premium": "RECOURSE_BOT_PREMIUM_PK",
  verifier: "RECOURSE_VERIFIER_PK",
  keeper: "RECOURSE_KEEPER_PK",
};

function normalizePk(raw: string): Hex {
  const pk = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) {
    throw new Error("private key must be 32 bytes hex");
  }
  return pk as Hex;
}

/** Read a role's private key. Throws with a clear message if unset. */
export function privateKey(role: Role): Hex {
  const raw = process.env[ENV_KEY[role]];
  if (!raw) {
    throw new Error(`missing ${ENV_KEY[role]} in .env (role ${role})`);
  }
  return normalizePk(raw);
}

/** The viem account for a role. */
export function account(role: Role) {
  return privateKeyToAccount(privateKey(role));
}

/** 0x address for a role, without exposing the key. */
export function address(role: Role): Hex {
  return account(role).address;
}

export const DEPLOYMENTS_PATH = join(REPO_ROOT, "deployments", "hoodi.json");

export interface Deployment {
  programId: Hex;
  codeId: Hex;
  router: Hex;
  wvara: Hex;
  verifier: Hex;
  bondWei: string;
  slashWei: string;
  slashToRequesterBps: number;
  deployedAt: string;
  deployTx: Hex;
}

export function readDeployment(): Deployment {
  if (!existsSync(DEPLOYMENTS_PATH)) {
    throw new Error(`no deployment at ${DEPLOYMENTS_PATH} — run scripts/deploy.ts first`);
  }
  return JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8")) as Deployment;
}
