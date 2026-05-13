export const gm = (): Record<string, unknown> | undefined =>
  (window as unknown as Record<string, unknown>).graphmind as Record<string, unknown> | undefined;

type ApiFn = (...args: unknown[]) => Promise<unknown>;

class ApiNamespace {
  private readonly ns: Record<string, unknown>;
  constructor(ns: Record<string, unknown>) { this.ns = ns; }
  call(method: string, ...args: unknown[]): Promise<unknown> {
    const fn = this.ns[method];
    if (typeof fn !== 'function') return Promise.reject(new Error(`API method "${method}" not available`));
    return (fn as ApiFn)(...args);
  }
}

export function gmApi(namespace: string): ApiNamespace | undefined {
  const api = gm();
  if (!api) return undefined;
  const ns = api[namespace];
  if (!ns || typeof ns !== 'object') return undefined;
  return new ApiNamespace(ns as Record<string, unknown>);
}