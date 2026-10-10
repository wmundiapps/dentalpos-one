import { useState } from "react";
import { Fab } from "@mui/material";
import FeedbackOutlinedIcon from "@mui/icons-material/FeedbackOutlined";
import FeedbackDialog from "./FeedbackDialog";

/** Botão fixo em todas as telas: relatar bug, sugestão, correção ou botão que não funciona. */
export default function FeedbackFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Fab
        className="no-print"
        size="small"
        color="warning"
        variant="extended"
        aria-label="Relatar problema ou sugestão"
        onClick={() => setOpen(true)}
        sx={{ position: "fixed", right: { xs: 16, md: 24 }, bottom: { xs: 80, md: 88 }, zIndex: 1299, textTransform: "none", fontWeight: 700, boxShadow: 6 }}
      >
        <FeedbackOutlinedIcon fontSize="small" sx={{ mr: 0.75 }} />
        Feedback
      </Fab>
      <FeedbackDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
