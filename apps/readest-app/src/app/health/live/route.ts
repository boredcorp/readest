export const dynamic = 'force-static';

export function GET(): Response {
  return Response.json(
    {
      ok: true,
      service: 'storybored-reader',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
