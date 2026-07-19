// Re-export the shared Key component under the legacy KeypadButton name so
// existing imports keep working. New code should import { Key } from './Key'.

export { Key as KeypadButton } from './Key';
export type { KeyProps as KeypadButtonProps, KeyVariant } from './Key';