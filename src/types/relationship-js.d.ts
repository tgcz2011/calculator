// ponytail (TGC-22, module 4): ambient declaration for the `relationship.js`
// npm package. The package ships as ESM JS only — no TypeScript types. The
// default export is a function with an `options` API documented at
// https://passer-by.com/relationship/. This declaration is intentionally
// minimal: only the methods the calculator UI actually calls.

declare module 'relationship.js' {
  export type KinMode = 'default' | 'greatway-north' | 'greatway-south';
  export type KinType = 'default' | 'chain' | 'pair';
  export interface KinOptions {
    text?: string;
    target?: string;
    sex?: 0 | 1;
    type?: KinType;
    reverse?: boolean;
    mode?: KinMode;
    optimal?: boolean;
  }
  export type KinResult = string[];
  const relationship: (opts: KinOptions) => KinResult;
  export default relationship;
}