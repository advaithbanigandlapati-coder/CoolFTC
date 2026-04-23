// Root redirect — unauthenticated → /login, authenticated → /app
import { redirect } from "next/navigation";
export default function Root() { redirect("/login"); }
