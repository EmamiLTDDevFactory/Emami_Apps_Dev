import {
    Card,
    CardContent,
    Typography,
} from "@mui/material";
import Box from "@mui/material/Box";

export default function KpiCard({
    title,
    value,
    color,
    icon,
}) {
    return (
        <Card
            sx={{
                borderLeft: `5px solid ${color}`,
                boxShadow: 2,
                height: "100%",
            }}
        >
            <CardContent>
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <Box>
                    <Typography
                        color="text.secondary"
                    >
                        {title}
                    </Typography>

                    <Typography
                        variant="h4"
                        fontWeight="bold"
                    >
                        {value}
                    </Typography>
                    </Box>
                    {icon}
                </Box>
            </CardContent>
        </Card>
    );
}