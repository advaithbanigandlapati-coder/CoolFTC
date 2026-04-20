import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { supabase } from "../lib/supabase";
import { useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const inApp = segments[0] === "(app)";
      const inAuth = segments[0] === "(auth)";
      if (!session && inApp) router.replace("/(auth)/login");
      if (session && inAuth) router.replace("/(app)");
    });
    return () => subscription.unsubscribe();
  }, [segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthGuard>
        <StatusBar style="light" backgroundColor="#07070A" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#07070A" }, animation: "slide_from_right" }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </AuthGuard>
    </GestureHandlerRootView>
  );
}
