import { useEffect, useState, useCallback } from "react";
import { get, del } from "@/api/client";
import { motion, AnimatePresence } from "motion/react";
import { X, AlertTriangle, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface Notification {
  id: string;
  message: string;
  time: string;
  type: "info" | "warning";
}

export function AdminNotificationBanner() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [visible, setVisible] = useState(false);

  const fetchNotifs = useCallback(async () => {
    if (!user?.is_admin) return;
    try {
      const data = await get<Notification[]>("/api/admin/notifications");
      if (data && data.length > 0) {
        setItems(data);
        setVisible(true);
      }
    } catch { /* ignore */ }
  }, [user?.is_admin]);

  useEffect(() => {
    fetchNotifs();
  }, [fetchNotifs]);

  const handleDismiss = async () => {
    setVisible(false);
    try { await del("/api/admin/notifications"); } catch { /* ignore */ }
    setItems([]);
  };

  if (!user?.is_admin || !visible || items.length === 0) return null;

  const hasWarning = items.some((i) => i.type === "warning");

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-0 left-0 right-0 z-[9999] px-4 pt-3 pointer-events-none"
        >
          <div
            className={`pointer-events-auto rounded-2xl border p-4 shadow-2xl backdrop-blur-md flex gap-3 items-start ${
              hasWarning
                ? "bg-amber-950/90 border-amber-500/30 text-amber-100"
                : "bg-emerald-950/90 border-emerald-500/30 text-emerald-100"
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {hasWarning
                ? <AlertTriangle className="size-4 text-amber-400" />
                : <CheckCircle className="size-4 text-emerald-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold mb-1.5 opacity-60">서버 점검 리포트</p>
              <ul className="space-y-1">
                {items.map((n) => (
                  <li key={n.id} className="text-sm leading-snug">
                    <span className="opacity-40 text-xs mr-2 font-mono">{n.time}</span>
                    {n.message}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={handleDismiss}
              className="shrink-0 rounded-lg p-1 hover:bg-white/10 transition-colors mt-0.5"
            >
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
