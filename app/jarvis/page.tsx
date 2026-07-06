import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { JarvisCommandCenter } from "@/components/jarvis/JarvisCommandCenter";

export const metadata: Metadata = { title: "Jarvis" };

export default async function JarvisPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <JarvisCommandCenter />;
}
