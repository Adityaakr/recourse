// Minimal SCALE decoder — just the shapes recourse reads back from the
// program (fixed-width ints, compact length, Option, enum tag, Vec, String,
// fixed bytes). Encoding is handled by codec.ts; this is the read side.
//
// SCALE reference: fixed ints are little-endian; compact ints use the 2-bit
// mode prefix; Option is a 1-byte tag (0=None,1=Some); enums are a 1-byte
// discriminant; Vec/String carry a compact length prefix.

import type { Hex } from "./codec.js";

export class ScaleReader {
  private bytes: Uint8Array;
  private pos = 0;

  constructor(input: Hex | Uint8Array) {
    if (typeof input === "string") {
      const h = input.replace(/^0x/, "");
      this.bytes = Uint8Array.from(h.match(/../g)?.map((b) => parseInt(b, 16)) ?? []);
    } else {
      this.bytes = input;
    }
  }

  get remaining(): number {
    return this.bytes.length - this.pos;
  }

  u8(): number {
    return this.bytes[this.pos++]!;
  }

  private uint(size: number): bigint {
    let v = 0n;
    for (let i = 0; i < size; i++) v |= BigInt(this.bytes[this.pos + i]!) << (8n * BigInt(i));
    this.pos += size;
    return v;
  }

  u16(): number { return Number(this.uint(2)); }
  u32(): number { return Number(this.uint(4)); }
  u64(): bigint { return this.uint(8); }
  u128(): bigint { return this.uint(16); }

  /** SCALE compact-encoded unsigned integer. */
  compact(): number {
    const b0 = this.bytes[this.pos]!;
    const mode = b0 & 0b11;
    if (mode === 0b00) {
      this.pos += 1;
      return b0 >> 2;
    }
    if (mode === 0b01) {
      const v = Number(this.uint(2));
      return v >> 2;
    }
    if (mode === 0b10) {
      const v = Number(this.uint(4));
      return v >> 2;
    }
    // big-integer mode: length byte then N+4 bytes; recourse never hits this.
    const len = (b0 >> 2) + 4;
    this.pos += 1;
    let v = 0n;
    for (let i = 0; i < len; i++) v |= BigInt(this.bytes[this.pos + i]!) << (8n * BigInt(i));
    this.pos += len;
    return Number(v);
  }

  bytes32(): Hex {
    const slice = this.bytes.slice(this.pos, this.pos + 32);
    this.pos += 32;
    let hex = "";
    for (const b of slice) hex += b.toString(16).padStart(2, "0");
    return `0x${hex}`;
  }

  bool(): boolean {
    return this.u8() === 1;
  }

  string(): string {
    const len = this.compact();
    const slice = this.bytes.slice(this.pos, this.pos + len);
    this.pos += len;
    return new TextDecoder().decode(slice);
  }

  /** Option<T>: returns null for None, else the decoded inner value. */
  option<T>(inner: (r: ScaleReader) => T): T | null {
    return this.u8() === 1 ? inner(this) : null;
  }

  /** Vec<T>: compact length prefix then N elements. */
  vec<T>(inner: (r: ScaleReader) => T): T[] {
    const n = this.compact();
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(inner(this));
    return out;
  }
}
