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
//
// Deploy:
//   supabase functions deploy get-cloudinary-signature

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight request from the browser/app
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { public_id, folder } = await req.json();
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY');

    if (!apiSecret || !apiKey) {
      console.error('Missing Cloudinary secrets');
      return new Response(
        JSON.stringify({ error: 'Cloudinary credentials not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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

    return new Response(
      JSON.stringify({ signature, timestamp, api_key: apiKey }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (err) {
    console.error('get-cloudinary-signature error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
