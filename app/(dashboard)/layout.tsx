import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { JarvisButton } from "@/components/jarvis/JarvisButton";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <>
      <DashboardShell user={{ name: session.user.name, email: session.user.email }}>
        {children}
      </DashboardShell>
      <JarvisButton />
    </>
  );
}
