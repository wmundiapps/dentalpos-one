import { useSyncExternalStore } from "react";
import { Alert, LinearProgress, Snackbar } from "@mui/material";
import { dismissActionToast, getActionState, subscribeActions } from "../services/ActionFeedback";

export default function ActionFeedbackHost() {
  const s = useSyncExternalStore(subscribeActions, getActionState);
  return (
    <>
      {s.pending > 0 && <LinearProgress className="no-print" sx={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 2000, height: 3 }} />}
      <Snackbar
        key={s.toast?.id}
        open={!!s.toast}
        autoHideDuration={s.toast?.severity === "error" ? 6000 : 2200}
        onClose={(_, reason) => reason !== "clickaway" && dismissActionToast()}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert onClose={dismissActionToast} severity={s.toast?.severity || "success"} variant="filled" sx={{ width: "100%" }}>
          {s.toast?.message}
        </Alert>
      </Snackbar>
    </>
  );
}
