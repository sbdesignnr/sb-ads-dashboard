import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Share_Tech_Mono } from "next/font/google";
import { auth } from "@/auth";
import { JarvisCommandCenter } from "@/components/jarvis/JarvisCommandCenter";

const mono = Share_Tech_Mono({ weight: "400", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = { title: "Jarvis" };

export default async function JarvisPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return (
    <div className={mono.className}>
      <JarvisCommandCenter />
    </div>
  );
}
