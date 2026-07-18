// Programmer-mode BigInt evaluator (P1). Separate from the mathjs path so QWORD
// (64-bit) arithmetic is exact - mathjs uses doubles, which lose precision past
// 2^53. Leader put this in the hard 15% for that reason.
//
// Contract surface (types + Engine methods) lives in index.ts; this is the impl.
//
// Semantics match Windows Calculator programmer mode:
//   - Values are wordSize-bit patterns; + - * & | ^ ~ << wrap (two's complement).
//   - / % and arithmetic >> use SIGNED interpretation (MSB = sign).
//   - >>> is logical (zero-fill).
//   - DEC display is signed; HEX/OCT/BIN display the raw bits (unsigned).
//
// Grammar (C-like precedence, lowest -> highest):
//   expr    := bor
//   bor     := bxor ('|' bxor)*
//   bxor    := band ('^' band)*
//   band    := shift ('&' shift)*
//   shift   := addSub (('<<'|'>>'|'>>>') addSub)*
//   addSub  := mulDiv (('+'|'-') mulDiv)*
//   mulDiv  := unary (('*'|'/'|'%') unary)*
//   unary   := ('~'|'-'|'+') unary | primary
//   primary := number | '(' expr ')'

import type { Radix, WordSize, RadixRepr } from './index';

export class ProgrammerError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ProgrammerError';
    this.code = code;
  }
}

const DIGIT_RE: Record<Radix, RegExp> = {
  2: /^[01]+/,
  8: /^[0-7]+/,
  10: /^[0-9]+/,
  16: /^[0-9a-fA-F]+/
};

// BigInt(string) accepts 0x/0b/0o prefixes but no radix arg, so prefix bare digits.
const PREFIX: Record<Radix, string> = { 2: '0b', 8: '0o', 10: '', 16: '0x' };

type TokType = 'num' | 'op' | 'lparen' | 'rparen';
interface Tok { type: TokType; value: string; }

function tokenize(src: string, radix: Radix): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '(') { toks.push({ type: 'lparen', value: ch }); i++; continue; }
    if (ch === ')') { toks.push({ type: 'rparen', value: ch }); i++; continue; }
    const three = src.slice(i, i + 3);
    if (three === '>>>') { toks.push({ type: 'op', value: '>>>' }); i += 3; continue; }
    const two = src.slice(i, i + 2);
    if (two === '<<' || two === '>>') { toks.push({ type: 'op', value: two }); i += 2; continue; }
    if ('+-*/%&|^~'.includes(ch)) { toks.push({ type: 'op', value: ch }); i++; continue; }
    const m = src.slice(i).match(DIGIT_RE[radix]);
    if (m) {
      const digits = m[0];
      toks.push({ type: 'num', value: PREFIX[radix] + digits.toLowerCase() });
      i += digits.length;
      continue;
    }
    throw new ProgrammerError('INVALID_DIGIT', `非法字符 "${ch}"（当前进制 ${radix}）`);
  }
  return toks;
}

export function mask(value: bigint, ws: WordSize): bigint {
  const m = (1n << BigInt(ws)) - 1n;
  return value & m;
}

export function toSigned(u: bigint, ws: WordSize): bigint {
  const half = 1n << BigInt(ws - 1);
  const full = 1n << BigInt(ws);
  return u >= half ? u - full : u;
}

class Parser {
  private pos = 0;
  constructor(private toks: Tok[], private ws: WordSize) {}

  private peek(): Tok | undefined { return this.toks[this.pos]; }
  private next(): Tok | undefined { return this.toks[this.pos++]; }
  private m(x: bigint): bigint { return mask(x, this.ws); }

  parseExpr(): bigint { return this.parseBor(); }

  private parseBor(): bigint {
    let left = this.parseBxor();
    while (this.peek()?.type === 'op' && this.peek()?.value === '|') {
      this.next();
      left = this.m(left | this.parseBxor());
    }
    return left;
  }

  private parseBxor(): bigint {
    let left = this.parseBand();
    while (this.peek()?.type === 'op' && this.peek()?.value === '^') {
      this.next();
      left = this.m(left ^ this.parseBand());
    }
    return left;
  }

  private parseBand(): bigint {
    let left = this.parseShift();
    while (this.peek()?.type === 'op' && this.peek()?.value === '&') {
      this.next();
      left = this.m(left & this.parseShift());
    }
    return left;
  }

  private parseShift(): bigint {
    let left = this.parseAddSub();
    for (;;) {
      const t = this.peek();
      if (t?.type === 'op' && (t.value === '<<' || t.value === '>>' || t.value === '>>>')) {
        this.next();
        const right = this.parseAddSub();
        let sh = toSigned(right, this.ws);
        if (sh < 0n) throw new ProgrammerError('SYNTAX', '移位量不能为负');
        // ponytail: clamp shift at wordSize - beyond that << -> 0, >> saturates.
        const wsBig = BigInt(this.ws);
        if (sh > wsBig) sh = wsBig;
        if (t.value === '<<') left = this.m(left << sh);
        else if (t.value === '>>') left = this.m(toSigned(left, this.ws) >> sh); // arithmetic
        else left = this.m(left >> sh); // >>> logical (left is unsigned bit pattern)
      } else break;
    }
    return left;
  }

  private parseAddSub(): bigint {
    let left = this.parseMulDiv();
    for (;;) {
      const t = this.peek();
      if (t?.type === 'op' && (t.value === '+' || t.value === '-')) {
        this.next();
        const right = this.parseMulDiv();
        left = this.m(t.value === '+' ? left + right : left - right);
      } else break;
    }
    return left;
  }

  private parseMulDiv(): bigint {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t?.type === 'op' && (t.value === '*' || t.value === '/' || t.value === '%')) {
        this.next();
        const right = this.parseUnary();
        if (t.value === '*') {
          left = this.m(left * right);
        } else {
          const a = toSigned(left, this.ws);
          const b = toSigned(right, this.ws);
          if (b === 0n) throw new ProgrammerError('DIV_ZERO', '除数为零');
          // ponytail: BigInt / and % truncate toward zero, matching Win Calculator.
          left = this.m(t.value === '/' ? a / b : a % b);
        }
      } else break;
    }
    return left;
  }

  private parseUnary(): bigint {
    const t = this.peek();
    if (t?.type === 'op' && (t.value === '~' || t.value === '-' || t.value === '+')) {
      this.next();
      const v = this.parseUnary();
      if (t.value === '~') return this.m(~v);
      if (t.value === '-') return this.m(-v);
      return v;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): bigint {
    const t = this.next();
    if (!t) throw new ProgrammerError('MISSING_OPERAND', '缺少操作数');
    if (t.type === 'num') {
      try { return this.m(BigInt(t.value)); }
      catch { throw new ProgrammerError('INVALID_DIGIT', `非法数字 "${t.value}"`); }
    }
    if (t.type === 'lparen') {
      const v = this.parseExpr();
      const close = this.next();
      if (close?.type !== 'rparen') throw new ProgrammerError('PAREN', '括号不匹配');
      return v;
    }
    throw new ProgrammerError('SYNTAX', `意外的符号 "${t.value}"`);
  }

  expectEnd(): void {
    if (this.pos < this.toks.length) {
      throw new ProgrammerError('SYNTAX', `未消费的输入: "${this.toks.slice(this.pos).map(t => t.value).join(' ')}"`);
    }
  }
}

// Internal values are UNSIGNED masked bit patterns (see semantics header).
export function evalProgrammer(expr: string, radix: Radix, wordSize: WordSize): bigint {
  if (!expr || !expr.trim()) throw new ProgrammerError('MISSING_OPERAND', '表达式为空');
  const toks = tokenize(expr, radix);
  if (toks.length === 0) throw new ProgrammerError('MISSING_OPERAND', '表达式为空');
  const p = new Parser(toks, wordSize);
  const result = p.parseExpr();
  p.expectEnd();
  return result;
}

export function radixRepr(unsigned: bigint, wordSize: WordSize): RadixRepr {
  return {
    hex: unsigned.toString(16).toUpperCase(),
    dec: toSigned(unsigned, wordSize).toString(10),
    oct: unsigned.toString(8),
    bin: unsigned.toString(2)
  };
}

export function primaryValue(unsigned: bigint, radix: Radix, wordSize: WordSize): string {
  if (radix === 10) return toSigned(unsigned, wordSize).toString(10);
  return unsigned.toString(radix).toUpperCase();
}

export function toRadix(decimal: string, wordSize: WordSize): RadixRepr {
  let s: bigint;
  try { s = BigInt(decimal.trim()); }
  catch { return { hex: '', dec: decimal, oct: '', bin: '' }; }
  return radixRepr(mask(s, wordSize), wordSize);
}
