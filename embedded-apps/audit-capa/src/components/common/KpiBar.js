import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

// One clickable segment of a compact KPI stat bar — icon badge + name + count,
// with a soft tinted background when it's the active filter.
export function KpiSegment({
    icon,
    label,
    value,
    color,
    active,
    onClick,
    isLast,
}) {
    return (
        <Box
            onClick={onClick}
            sx={{
                flex: "1 1 0",
                minWidth: 150,
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                px: 2,
                py: 1.5,
                cursor: onClick ? "pointer" : "default",
                borderRight: isLast ? "none" : "1px solid #EEF1F6",
                bgcolor: active ? `${color}1A` : "transparent",
                transition: "background-color 0.15s ease",
                "&:hover": onClick
                    ? {
                        bgcolor: `${color}0F`,
                    }
                    : undefined,
            }}
        >
            <Box
                sx={{
                    width: 34,
                    height: 34,
                    borderRadius: "10px",
                    flex: "none",
                    bgcolor: `${color}22`,
                    color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                {icon}
            </Box>

            <Box sx={{ minWidth: 0 }}>
                <Typography
                    sx={{
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        letterSpacing: "0.03em",
                        textTransform: "uppercase",
                        color: "text.secondary",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {label}
                </Typography>

                <Typography
                    sx={{
                        fontSize: "1.3rem",
                        fontWeight: 800,
                        color: "#0F172A",
                        lineHeight: 1.15,
                    }}
                >
                    {value}
                </Typography>
            </Box>
        </Box>
    );
}

// A section's worth of segments as one continuous card.
export function KpiBar({ children }) {
    return (
        <Box
            sx={{
                bgcolor: "#fff",
                borderRadius: 3,
                boxShadow: "0px 8px 20px rgba(15,23,42,0.06)",
                display: "flex",
                flexWrap: "wrap",
            }}
        >
            {children}
        </Box>
    );
}
