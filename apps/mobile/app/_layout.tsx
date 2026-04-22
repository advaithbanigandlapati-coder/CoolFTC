import { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { supabase } from "../lib/supabase";
import { useRouter, useSegments, usePathname } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  // Track if signup is actively completing setup — prevents the listener from
  // racing ahead and redirecting before org_members is written.
  const signingUp = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const inApp  = segments[0] === "(app)";
      const inAuth = segments[0] === "(auth)";

      if (!session && inApp) {
        router.replace("/(auth)/login");
        return;
      }

      // Don't redirect during active signup — signup.tsx handles navigation
      // itself after org + org_members are fully written.
      if (session && inAuth) {
        const onSignupPage = pathname?.includes("signup");
        if (onSignupPage) {
          // Let signup.tsx call router.replace("/(app)") itself
          return;
        }
        router.replace("/(app)");
      }
    });
    return () => subscription.unsubscribe();
  }, [segments, pathname]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthGuard>
        <StatusBar style="light" backgroundColor="#07070A" />
        <Stack screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#07070A" },
          animation: "slide_from_right",
        }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
      </AuthGuard>
    </GestureHandlerRootView>
  );
}
