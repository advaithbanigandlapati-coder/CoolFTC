/**
 * CoolFTC — Push Notifications Hook (mobile)
 * apps/mobile/lib/usePushNotifications.ts
 *
 * Call once from _layout.tsx after auth is confirmed.
 * Registers the device token with the coolfTC backend.
 * Shows in-app notification banners for foreground messages.
 */

import { useEffect, useRef } from "react";
import { Platform, Alert } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { supabase } from "./supabase";

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

// How to display notifications when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications(opts: {
  orgId: string;
  eventKey: string;
  myTeam: string;
}) {
  const { orgId, eventKey, myTeam } = opts;
  const listenerRef = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (!orgId || !eventKey) return;

    async function register() {
      // Physical device check
      if (!Device.isDevice) return;

      // Request permission
      const { status: existing } = await Notifications.getPermissionsAsync();
      const finalStatus = existing === "granted"
        ? existing
        : (await Notifications.requestPermissionsAsync()).status;

      if (finalStatus !== "granted") return;

      // Android notification channel
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("coolfTC", {
          name: "coolfTC Alerts",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF5A1F",
        });
      }

      // Get Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
      });
      const token = tokenData.data;

      // Get auth user + session
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      // Register with backend
      await fetch(`${API_BASE}/api/push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          action: "register",
          token,
          platform: Platform.OS,
          orgId,
          eventKey,
          myTeam: myTeam || null,
        }),
      });
    }

    register().catch(console.warn);

    // Listen for foreground notifications
    listenerRef.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        const { title, body } = notification.request.content;
        // Could replace with a toast library for a cleaner look
        if (title && body) Alert.alert(title, body);
      }
    );

    return () => {
      listenerRef.current?.remove();
    };
  }, [orgId, eventKey, myTeam]);
}
