export function identityKey(identity: string) {
  return identity.trim().replace(/\.jolt$/i, "").toLowerCase();
}

export function sameIdentity(left: string, right: string) {
  return identityKey(left) === identityKey(right);
}
