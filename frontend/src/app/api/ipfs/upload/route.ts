import { NextResponse } from "next/server";

const PINATA_PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

/**
 * Pins an uploaded file to IPFS via Pinata.
 *
 * The Pinata credentials are read from server-only environment variables so they
 * are never included in the client bundle. The browser sends the file here and
 * receives only the resulting CID.
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
