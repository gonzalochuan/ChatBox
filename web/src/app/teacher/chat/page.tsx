"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@/store/useConnection";
import { fetchMe } from "@/lib/api";
import { SERVER_URL } from "@/lib/config";
import ChatPage from "@/app/chat/page";

export default function TeacherChatPage() {
  const { mode, baseUrl } = useConnection();
  const [authorized, setAuthorized] = useState<null | boolean>(null);

  useEffect(() => {
    (async () => {
      try {
        const target = baseUrl || SERVER_URL;
        const me = await fetchMe(target);
        const roles: string[] = me?.user?.roles || [];
        setAuthorized(roles.includes("TEACHER") || roles.includes("ADMIN"));
      } catch {
        setAuthorized(false);
      }
    })();
  }, [mode, baseUrl]);

  if (authorized === null) {
    return <div className="p-6 text-white/70">Checking access…</div>;
  }
  if (!authorized) {
    return <div className="p-6 text-red-300">Not authorized. Teacher role required.</div>;
  }

  return <ChatPage />;
}
