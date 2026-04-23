/**
 * Shared event key hook — persists to AsyncStorage so the key set
 * in Settings is available everywhere without prop-drilling.
 */
import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "coolfTC:activeEventKey";

let _listeners: ((key: string) => void)[] = [];
let _cached = "";

/** Subscribe to event key changes from any screen */
function subscribe(cb: (key: string) => void) {
  _listeners.push(cb);
  return () => { _listeners = _listeners.filter(l => l !== cb); };
}

/** Broadcast + persist a new event key */
async function broadcastKey(key: string) {
  _cached = key;
  await AsyncStorage.setItem(STORAGE_KEY, key);
  for (const l of _listeners) l(key);
}

export function useEventKey(): [string, (k: string) => Promise<void>] {
  const [eventKey, setLocal] = useState(_cached);

  useEffect(() => {
    // Load from storage on first mount
    if (!_cached) {
      AsyncStorage.getItem(STORAGE_KEY).then(v => {
        if (v) { _cached = v; setLocal(v); }
      });
    }
    // Subscribe to updates from other screens
    return subscribe(k => setLocal(k));
  }, []);

  const setEventKey = useCallback(async (key: string) => {
    setLocal(key);
    await broadcastKey(key);
  }, []);

  return [eventKey, setEventKey];
}
