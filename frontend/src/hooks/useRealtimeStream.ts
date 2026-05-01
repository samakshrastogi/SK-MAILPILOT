import { useEffect, useRef } from "react";

import { openRealtimeStream } from "../api/realtime";
import type { RealtimeEvent } from "../types/email";

export function useRealtimeStream(onEvent: (event: RealtimeEvent) => void, enabled = true) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const eventSource = openRealtimeStream((event) => onEventRef.current(event));
    return () => {
      eventSource?.close();
    };
  }, [enabled]);
}
