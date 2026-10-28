// Angular's message id: a 64-bit fingerprint of the message and its meaning, as @angular/localize computes it (MIT).

function mix(a: number, b: number, c: number): [number, number, number] {
  a = (a - b - c) | 0
  a ^= c >>> 13
  b = (b - c - a) | 0
  b ^= a << 8
  c = (c - a - b) | 0
  c ^= b >>> 13
  a = (a - b - c) | 0
  a ^= c >>> 12
  b = (b - c - a) | 0
  b ^= a << 16
  c = (c - a - b) | 0
  c ^= b >>> 5
  a = (a - b - c) | 0
  a ^= c >>> 3
  b = (b - c - a) | 0
  b ^= a << 10
  c = (c - a - b) | 0
  c ^= b >>> 15
  return [a, b, c]
}

function hash32(bytes: Uint8Array, seed: number): number {
  let a = 0x9E3779B9 | 0
  let b = 0x9E3779B9 | 0
  let c = seed | 0
  const word = (at: number): number => bytes[at]! | bytes[at + 1]! << 8 | bytes[at + 2]! << 16 | bytes[at + 3]! << 24
  const byte = (at: number): number => bytes[at] ?? 0
  let i = 0
  for (; i + 12 <= bytes.length; i += 12)
    [a, b, c] = mix((a + word(i)) | 0, (b + word(i + 4)) | 0, (c + word(i + 8)) | 0)
  c = (c + bytes.length) | 0
  const rest = bytes.length - i
  if (rest >= 4) {
    a = (a + word(i)) | 0
    if (rest >= 8) {
      b = (b + word(i + 4)) | 0
      // The low byte of `c` holds the length, so the tail fills `c` from bit 8.
      for (let k = 8; k < rest; k++)
        c = (c + (byte(i + k) << ((k - 7) * 8))) | 0
    }
    else {
      for (let k = 4; k < rest; k++)
        b = (b + (byte(i + k) << ((k - 4) * 8))) | 0
    }
  }
  else {
    for (let k = 0; k < rest; k++)
      a = (a + (byte(i + k) << (k * 8))) | 0
  }
  return mix(a, b, c)[2]
}

function fingerprint(text: string): bigint {
  const bytes = new TextEncoder().encode(text)
  let hi = hash32(bytes, 0)
  let lo = hash32(bytes, 102072)
  if (hi === 0 && (lo === 0 || lo === 1)) {
    hi ^= 0x130F9BEF
    lo ^= -1801410264
  }
  return BigInt.asUintN(32, BigInt(hi)) << 32n | BigInt.asUintN(32, BigInt(lo))
}

/** The id Angular gives a message without a custom id: `message` is the `$localize` form, placeholders as `{$NAME}`. */
export function messageId(message: string, meaning = ''): string {
  let print = fingerprint(message)
  if (meaning) {
    print = BigInt.asUintN(64, print << 1n) | (print >> 63n & 1n)
    print += fingerprint(meaning)
  }
  return BigInt.asUintN(63, print).toString()
}
