const AVATAR_GRADIENTS = ['from-rust to-rustLight', 'from-teal to-rust', 'from-amber to-rust', 'from-blue to-rustLight'];

export function avatarGradient(id?: string) {
  let hash = 0;
  for (const ch of id || '') hash = (hash * 31 + ch.charCodeAt(0)) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[hash];
}
