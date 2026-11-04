import { NextResponse } from "next/server";

import { kofiConnected, parseKofiDelivery } from "@/lib/kofi";
import { receiveKofiGift } from "@/lib/donations";
import { limitedBody, RequestBodyTooLarge } from "@/lib/request-body";

/**
 * Ko-fi's webhook: each payment, as it happens, into the donation bin.
 *
 * Reachable without a session — Ko-fi has none — so the verification token in
 * the payload is the whole of the authorisation; see `src/lib/kofi.ts`.
 * Point Ko-fi at `<APP_URL>/api/kofi` and set `KOFI_VERIFICATION_TOKEN`.
 *
 * Ko-fi retries anything not answered 200, so the answers are chosen for
 * that: 200 for everything it should stop sending (including a payment
 * already counted, or one that is not a gift), 500 only when the database
 * failed and a retry could succeed. A forged or malformed body gets a 4xx it
 * will never turn into a 200 by retrying.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A real delivery is a few hundred bytes; shop orders with items, a few KB. */
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(request: Request) {
  if (!kofiConnected()) return new NextResponse(null, { status: 404 });
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/x-www-form-urlencoded") {
    return new NextResponse(null, { status: 415 });
  }

  let data: FormDataEntryValue | null;
  try {
    const body = await limitedBody(request, MAX_BODY_BYTES);
    data = new URLSearchParams(new TextDecoder().decode(body)).get("data");
  } catch (error) {
    if (error instanceof RequestBodyTooLarge) return new NextResponse(null, { status: 413 });
    data = null;
  }

  const delivery = parseKofiDelivery(data);
  switch (delivery.kind) {
    // As far as any caller can tell, there is no such endpoint.
    case "off":
      return new NextResponse(null, { status: 404 });
    case "forged":
      console.warn("[kofi] refused a delivery with the wrong verification token");
      return new NextResponse(null, { status: 401 });
    case "malformed":
      return new NextResponse(null, { status: 400 });
    case "ignored":
      return NextResponse.json({ ok: true, outcome: "ignored" });
  }

  try {
    const outcome = await receiveKofiGift(delivery.gift);
    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    console.error("[kofi] could not record a payment; Ko-fi will retry", error);
    return new NextResponse(null, { status: 500 });
  }
}
