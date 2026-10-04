import { useEffect, useState } from "react";
import { Alert, Snackbar } from "@mui/material";
import { TOAST_EVENT, type ToastDetail } from "../utils/toast";

export default function ToastHost() {
  const [item, setItem] = useState<(ToastDetail & { id: number }) | null>(null);
  useEffect(() => {
    const onToast = (event: Event) => setItem({ ...(event as CustomEvent<ToastDetail>).detail, id: Date.now() });
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);
  return (
    <Snackbar
      key={item?.id}
      open={Boolean(item)}
      autoHideDuration={item?.kind === "error" ? 9000 : 4500}
      onClose={(_, reason) => { if (reason !== "clickaway") setItem(null); }}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert severity={item?.kind || "success"} variant="filled" onClose={() => setItem(null)} sx={{ width: "100%", fontWeight: 700, maxWidth: 560 }}>
        {item?.message}
      </Alert>
    </Snackbar>
  );
}
