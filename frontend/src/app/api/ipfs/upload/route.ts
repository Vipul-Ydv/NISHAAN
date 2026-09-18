import { NextResponse } from "next/server";

const PINATA_PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

/** Largest evidence file this route will forward to Pinata. */
const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

/** Fixed-window rate limit applied per client address. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_UPLOADS = 10;

/**
 * In-memory upload counters. This survives only as long as the server process,
 * so on a multi-instance or serverless deployment each instance keeps its own
 * window and the effective limit is per instance. It raises the cost of casual
 * abuse; it is not a substitute for a shared store or a gateway rate limit.
 */
const uploadWindows = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
        return forwarded.split(",")[0].trim();
    }
    return request.headers.get("x-real-ip") ?? "unknown";
}

function exceedsRateLimit(key: string): boolean {
    const now = Date.now();
    const window = uploadWindows.get(key);

    if (!window || now > window.resetAt) {
        uploadWindows.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return false;
    }

    window.count += 1;
    return window.count > RATE_LIMIT_MAX_UPLOADS;
}

/** Drops expired windows so the map cannot grow without bound. */
function pruneWindows(): void {
    const now = Date.now();
    for (const [key, window] of uploadWindows) {
        if (now > window.resetAt) {
            uploadWindows.delete(key);
        }
    }
}

/**
 * Pins an uploaded file to IPFS via Pinata.
 *
 * The Pinata credentials are read from server-only environment variables so they
 * are never included in the client bundle. The browser sends the file here and
 * receives only the resulting CID.
 *
 * NOTE: this route does not authenticate the caller. Anyone who can reach the
 * deployment can spend the project's Pinata quota. Restricting it to approved
 * wallets requires signature verification, which is tracked separately - see
 * Known Limitations in the README.
 */
export async function POST(request: Request) {
    const apiKey = process.env.PINATA_API_KEY;
    const secretApiKey = process.env.PINATA_SECRET_API_KEY;

    if (!apiKey || !secretApiKey) {
        return NextResponse.json(
            { error: "Pinata credentials are not configured. Set PINATA_API_KEY and PINATA_SECRET_API_KEY in frontend/.env.local." },
            { status: 500 }
        );
    }

    pruneWindows();
    if (exceedsRateLimit(clientKey(request))) {
        return NextResponse.json(
            { error: "Too many uploads. Try again in a minute." },
            { status: 429, headers: { "Retry-After": "60" } }
        );
    }

    // Reject oversized bodies before buffering the multipart payload.
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_FILE_BYTES) {
        return NextResponse.json(
            { error: `File exceeds the ${MAX_FILE_BYTES / (1024 * 1024)} MB limit.` },
            { status: 413 }
        );
    }

    let file: File | null = null;
    try {
        const incoming = await request.formData();
        const candidate = incoming.get("file");
        if (candidate instanceof File) {
            file = candidate;
        }
    } catch {
        return NextResponse.json({ error: "Request body must be multipart/form-data." }, { status: 400 });
    }

    if (!file) {
        return NextResponse.json({ error: "No file provided under the 'file' field." }, { status: 400 });
    }

    // Content-Length can be absent or understated, so check the parsed file too.
    if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
            { error: `File exceeds the ${MAX_FILE_BYTES / (1024 * 1024)} MB limit.` },
            { status: 413 }
        );
    }

    if (file.size === 0) {
        return NextResponse.json({ error: "File is empty." }, { status: 400 });
    }

    const outgoing = new FormData();
    outgoing.append("file", file);

    try {
        const res = await fetch(PINATA_PIN_FILE_URL, {
            method: "POST",
            headers: {
                pinata_api_key: apiKey,
                pinata_secret_api_key: secretApiKey,
            },
            body: outgoing,
        });

        if (!res.ok) {
            // Surface Pinata's status but not the credentials or raw upstream body.
            const detail = await res.text().catch(() => "");
            console.error(`Pinata upload failed (${res.status}): ${detail}`);
            return NextResponse.json(
                { error: `IPFS upload failed with status ${res.status}.` },
                { status: 502 }
            );
        }

        const { IpfsHash } = await res.json();
        if (!IpfsHash) {
            return NextResponse.json({ error: "Pinata response did not include a CID." }, { status: 502 });
        }

        return NextResponse.json({ IpfsHash });
    } catch (err) {
        console.error("Pinata upload error:", err);
        return NextResponse.json({ error: "Could not reach the IPFS pinning service." }, { status: 502 });
    }
}
