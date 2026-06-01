import { useCallback, useEffect, useState } from "react";

export type AppRoute =
  | "dashboard"
  | "emails"
  | "compose"
  | "chatbot"
  | "mail-access"
  | "sender-insights"
  | "sync-history"
  | "audit-center"
  | "team"
  | "tutorial";

const validRoutes = new Set<AppRoute>([
  "dashboard",
  "emails",
  "compose",
  "chatbot",
  "mail-access",
  "sender-insights",
  "sync-history",
  "audit-center",
  "team",
  "tutorial",
]);

function readRouteFromHash(): AppRoute {
  const route = window.location.hash.replace(/^#\/?/, "") as AppRoute;
  return validRoutes.has(route) ? route : "dashboard";
}

export function useHashRoute() {
  const [route, setRoute] = useState<AppRoute>(readRouteFromHash);

  useEffect(() => {
    function syncRoute() {
      setRoute(readRouteFromHash());
    }

    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  const navigate = useCallback((nextRoute: AppRoute) => {
    window.location.hash = `/${nextRoute}`;
  }, []);

  return { route, navigate };
}
