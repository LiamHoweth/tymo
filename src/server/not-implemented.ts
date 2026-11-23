/** Placeholder used by contract stubs until the owning module implements them. */
export function notImplemented(name: string, ...args: unknown[]): never {
  void args;
  throw new Error(`${name} is not implemented yet`);
}
