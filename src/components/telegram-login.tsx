import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

// Public env: Telegram bot username (without @) used by the login widget.
const BOT_USERNAME = (import.meta as { env?: Record<string, string | undefined> }).env
  ?.VITE_TELEGRAM_BOT_USERNAME;

type TgUser = {
  id: number; first_name: string; last_name?: string; username?: string;
  photo_url?: string; auth_date: number; hash: string;
};

declare global { interface Window { onTelegramAuth?: (u: TgUser) => void } }

export function TelegramLoginButton() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (!BOT_USERNAME || !containerRef.current) return;
    window.onTelegramAuth = async (tgUser: TgUser) => {
      setBusy(true);
      try {
        const res = await fetch("/api/public/telegram/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tgUser),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Telegram login failed");
        const { error } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (error) throw error;
        toast.success("Signed in with Telegram");
        nav({ to: "/dashboard" });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Telegram login failed");
      } finally {
        setBusy(false);
      }
    };
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.setAttribute("data-telegram-login", BOT_USERNAME);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "8");
    s.setAttribute("data-onauth", "onTelegramAuth(user)");
    s.setAttribute("data-request-access", "write");
    containerRef.current.appendChild(s);
    return () => { containerRef.current?.replaceChildren(); };
  }, [nav]);

  if (!BOT_USERNAME) {
    return (
      <Button type="button" variant="outline" className="w-full" disabled title="Set VITE_TELEGRAM_BOT_USERNAME">
        Telegram login (configure bot)
      </Button>
    );
  }
  return (
    <div className="flex items-center justify-center">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <div ref={containerRef} />}
    </div>
  );
}
