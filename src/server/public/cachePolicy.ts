export const PUBLIC_CACHE_POLICIES = Object.freeze({
  apiHealth: {
    header: 'public, max-age=0, s-maxage=5, stale-while-revalidate=30',
    sMaxAge: 5,
    staleWhileRevalidate: 30,
  },
  assets: {
    header: 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
    sMaxAge: 300,
    staleWhileRevalidate: 600,
  },
  browseSearch: {
    header: 'public, max-age=15, s-maxage=60, stale-while-revalidate=180',
    sMaxAge: 60,
    staleWhileRevalidate: 180,
  },
  browseHome: {
    header: 'public, max-age=30, s-maxage=120, stale-while-revalidate=300',
    sMaxAge: 120,
    staleWhileRevalidate: 300,
  },
  browseDetail: {
    header: 'public, max-age=15, s-maxage=60, stale-while-revalidate=180',
    sMaxAge: 60,
    staleWhileRevalidate: 180,
  },
  browseNews: {
    header: 'public, max-age=30, s-maxage=120, stale-while-revalidate=600',
    sMaxAge: 120,
    staleWhileRevalidate: 600,
  },
  browseOverview: {
    header: 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
    sMaxAge: 300,
    staleWhileRevalidate: 900,
  },
  publicOhlcv: {
    header: 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
    sMaxAge: 300,
    staleWhileRevalidate: 900,
  },
  publicToday: {
    header: 'public, max-age=15, s-maxage=15, stale-while-revalidate=45',
    sMaxAge: 15,
    staleWhileRevalidate: 45,
  },
});
