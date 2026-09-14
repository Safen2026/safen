import "@supabase/functions-js/edge-runtime.d.ts";

// TypeScript workaround for VS Code without Deno extension
declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

// Supabase Edge Function: get-cloudinary-signature
//
// This function generates a secure SHA-1 signature for uploading files to Cloudinary,
// preventing the need to expose the unsigned upload_preset in the frontend bundle.
//
// Required secrets:
//   supabase secrets set CLOUDINARY_API_SECRET=your_api_secret
//   supabase secrets set CLOUDINARY_API_KEY=your_api_key
// Optional:
//   supabase secrets set SIGNATURE_ALLOWED_ORIGIN=https://your-web-origin
//   (only needed if a browser build ever calls this; the native app ignores CORS)
//
// Deploy:
//   supabase functions deploy get-cloudinary-signature

// CORS only governs browsers — curl and scripts ignore it — so it is not the
// access control here. The signed-in-user check below is. No wildcard origin.
const allowedOrigin = Deno.env.get('SIGNATURE_ALLOWED_ORIGIN');
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin, 'Vary': 'Origin' } : {}),
};

// Every value that goes into the signature is allowlisted. Without this a
// caller could smuggle extra signed parameters (e.g. public_id=x&overwrite=true)
// into the `key=value&...` string and get Cloudinary to honour them.
// Shapes mirror the callers in src/lib/cloudinary.ts, useAvatar, useEmergencyRecording.
const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const FOLDER_RE = /^(avatars|safen\/emergency_[A-Za-z0-9_-]{1,64})$/;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Resolves the caller's Supabase user from their access token. The anon /
 *  publishable key is not a user token, so it is rejected here. */
async function authedUserId(req: Request): Promise<string | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization');
  if (!supabaseUrl || !apiKey || !authHeader?.startsWith('Bearer ')) return null;

  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: apiKey, Authorization: authHeader },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  return typeof user?.id === 'string' ? user.id : null;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight request from the browser/app
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  try {
    const userId = await authedUserId(req);
    if (!userId) return json({ error: 'unauthorized' }, 401);

    const { public_id, folder } = await req.json();
    if (public_id !== undefined && (typeof public_id !== 'string' || !PUBLIC_ID_RE.test(public_id))) {
      return json({ error: 'invalid public_id' }, 400);
    }
    if (folder !== undefined && folder !== null && (typeof folder !== 'string' || !FOLDER_RE.test(folder))) {
      return json({ error: 'invalid folder' }, 400);
    }

    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY');

    if (!apiSecret || !apiKey) {
      console.error('Missing Cloudinary secrets');
      return json({ error: 'Cloudinary credentials not configured' }, 500);
    }

    const timestamp = Math.round(new Date().getTime() / 1000);

    // Cloudinary requires parameters to be sorted alphabetically before hashing
    const params: string[] = [];
    if (folder) params.push(`folder=${folder}`);
    if (public_id) params.push(`public_id=${public_id}`);
    params.push(`timestamp=${timestamp}`);

    const signatureString = params.join('&') + apiSecret;

    // Generate SHA-1 hash using standard Web Crypto API available in Deno
    const encoder = new TextEncoder();
    const data = encoder.encode(signatureString);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);

    // Convert buffer to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return json({ signature, timestamp, api_key: apiKey }, 200);

  } catch (err) {
    console.error('get-cloudinary-signature error:', err);
    return json({ error: 'bad request' }, 400);
  }
});
