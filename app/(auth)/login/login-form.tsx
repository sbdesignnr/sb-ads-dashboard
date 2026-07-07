"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Lock, Mail, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_ATTEMPTS = 5;

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const locked = attempts >= MAX_ATTEMPTS;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (locked || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (res?.error) {
        const next = attempts + 1;
        setAttempts(next);
        setError(
          next >= MAX_ATTEMPTS
            ? "Príliš veľa neúspešných pokusov. Skúste o niekoľko minút."
            : "Nesprávny email alebo heslo.",
        );
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Prihlásenie zlyhalo. Skúste to znova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl border border-border bg-surface/80 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl"
    >
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-lg font-bold text-white shadow-lg shadow-primary/30">
          SB
        </div>
        <h1 className="text-xl font-semibold text-foreground">Ads Analytics Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Prihláste sa do svojho účtu SB Design</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vas@email.sk"
              className="pl-9"
              disabled={loading || locked}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Heslo</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="pl-9 pr-9"
              disabled={loading || locked}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground cursor-pointer"
              aria-label={showPassword ? "Skryť heslo" : "Zobraziť heslo"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {error}
          </motion.p>
        )}

        <Button
          type="submit"
          variant="gradient"
          size="lg"
          className="w-full"
          disabled={loading || locked}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Prihlasujem…
            </>
          ) : (
            "Prihlásiť sa"
          )}
        </Button>
      </form>
    </motion.div>
  );
}
