/**
 * Hand-written SCALE codec for the Recourse sails-rs 2.0.0 program (ethexe).
 *
 * Why this exists: sails-js@1.0.0's `Sails` class cannot parse the v2 IDL, and
 * cargo-sails 2.0.0's generated JS client imports packages that are not on npm.
 * This module reproduces, byte-for-byte, the payload the generated Rust client
 * (`program/client/src/recourse_client.rs`) emits.
 *
 * ── Wire format (verified against sails-rs 2.0.0 source) ─────────────────────
 *
 * A message payload is:  SailsMessageHeader (16 bytes)  ++  SCALE(params tuple)
 *
 * SailsMessageHeader::to_bytes()  (sails-idl-meta-2.0.0/src/header.rs:86-102):
 *   offset 0..2   magic        = [0x47, 0x4D]  ("GM")           header.rs:11
 *   offset 2      version      = 0x01          (v1)            header.rs:47,272
 *   offset 3      hlen         = 0x10 (16)      MINIMAL_HLEN    header.rs:14
 *   offset 4..12  interface_id = 8 bytes, big-endian of the service hash
 *                                              header.rs:95 / interface_id.rs:44
 *   offset 12..14 entry_id     = u16 little-endian (method index)   header.rs:96
 *   offset 14     route_id     = u8            (service route index)header.rs:97
 *   offset 15     reserved     = 0x00                              header.rs:99
 *
 * Derivation of each field (all from program/client/src/recourse_client.rs):
 *   - interface_id: the 8-byte big-endian form of the `@0x…` in the IDL.
 *       Market      @0x826b9458701ee226  → 82 6b 94 58 70 1e e2 26   (rc.rs:209)
 *       Settlement  @0xc0fc606f9a1d8fff  → c0 fc 60 6f 9a 1d 8f ff   (rc.rs:410)
 *       Constructor → InterfaceId::zero() = 00 00 00 00 00 00 00 00  (rc.rs:61, client/mod.rs:699)
 *   - route_id: assigned 1,2,… per exposed service in IDL order (routing.rs:37-43).
 *       Market = 1, Settlement = 2 (rc.rs:7-8). Constructor uses RouteIdx(0)
 *       (client/mod.rs:122).
 *   - entry_id: the method's index within its service, 0-based, in the order the
 *       generated client lists them (the 2nd arg of each io_struct_impl!, rc.rs:278-286,
 *       456-462). Constructor Create = 0 (rc.rs:61).
 *
 * The encode path is io_struct_impl!'s `encode_call` (client/mod.rs:626-637 / 667-678):
 *   `header.to_bytes()` then `Encode::encode_to(params_tuple)`. A tuple SCALE-encodes
 *   as the concatenation of its fields (no length prefix).
 *
 * ── Reply envelope (client/mod.rs:414-437) ──────────────────────────────────
 *   - If the reply type is unit `()` the payload is EMPTY (no header).
 *   - Otherwise: SailsMessageHeader (same interface/route/entry, validated) ++
 *     SCALE(reply value). On a userspace panic the `throws` value (e.g. String)
 *     rides the same header-prefixed shape.
 */

export type Hex = `0x${string}`;

// ─── low-level byte helpers ──────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const s = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (s.length % 2 !== 0) throw new Error(`odd-length hex: ${hex}`);
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(s.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`invalid hex: ${hex}`);
    out[i] = byte;
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): Hex {
  let s = '0x';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s as Hex;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// ─── SCALE primitive encoders ────────────────────────────────────────────────

/** Fixed-width little-endian unsigned integer (u8/u16/u32/u64/u128). */
function encodeUint(value: bigint | number, byteLen: number): Uint8Array {
  let v = BigInt(value);
  if (v < 0n) throw new Error(`unsigned expected, got ${value}`);
  const out = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error(`value ${value} does not fit in ${byteLen} bytes`);
  return out;
}

/** SCALE compact-encoded u32 (used for length prefixes of String / Vec). */
function encodeCompact(value: number | bigint): Uint8Array {
  const v = BigInt(value);
  if (v < 0n) throw new Error('compact must be non-negative');
  if (v < 1n << 6n) return new Uint8Array([Number(v) << 2]);
  if (v < 1n << 14n) {
    const x = (Number(v) << 2) | 0b01;
    return new Uint8Array([x & 0xff, (x >> 8) & 0xff]);
  }
  if (v < 1n << 30n) {
    const x = (Number(v) << 2) | 0b10;
    return new Uint8Array([x & 0xff, (x >> 8) & 0xff, (x >> 16) & 0xff, (x >> 24) & 0xff]);
  }
  // big-integer mode
  let tmp = v;
  const bytes: number[] = [];
  while (tmp > 0n) {
    bytes.push(Number(tmp & 0xffn));
    tmp >>= 8n;
  }
  const prefix = ((bytes.length - 4) << 2) | 0b11;
  return new Uint8Array([prefix, ...bytes]);
}

/** SCALE String: compact length prefix + UTF-8 bytes. */
function encodeString(value: string): Uint8Array {
  const utf8 = new TextEncoder().encode(value);
  return concat([encodeCompact(utf8.length), utf8]);
}

/** Fixed 32-byte array (ActorId / H256 / [u8; 32]) — no length prefix. */
function encodeBytes32(value: Hex | Uint8Array): Uint8Array {
  const bytes = typeof value === 'string' ? hexToBytes(value) : value;
  if (bytes.length !== 32) throw new Error(`expected 32 bytes, got ${bytes.length}`);
  return bytes;
}

/** Status enum (Market): SCALE enum discriminant is a single byte index. */
const STATUS_VARIANTS = [
  'Open', 'Awarded', 'Running', 'Delivered', 'Verified', 'Paid', 'Refunded', 'Expired',
] as const;
function statusIndex(v: number | string): number {
  if (typeof v === 'number') return v;
  const i = STATUS_VARIANTS.indexOf(v as (typeof STATUS_VARIANTS)[number]);
  if (i < 0) throw new Error(`unknown Status variant: ${v}`);
  return i;
}

// ─── param type tokens ───────────────────────────────────────────────────────
// One token per method parameter, in declaration order.

type Token = 'u32' | 'u64' | 'u128' | 'bool' | 'String' | 'bytes32' | 'Option<Status>';

function encodeParam(token: Token, arg: unknown): Uint8Array {
  switch (token) {
    case 'u32':
      return encodeUint(arg as number | bigint, 4);
    case 'u64':
      return encodeUint(arg as number | bigint, 8);
    case 'u128':
      return encodeUint(arg as number | bigint, 16);
    case 'bool':
      return new Uint8Array([arg ? 1 : 0]);
    case 'String':
      return encodeString(arg as string);
    case 'bytes32':
      return encodeBytes32(arg as Hex | Uint8Array);
    case 'Option<Status>':
      // SCALE Option: 0x00 = None; 0x01 ++ inner = Some.
      if (arg === null || arg === undefined) return new Uint8Array([0]);
      return concat([new Uint8Array([1]), new Uint8Array([statusIndex(arg as number | string)])]);
  }
}

function encodeTuple(tokens: readonly Token[], args: unknown[]): Uint8Array {
  if (tokens.length !== args.length) {
    throw new Error(`expected ${tokens.length} args, got ${args.length}`);
  }
  return concat(tokens.map((t, i) => encodeParam(t, args[i])));
}

// ─── method registry (from recourse_client.rs / recourse.idl) ────────────────

const INTERFACE_ID = {
  Market: '12c239d44571850c', // recourse.idl:4 (changed when deposit/withdraw/balance_of were added)
  Settlement: 'c0fc606f9a1d8fff', // recourse.idl:154
} as const;

const ROUTE_ID = {
  Market: 1, // recourse_client.rs:7
  Settlement: 2, // recourse_client.rs:8
} as const;

export type ServiceName = keyof typeof INTERFACE_ID;

interface MethodDef {
  entryId: number;
  params: readonly Token[];
}

const METHODS: Record<ServiceName, Record<string, MethodDef>> = {
  Market: {
    // entry_id is the method's 0-based position in alphabetical/IDL order
    // (recourse.idl:4-84). Adding BalanceOf/Deposit/Withdraw reshuffled these.
    AwardJob: { entryId: 0, params: ['u64'] },
    BalanceOf: { entryId: 1, params: ['bytes32'] }, // (who: ActorId) -> u128
    CreateJob: { entryId: 2, params: ['u128', 'u128', 'u32', 'String', 'bytes32', 'String', 'u32'] }, // escrow_wei first
    Deposit: { entryId: 3, params: [] }, // payable -> u128
    GetJob: { entryId: 4, params: ['u64'] },
    ListJobs: { entryId: 5, params: ['Option<Status>', 'u64', 'u32'] },
    RegisterProvider: { entryId: 6, params: [] },
    StartJob: { entryId: 7, params: ['u64'] },
    SubmitQuote: { entryId: 8, params: ['u64', 'u128', 'u32'] },
    TopUpBond: { entryId: 9, params: [] },
    Withdraw: { entryId: 10, params: ['u128'] }, // (amount) -> u128
    WithdrawBond: { entryId: 11, params: [] },
  },
  Settlement: {
    ExpireJob: { entryId: 0, params: ['u64'] },
    GetConfig: { entryId: 1, params: [] },
    GetProvider: { entryId: 2, params: ['bytes32'] }, // ActorId
    GetRetainedWei: { entryId: 3, params: [] },
    ListProviders: { entryId: 4, params: [] },
    SubmitReceipt: { entryId: 5, params: ['u64', 'bytes32', 'String'] }, // H256
    SubmitVerdict: { entryId: 6, params: ['u64', 'bool', 'bytes32'] }, // H256
  },
};

// ─── header construction ─────────────────────────────────────────────────────

const MAGIC = [0x47, 0x4d]; // header.rs:11
const VERSION = 0x01; // header.rs:47
const MINIMAL_HLEN = 0x10; // header.rs:14 (16)

/**
 * Build the 16-byte SailsMessageHeader.
 * @param interfaceIdHex 16 hex chars (8 bytes) big-endian, or '' for the zero id.
 */
function buildHeader(interfaceIdHex: string, entryId: number, routeId: number): Uint8Array {
  const iid = interfaceIdHex === '' ? new Uint8Array(8) : hexToBytes(interfaceIdHex);
  if (iid.length !== 8) throw new Error(`interface id must be 8 bytes, got ${iid.length}`);
  const header = new Uint8Array(16);
  header[0] = MAGIC[0]!;
  header[1] = MAGIC[1]!;
  header[2] = VERSION;
  header[3] = MINIMAL_HLEN;
  header.set(iid, 4);
  header[12] = entryId & 0xff; // entry_id u16 LE
  header[13] = (entryId >> 8) & 0xff;
  header[14] = routeId; // route_id u8
  header[15] = 0x00; // reserved
  return header;
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Encode the `Create` constructor payload.
 * IDL: Create(verifier: ActorId, bond_wei: u128, slash_wei: u128, slash_to_requester_bps: u32)
 * Constructor uses interface_id = zero, route_id = 0, entry_id = 0
 * (recourse_client.rs:61, client/mod.rs:122,699).
 */
export function encodeCtorPayload(
  verifier: Hex,
  bondWei: bigint,
  slashWei: bigint,
  slashToRequesterBps: number,
): Hex {
  const header = buildHeader('', 0, 0);
  const params = encodeTuple(
    ['bytes32', 'u128', 'u128', 'u32'],
    [verifier, bondWei, slashWei, slashToRequesterBps],
  );
  return bytesToHex(concat([header, params]));
}

/**
 * Encode a service handle/query message: header ++ SCALE(args).
 * Works for any method in the Market or Settlement service.
 */
export function encodeCall(service: ServiceName, method: string, args: unknown[]): Hex {
  const def = METHODS[service]?.[method];
  if (!def) throw new Error(`unknown method ${service}.${method}`);
  const header = buildHeader(INTERFACE_ID[service], def.entryId, ROUTE_ID[service]);
  const params = encodeTuple(def.params, args);
  return bytesToHex(concat([header, params]));
}

/**
 * Map a 20-byte Ethereum address to its 32-byte gear ActorId: the address
 * occupies the LAST 20 bytes, the first 12 are zero. This is exactly how the
 * runtime derives an Ethereum sender's ActorId
 * (gprimitives 1.10.0 `From<H160> for ActorId`: `actor_id.0[12..].copy_from_slice(h160)`),
 * so an ActorId built this way compares equal to `Syscall::message_source()`
 * for that sender. Use it whenever an Ethereum address must be passed as an
 * `ActorId` argument (e.g. the configured verifier).
 */
export function ethAddressToActorId(addr: Hex): Hex {
  const hex = addr.toLowerCase().replace(/^0x/, '');
  if (hex.length !== 40) throw new Error(`expected a 20-byte address, got ${addr}`);
  return `0x${'00'.repeat(12)}${hex}`;
}

// ─── reply decoding ──────────────────────────────────────────────────────────

export interface DecodedHeader {
  version: number;
  hlen: number;
  interfaceId: Hex;
  entryId: number;
  routeId: number;
}

export interface DecodedReply {
  /** null when the reply is an empty unit `()` reply (no header on the wire). */
  header: DecodedHeader | null;
  /** The inner SCALE-encoded reply value (everything after the 16-byte header). */
  payload: Hex;
}

/**
 * Strip and validate the SailsMessageHeader from a reply payload and return the
 * inner SCALE bytes for the caller to decode into the concrete reply type.
 *
 * Per client/mod.rs:414-437, a unit `()` reply carries no header (empty payload);
 * every other reply (and any `throws` value) is prefixed with the 16-byte header
 * whose interface/route/entry echo the call. This function returns the raw inner
 * SCALE bytes because typed decoding of each reply struct (Job, Provider, …) is
 * left to the caller.
 */
export function decodeReply(reply: Hex | Uint8Array): DecodedReply {
  const bytes = typeof reply === 'string' ? hexToBytes(reply) : reply;
  if (bytes.length === 0) {
    return { header: null, payload: '0x' };
  }
  if (bytes.length < 16) {
    throw new Error(`reply too short for header: ${bytes.length} bytes`);
  }
  if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1]) {
    throw new Error('invalid Sails magic bytes in reply');
  }
  const header: DecodedHeader = {
    version: bytes[2]!,
    hlen: bytes[3]!,
    interfaceId: bytesToHex(bytes.slice(4, 12)),
    entryId: bytes[12]! | (bytes[13]! << 8),
    routeId: bytes[14]!,
  };
  return { header, payload: bytesToHex(bytes.slice(16)) };
}
