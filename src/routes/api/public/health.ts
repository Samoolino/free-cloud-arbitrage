import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/health')({
  server: {
    handlers: {
      GET: () => {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        return Response.json({
          ok: true,
          service: 'free-cloud-arbitrage',
          auth: {
            configured: Boolean(supabaseUrl && supabaseKey),
            url_configured: Boolean(supabaseUrl),
            publishable_key_configured: Boolean(supabaseKey),
          },
          timestamp: new Date().toISOString(),
        });
      },
    },
  },
});
