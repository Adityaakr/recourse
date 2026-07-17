import type { Hex } from "@recourse/sdk";

export function hexToBytes32(hex: Hex): Uint8Array {
  return Uint8Array.from((hex.replace(/^0x/, "").match(/../g) ?? []).map((b) => parseInt(b, 16)));
}
