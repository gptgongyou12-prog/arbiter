"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ContextMenuProps {
  children: React.ReactNode;
}

interface ContextMenuTriggerProps {
  children: React.ReactNode;
  asChild?: boolean;
}

interface ContextMenuContentProps {
  children: React.ReactNode;
  className?: string;
}

interface ContextMenuItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

const ContextMenuContext = React.createContext<{
  open: boolean;
  x: number;
  y: number;
  setOpen: (v: boolean) => void;
  setPos: (x: number, y: number) => void;
}>({ open: false, x: 0, y: 0, setOpen: () => {}, setPos: () => {} });

function ContextMenu({ children }: ContextMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });

  const setOpenFn = React.useCallback((v: boolean) => setOpen(v), []);
  const setPosFn = React.useCallback((x: number, y: number) => setPos({ x, y }), []);

  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, [open]);

  return (
    <ContextMenuContext.Provider value={{ open, x: pos.x, y: pos.y, setOpen: setOpenFn, setPos: setPosFn }}>
      <div style={{ position: "relative" }}>{children}</div>
    </ContextMenuContext.Provider>
  );
}

function ContextMenuTrigger({ children, asChild }: ContextMenuTriggerProps) {
  const { setOpen, setPos } = React.useContext(ContextMenuContext);
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPos(e.clientX, e.clientY);
    setOpen(true);
  };
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, { onContextMenu: handleContextMenu });
  }
  return <div onContextMenu={handleContextMenu}>{children}</div>;
}

function ContextMenuContent({ children, className }: ContextMenuContentProps) {
  const { open, x, y } = React.useContext(ContextMenuContext);
  if (!open) return null;
  return (
    <div
      className={cn(
        "fixed z-50 min-w-[140px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
        className
      )}
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function ContextMenuItem({ children, onClick, className }: ContextMenuItemProps) {
  const { setOpen } = React.useContext(ContextMenuContext);
  return (
    <div
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        className
      )}
      onClick={() => {
        setOpen(false);
        onClick?.();
      }}
    >
      {children}
    </div>
  );
}

export { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem };
