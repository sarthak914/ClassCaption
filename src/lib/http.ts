import { NextResponse } from "next/server";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function fail(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: (e as Error)?.message ?? "Internal error" }, { status: 500 });
}

/** Wraps a route handler so thrown errors become JSON `{ error }` responses. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      return fail(e);
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

export function need<T>(v: T | null | undefined, msg: string): T {
  if (v === undefined || v === null || v === "") throw new HttpError(400, msg);
  return v;
}

/** Next 15 passes dynamic params as a Promise. */
export type Ctx<P> = { params: Promise<P> };
