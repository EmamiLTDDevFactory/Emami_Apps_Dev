import { useCallback, useEffect, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Snackbar,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import InfoIcon from "@mui/icons-material/Info";

// App-wide replacement for the browser's alert()/confirm():
//   showMessage(text, "success" | "info")    -> top-centre banner, closes itself after 4s
//   showMessage(text, "error" | "warning")   -> centred message box with an OK button
//   await confirmBox({ title, message, ... }) -> Yes/Cancel dialog, resolves true/false
// They're plain functions (not hooks) so any handler can call them. MessageProvider is mounted
// once above all routes (App.js), so a message survives a navigate() right after it.

let api = null;

export const showMessage = (text, type = "info") => {
    if (api) api.show(String(text ?? ""), type);
    else window.alert(text); // provider not mounted (shouldn't happen) - never lose a message
};

export const confirmBox = ({
    title = "Please confirm",
    message = "",
    confirmText = "Yes",
    cancelText = "Cancel",
    confirmColor = "primary",
} = {}) =>
    api
        ? api.confirm({ title, message, confirmText, cancelText, confirmColor })
        : Promise.resolve(window.confirm(message));

const BOX_STYLE = {
    error: { title: "Something went wrong", color: "#DC2626", Icon: ErrorIcon },
    warning: { title: "Please check", color: "#D97706", Icon: WarningAmberIcon },
};

const BANNER_ICON = {
    success: <CheckCircleIcon fontSize="inherit" />,
    info: <InfoIcon fontSize="inherit" />,
};

export function MessageProvider({ children }) {
    const [banner, setBanner] = useState(null); // { id, text, type }
    const [box, setBox] = useState(null); // { text, type }
    const [confirmState, setConfirmState] = useState(null); // { ...opts, resolve }
    const confirmResolve = useRef(null);

    const show = useCallback((text, type) => {
        if (type === "error" || type === "warning") {
            setBox({ text, type });
        } else {
            setBanner({ id: Date.now(), text, type: type === "success" ? "success" : "info" });
        }
    }, []);

    const confirm = useCallback(
        (opts) =>
            new Promise((resolve) => {
                // A still-open confirm is answered "no" rather than left hanging.
                if (confirmResolve.current) confirmResolve.current(false);
                confirmResolve.current = resolve;
                setConfirmState(opts);
            }),
        []
    );

    useEffect(() => {
        api = { show, confirm };
        return () => {
            api = null;
        };
    }, [show, confirm]);

    const answerConfirm = (answer) => {
        if (confirmResolve.current) confirmResolve.current(answer);
        confirmResolve.current = null;
        setConfirmState(null);
    };

    const boxStyle = box ? BOX_STYLE[box.type] : null;

    return (
        <>
            {children}

            <Snackbar
                key={banner?.id}
                open={Boolean(banner)}
                autoHideDuration={4000}
                onClose={(_, reason) => {
                    if (reason !== "clickaway") setBanner(null);
                }}
                anchorOrigin={{ vertical: "top", horizontal: "center" }}
            >
                {banner ? (
                    <Alert
                        variant="filled"
                        severity={banner.type}
                        icon={BANNER_ICON[banner.type]}
                        onClose={() => setBanner(null)}
                        sx={{ minWidth: 320, boxShadow: 3, alignItems: "center" }}
                    >
                        {banner.text}
                    </Alert>
                ) : (
                    <span />
                )}
            </Snackbar>

            <Dialog open={Boolean(box)} onClose={() => setBox(null)} maxWidth="xs" fullWidth>
                {boxStyle && (
                    <>
                        <DialogTitle
                            sx={{ display: "flex", alignItems: "center", gap: 1, color: boxStyle.color }}
                        >
                            <boxStyle.Icon />
                            {boxStyle.title}
                        </DialogTitle>
                        <DialogContent>
                            <DialogContentText sx={{ color: "text.primary", whiteSpace: "pre-line" }}>
                                {box.text}
                            </DialogContentText>
                        </DialogContent>
                        <DialogActions>
                            <Button variant="contained" onClick={() => setBox(null)} autoFocus>
                                OK
                            </Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>

            <Dialog open={Boolean(confirmState)} onClose={() => answerConfirm(false)} maxWidth="xs" fullWidth>
                {confirmState && (
                    <>
                        <DialogTitle>{confirmState.title}</DialogTitle>
                        <DialogContent>
                            <DialogContentText sx={{ color: "text.primary", whiteSpace: "pre-line" }}>
                                {confirmState.message}
                            </DialogContentText>
                        </DialogContent>
                        <DialogActions>
                            <Box sx={{ flex: 1 }} />
                            <Button onClick={() => answerConfirm(false)}>{confirmState.cancelText}</Button>
                            <Button
                                variant="contained"
                                color={confirmState.confirmColor}
                                onClick={() => answerConfirm(true)}
                                autoFocus
                            >
                                {confirmState.confirmText}
                            </Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>
        </>
    );
}
