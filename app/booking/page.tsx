"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getISODay,
  isBefore,
  startOfMonth,
  startOfToday,
} from "date-fns";

interface Config {
  availableDays: number[];
  duration: number;
  ownerName: string;
  meetingTitle: string;
}

const WEEKDAYS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
const MONTHS_SK = [
  "január", "február", "marec", "apríl", "máj", "jún",
  "júl", "august", "september", "október", "november", "december",
];

function fmtDay(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const wd = ["nedeľa", "pondelok", "utorok", "streda", "štvrtok", "piatok", "sobota"][d.getUTCDay()];
  return `${wd}, ${d.getUTCDate()}. ${MONTHS_SK[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function Month({
  monthStart,
  availableDays,
  selected,
  onPick,
}: {
  monthStart: Date;
  availableDays: number[];
  selected: string | null;
  onPick: (dateStr: string) => void;
}) {
  const today = startOfToday();
  const days = eachDayOfInterval({ start: startOfMonth(monthStart), end: endOfMonth(monthStart) });
  const leadBlanks = getISODay(startOfMonth(monthStart)) - 1; // Mon=0 offset

  return (
    <div>
      <p className="mb-2 text-center text-sm font-semibold text-gray-800">
        {MONTHS_SK[monthStart.getMonth()]} {monthStart.getFullYear()}
      </p>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadBlanks }, (_, i) => <div key={`b${i}`} />)}
        {days.map((d) => {
          const dateStr = format(d, "yyyy-MM-dd");
          const past = isBefore(d, today);
          const working = availableDays.includes(getISODay(d));
          const enabled = !past && working;
          const isSel = selected === dateStr;
          return (
            <button
              key={dateStr}
              type="button"
              disabled={!enabled}
              onClick={() => onPick(dateStr)}
              className={
                "aspect-square rounded-lg text-sm transition-colors " +
                (isSel
                  ? "bg-blue-600 font-semibold text-white"
                  : enabled
                    ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "cursor-not-allowed text-gray-300")
              }
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function BookingPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const availableDays = useMemo(() => config?.availableDays ?? [1, 2, 3, 4, 5], [config]);
  const thisMonth = startOfMonth(new Date());

  useEffect(() => {
    fetch("/api/booking/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  const pickDate = async (dateStr: string) => {
    setDate(dateStr);
    setSlot(null);
    setLoadingSlots(true);
    try {
      const j = await fetch(`/api/booking/slots?date=${dateStr}`).then((r) => r.json());
      setSlots(j.slots ?? []);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/booking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          startTime: slot,
          clientName: name,
          clientEmail: email,
          clientPhone: phone || undefined,
          clientCompany: company || undefined,
          message: message || undefined,
        }),
      });
      const j = await res.json();
      if (res.ok && j.booking) {
        setDone(true);
      } else {
        setError(
          j.error === "slot_taken" || j.error === "slot_unavailable"
            ? "Tento termín už nie je voľný. Vyberte prosím iný."
            : "Rezerváciu sa nepodarilo dokončiť. Skúste to znova.",
        );
        if (j.error === "slot_taken" || j.error === "slot_unavailable") pickDate(date);
      }
    } catch {
      setError("Rezerváciu sa nepodarilo dokončiť. Skúste to znova.");
    } finally {
      setSubmitting(false);
    }
  };

  const duration = config?.duration ?? 30;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 text-gray-900" style={{ colorScheme: "light" }}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <p className="text-sm font-bold tracking-wide text-blue-600">SB DESIGN</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">Dohodnite si hovor so Samuelom Bibeňom</h1>
          <p className="mt-2 text-gray-500">Online konzultácia • {duration} minút • Zadarmo</p>
        </div>

        {done ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-2xl">
              ✅
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Termín potvrdený!</h2>
            <p className="mt-2 text-gray-600">
              Potvrdenie sme Vám poslali na <strong>{email}</strong>.
            </p>
            {date && slot && (
              <p className="mt-3 text-sm text-gray-500">
                {fmtDay(date)} o {slot}
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Step 1 — date */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="mb-4 text-sm font-semibold text-gray-500">1. Vyberte dátum</p>
              <div className="space-y-6">
                <Month monthStart={thisMonth} availableDays={availableDays} selected={date} onPick={pickDate} />
                <Month monthStart={addMonths(thisMonth, 1)} availableDays={availableDays} selected={date} onPick={pickDate} />
              </div>
            </div>

            {/* Step 2 + 3 — time & form */}
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              {!date ? (
                <p className="py-10 text-center text-sm text-gray-400">Najprv vyberte dátum vľavo.</p>
              ) : !slot ? (
                <>
                  <p className="mb-1 text-sm font-semibold text-gray-500">2. Vyberte čas</p>
                  <p className="mb-4 text-sm text-gray-800">{fmtDay(date)}</p>
                  {loadingSlots ? (
                    <p className="py-8 text-center text-sm text-gray-400">Načítavam voľné termíny…</p>
                  ) : slots.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-400">V tento deň nie sú voľné termíny.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {slots.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSlot(s)}
                          className="rounded-lg border border-blue-200 bg-blue-50 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-600 hover:text-white"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <form onSubmit={submit} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-500">3. Vaše údaje</p>
                    <button type="button" onClick={() => setSlot(null)} className="text-xs text-blue-600 hover:underline">
                      ← zmeniť čas
                    </button>
                  </div>
                  <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                    {fmtDay(date)} o <strong>{slot}</strong> ({duration} min)
                  </p>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Meno a priezvisko *"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email *"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Telefón (nepovinné)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Firma (nepovinné)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    placeholder="Dôvod hovoru (nepovinné)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                  >
                    {submitting ? "Potvrdzujem…" : "Potvrdiť termín"}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
